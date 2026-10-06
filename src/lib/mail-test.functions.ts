import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";

/** Admin-Versandtest: keine frei wählbaren Felder außer der Anfrage-ID (Doppelklick-Schutz). */
export const sendAdminMailTest = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { requestId: string }) => ({ requestId: String(d?.requestId ?? "") }))
  .handler(async ({ data, context }) => {
    const { runMailTest } = await import("@/lib/mail-test.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail } = await import("@/lib/booking-emails.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    return runMailTest(
      {
        isAdmin: async () => {
          const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
          return !!ok;
        },
        claim: async (row) => {
          const { data: res, error } = await db.rpc("claim_mail_test", {
            _admin: row.admin_id,
            _request: row.request_id,
            _test_id: row.test_id,
            _cooldown_seconds: 60,
          });
          if (error || !res?.state) throw new Error("Testprotokoll fehlgeschlagen");
          return res;
        },
        setStatus: async (id, status) => {
          const { error } = await db
            .from("mail_test_runs")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("request_id", id);
          if (error) throw new Error("Status-Update fehlgeschlagen");
        },
        send: (to, subject, html, key) => sendEmail(to, subject, html, undefined, key),
        now: () => Date.now(),
        randomId: () => crypto.randomUUID().slice(0, 8),
      },
      context.userId,
      data.requestId,
    );
  });
