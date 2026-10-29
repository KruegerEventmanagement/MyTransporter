import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";

/**
 * Admin-Test: genau eine SMS mit festem TEST-Text und Dummy-Code über denselben Versandpfad
 * (Claim/Lease/Finish) – ohne Buchung, ohne echten Schlüsselcode. Doppelklick-Schutz per requestId.
 */
export const sendKeySmsTest = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { requestId: string; phone: string; confirm: boolean }) => {
    const requestId = String(d?.requestId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Ungültige Anfrage");
    if (d?.confirm !== true) throw new Error("Bestätigung fehlt");
    return { requestId, phone: String(d?.phone ?? "").slice(0, 30), confirm: true as const };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false as const, reason: "Nur für Admins." };
    const apiKey = process.env.SEVEN_API_KEY;
    if (!apiKey) return { ok: false as const, reason: "SMS-Schlüssel fehlt." };
    const { normalizePhone } = await import("@/lib/key-sms");
    if (!normalizePhone(data.phone)) return { ok: false as const, reason: "Keine gültige EU-/deutsche Handynummer." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { count } = await db.from("key_code_sms").select("id", { count: "exact", head: true })
      .eq("source_type", "test").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 3) return { ok: false as const, reason: "Max. 3 Test-SMS pro Stunde." };
    const { processKeySms, buildKeySmsTestText, KEY_SMS_TEST_CODE } = await import("@/lib/key-sms-core");
    const { keySmsStore, sevenSender } = await import("@/lib/key-sms.server");
    const outcome = await processKeySms(keySmsStore, sevenSender(apiKey), {
      type: "test", id: data.requestId, plate: "TEST", rawPhone: data.phone, label: "Admin-Test",
      stillEligible: async () => true,
      keyCode: async () => KEY_SMS_TEST_CODE,
      buildText: () => buildKeySmsTestText(),
    });
    return { ok: outcome === "sent", outcome, reason: outcome === "sent" ? "Test-SMS vom Anbieter angenommen." : `Ergebnis: ${outcome}` };
  });
