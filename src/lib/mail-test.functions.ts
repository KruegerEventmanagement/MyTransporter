import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin-Versandtest: keine frei wählbaren Felder außer der Anfrage-ID (Doppelklick-Schutz). */
export const sendAdminMailTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
        findByRequest: async (id) =>
          (await db.from("mail_test_runs").select("status, test_id, created_at").eq("request_id", id).maybeSingle()).data ?? null,
        lastRunAt: async (adminId) =>
          (
            await db
              .from("mail_test_runs")
              .select("created_at")
              .eq("admin_id", adminId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data?.created_at ?? null,
        insertRun: async (row) => {
          const { error } = await db.from("mail_test_runs").insert(row);
          if (error?.code === "23505") return "duplicate";
          if (error) throw new Error("Testprotokoll fehlgeschlagen");
          return "ok";
        },
        setStatus: async (id, status) => {
          await db.from("mail_test_runs").update({ status, updated_at: new Date().toISOString() }).eq("request_id", id);
        },
        send: (to, subject, html, key) => sendEmail(to, subject, html, undefined, key),
        now: () => Date.now(),
        randomId: () => crypto.randomUUID().slice(0, 8),
      },
      context.userId,
      data.requestId,
    );
  });
