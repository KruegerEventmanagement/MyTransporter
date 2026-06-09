import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const ResultSchema = z.object({
  km: z.number().int().nullable().describe("Kilometerstand vom Tacho als ganze Zahl, oder null wenn nicht erkennbar"),
  fuelPercent: z.number().int().min(0).max(100).nullable().describe("Tankstand in Prozent (0-100), oder null wenn nicht erkennbar"),
  confidence: z.enum(["low", "med", "high"]).describe("Wie sicher die Erkennung ist"),
  reasoning: z.string().describe("Kurze Begründung in einem Satz"),
});

export type OdometerRecognitionResult = z.infer<typeof ResultSchema>;

export const recognizeOdometer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { photoPath: string; bookingId: string; phase: "start" | "end" }) => {
    if (!data.photoPath) throw new Error("photoPath fehlt");
    if (!data.bookingId) throw new Error("bookingId fehlt");
    if (data.phase !== "start" && data.phase !== "end") throw new Error("phase ungültig");
    return data;
  })
  .handler(async ({ data }): Promise<OdometerRecognitionResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY fehlt");

    // Signed URL für das Foto erzeugen (1 h gültig)
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("trip-photos")
      .createSignedUrl(data.photoPath, 60 * 60);
    if (signErr || !signed?.signedUrl) {
      throw new Error("Foto konnte nicht geladen werden");
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const { experimental_output: output } = await generateText({
      model,
      experimental_output: Output.object({ schema: ResultSchema }),
      messages: [
        {
          role: "system",
          content:
            "Du analysierst ein Foto vom Armaturenbrett / Tacho eines Transporters. Erkenne den aktuellen Gesamtkilometerstand (nicht Tageskilometer!) und – falls sichtbar – den Tankfüllstand in Prozent. Wenn ein Wert nicht eindeutig lesbar ist, gib null zurück. Sei konservativ mit confidence.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Erkenne Kilometerstand und Tankstand." },
            { type: "image", image: new URL(signed.signedUrl) },
          ],
        },
      ],
    });

    // Persistieren, ohne Nutzer-Eingaben zu überschreiben
    const updateFields =
      data.phase === "start"
        ? { ai_start_km: output.km, ai_start_fuel_percent: output.fuelPercent }
        : { ai_end_km: output.km, ai_end_fuel_percent: output.fuelPercent };
    await supabaseAdmin.from("bookings").update(updateFields).eq("id", data.bookingId);

    return output;
  });