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
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Diakritika
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenMatches(expected: string, documentTokens: string[]): boolean {
  const token = normalize(expected);
  if (!token) return false;
  return documentTokens.some((docToken) => {
    if (!docToken) return false;
    if (docToken === token) return true;
    if (token.length >= 4 && (docToken.includes(token) || token.includes(docToken))) return true;
    const maxDistance = Math.max(token.length, docToken.length) >= 7 ? 2 : 1;
    return levenshtein(token, docToken) <= maxDistance;
  });
}

function nameMatches(profileFirst: string, profileLast: string, docFirst: string | null, docLast: string | null): boolean {
  const pf = normalize(profileFirst);
  const pl = normalize(profileLast);
  const all = `${docFirst ? normalize(docFirst) : ""} ${docLast ? normalize(docLast) : ""}`.trim();
  const documentTokens = all.split(" ").filter(Boolean);
  if (!pf || !pl || documentTokens.length === 0) return false;
  const firstTokens = pf.split(" ").filter(Boolean);
  // Mindestens ein Vorname aus dem Profil muss im Dokument stehen
  const firstOk = firstTokens.some((t) => tokenMatches(t, documentTokens));
  const lastOk = tokenMatches(pl, documentTokens);
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
    const claimsMetadata = ((context.claims as { user_metadata?: Record<string, unknown> } | undefined)?.user_metadata ?? {}) as {
      first_name?: string;
      last_name?: string;
    };
    const first = (profile?.first_name ?? claimsMetadata.first_name ?? "").trim();
    const last = (profile?.last_name ?? claimsMetadata.last_name ?? "").trim();

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const imageData = data.imageBase64.startsWith("data:")
      ? (data.imageBase64.split(",")[1] ?? data.imageBase64)
      : data.imageBase64;

    const expectedType = data.docType === "id" ? "Personalausweis" : "Führerschein (Klasse B)";
    const expectedSide = data.side === "front" ? "Vorderseite" : "Rückseite";

    let ai;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await generateText({
          model,
          experimental_output: Output.object({ schema: AiSchema }),
          messages: [
            {
              role: "system",
              content:
                "Du bist ein forensischer Prüfer für Ausweisdokumente. Analysiere das gezeigte Foto sorgfältig, aber praxisnah für Smartphone-Fotos. " +
                "Gib NIEMALS looksAuthentic=true zurück, wenn das Dokument offensichtlich keine amtliche ID ist (z.B. Kunden-, Bonus-, Sauna-, Spielkarte, Visitenkarte, handbeschrieben, ausgedruckte Kopie ohne Sicherheitsmerkmale). " +
                "Akzeptiere aber echte amtliche Ausweise/Führerscheine auch dann, wenn Spiegelungen, Perspektive oder leichte Unschärfe vorhanden sind, solange Dokumenttyp und wichtige Angaben erkennbar sind. " +
                "Bei deutschen Ausweisen gilt: 'Name' = Nachname, 'Vornamen' = Vorname. Bei Führerscheinen gilt Feld 1 = Nachname, Feld 2 = Vorname. " +
                "Setze blurry=true nur, wenn Text und Dokumenttyp wirklich nicht zuverlässig erkennbar sind.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `Erwarteter Dokumenttyp: ${expectedType}. Erwartete Seite: ${expectedSide}. ` +
                    `Prüfe, ob das Foto dazu passt. Vorderseiten müssen Namen enthalten; Rückseiten dürfen ohne Namen akzeptiert werden, wenn Dokumenttyp/Seite plausibel sind.`,
                },
                { type: "image", image: imageData, mediaType: "image/jpeg" },
              ],
            },
          ],
        });
        ai = res.experimental_output;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!ai) {
      console.error("[id-verify] AI-Aufruf fehlgeschlagen", lastError);
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

    if (!ai.looksAuthentic) {
      return { ok: false, reason: "not_authentic", extractedName, documentClass: ai.documentClass, side: ai.side };
    }

    // Sicherheitsmerkmale werden von der KI weiter bewertet, sind aber kein
    // harter Ablehnungsgrund mehr. Auf echten Smartphone-Fotos verdecken
    // Spiegelung, Winkel oder Blitz Hologramme/MRZ oft teilweise. Fake-Karten
    // bleiben über documentClass + looksAuthentic gesperrt.

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