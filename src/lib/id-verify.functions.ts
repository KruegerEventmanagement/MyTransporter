import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const AiSchema = z.object({
  documentClass: z.enum([
    "german_id_card",
    "german_drivers_license",
    "eu_id_card",
    "eu_drivers_license",
    "other_id_card",
    "other_drivers_license",
    "other",
  ]).describe("Erkannter Dokumenttyp"),
  side: z.enum(["front", "back", "unknown"]).describe("Erkannte Seite"),
  readable: z.boolean().describe("Sind die Angaben klar lesbar?"),
  blurry: z.boolean().describe("Ist das Bild unscharf/verwackelt?"),
  firstName: z.string().nullable().describe("Vorname(n) wie auf dem Dokument (Given names)"),
  lastName: z.string().nullable().describe("Nachname / Familienname wie auf dem Dokument (Surname)"),
  documentNumber: z.string().nullable(),
  expiryDate: z.string().nullable().describe("Ablaufdatum, ISO-Format wenn möglich"),
  securityFeaturesVisible: z.boolean().describe("Sind Sicherheitsmerkmale wie Chip, MRZ, Hologramm oder EU-Sterne sichtbar?"),
  looksAuthentic: z.boolean().describe("Sieht das Dokument echt aus (keine Spielkarte, Kopie mit Wasserzeichen, offensichtliches Fake)?"),
  rejectionReason: z.string().nullable(),
});

export type IdVerifyResult = {
  ok: boolean;
  reason: string | null;
  extractedName: string | null;
  documentClass: string | null;
  side: string | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Diakritika
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameMatches(profileFirst: string, profileLast: string, docFirst: string | null, docLast: string | null): boolean {
  const pf = normalize(profileFirst);
  const pl = normalize(profileLast);
  const df = docFirst ? normalize(docFirst) : "";
  const dl = docLast ? normalize(docLast) : "";
  const all = `${df} ${dl}`.trim();
  if (!pf || !pl || !all) return false;
  const firstTokens = pf.split(" ").filter(Boolean);
  // Mindestens ein Vorname aus dem Profil muss im Dokument stehen
  const firstOk = firstTokens.some((t) => all.includes(t));
  const lastOk = all.includes(pl);
  return firstOk && lastOk;
}

export const verifyIdDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageBase64: string; docType: "license" | "id"; side: "front" | "back" }) => {
    if (!data.imageBase64) throw new Error("imageBase64 fehlt");
    if (data.docType !== "license" && data.docType !== "id") throw new Error("docType ungültig");
    if (data.side !== "front" && data.side !== "back") throw new Error("side ungültig");
    // Max ~8 MB base64
    if (data.imageBase64.length > 12_000_000) throw new Error("Bild zu groß");
    return data;
  })
  .handler(async ({ data, context }): Promise<IdVerifyResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY fehlt");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", context.userId)
      .maybeSingle();
    const first = (profile?.first_name ?? "").trim();
    const last = (profile?.last_name ?? "").trim();

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const dataUrl = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;

    const expectedType = data.docType === "id" ? "Personalausweis" : "Führerschein (Klasse B)";
    const expectedSide = data.side === "front" ? "Vorderseite" : "Rückseite";

    let ai;
    try {
      const res = await generateText({
        model,
        experimental_output: Output.object({ schema: AiSchema }),
        messages: [
          {
            role: "system",
            content:
              "Du bist ein forensischer Prüfer für Ausweisdokumente. Analysiere das gezeigte Foto sehr sorgfältig. " +
              "Gib NIEMALS looksAuthentic=true zurück, wenn das Dokument offensichtlich keine amtliche ID ist (z.B. Kunden-, Bonus-, Sauna-, Spielkarte, Visitenkarte, handbeschrieben, ausgedruckte Kopie ohne Sicherheitsmerkmale). " +
              "Extrahiere Vor- und Nachnamen exakt wie im Namensfeld (bei deutschen Ausweisen: 'Name' = Nachname, 'Vornamen' = Vorname). " +
              "Bewerte Schärfe streng — wenn Text nicht sicher lesbar ist, setze blurry=true.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Erwarteter Dokumenttyp: ${expectedType}. Erwartete Seite: ${expectedSide}. ` +
                  `Prüfe, ob das gezeigte Foto exakt dazu passt, und extrahiere Name/Nummer/Ablaufdatum.`,
              },
              { type: "image", image: new URL(dataUrl) },
            ],
          },
        ],
      });
      ai = res.experimental_output;
    } catch (err) {
      console.error("[id-verify] AI-Aufruf fehlgeschlagen", err);
      return {
        ok: false,
        reason: "ai_error",
        extractedName: null,
        documentClass: null,
        side: null,
      };
    }

    const extractedName = [ai.firstName, ai.lastName].filter(Boolean).join(" ").trim() || null;

    // Validierung
    if (ai.blurry || !ai.readable) {
      return { ok: false, reason: "blurry", extractedName, documentClass: ai.documentClass, side: ai.side };
    }

    const isLicense = ai.documentClass.endsWith("drivers_license");
    const isId = ai.documentClass.endsWith("id_card");
    const wantsLicense = data.docType === "license";
    if ((wantsLicense && !isLicense) || (!wantsLicense && !isId)) {
      return { ok: false, reason: "wrong_document_type", extractedName, documentClass: ai.documentClass, side: ai.side };
    }

    if (ai.side !== "unknown" && ai.side !== data.side) {
      return { ok: false, reason: "wrong_side", extractedName, documentClass: ai.documentClass, side: ai.side };
    }

    if (!ai.looksAuthentic || !ai.securityFeaturesVisible) {
      return { ok: false, reason: "not_authentic", extractedName, documentClass: ai.documentClass, side: ai.side };
    }

    // Nur Vorderseite: Namensabgleich mit Profil
    if (data.side === "front") {
      if (!first || !last) {
        return { ok: false, reason: "profile_incomplete", extractedName, documentClass: ai.documentClass, side: ai.side };
      }
      if (!nameMatches(first, last, ai.firstName, ai.lastName)) {
        return { ok: false, reason: "name_mismatch", extractedName, documentClass: ai.documentClass, side: ai.side };
      }
    }

    return { ok: true, reason: null, extractedName, documentClass: ai.documentClass, side: ai.side };
  });