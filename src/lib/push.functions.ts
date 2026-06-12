import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server-Push an alle Admin-Geräte. Wird vom Buchungs-Flow im Hintergrund aufgerufen.
export const sendAdminPush = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string; body?: string; url?: string; tag?: string }) => {
    if (!data?.title || typeof data.title !== "string") throw new Error("title fehlt");
    return {
      title: data.title.slice(0, 120),
      body: data.body?.slice(0, 300) ?? "",
      url: data.url?.slice(0, 500) ?? "/admin",
      tag: data.tag?.slice(0, 80) ?? `mt-${Date.now()}`,
    };
  })
  .handler(async ({ data }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:info@mytransporter.org";
    if (!publicKey || !privateKey) {
      console.warn("VAPID keys not configured, skipping push");
      return { sent: 0, skipped: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const webpushMod = await import("web-push");
    const webpush = (webpushMod.default ?? webpushMod) as typeof import("web-push");
    webpush.setVapidDetails(subject, publicKey, privateKey);

    // Admin-User_IDs holen
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((r) => r.user_id);
    if (adminIds.length === 0) return { sent: 0, skipped: true };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", adminIds);

    if (!subs || subs.length === 0) return { sent: 0, skipped: true };

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url,
      tag: data.tag,
    });

    let sent = 0;
    const staleIds: string[] = [];
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (e: unknown) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            staleIds.push(s.id);
          } else {
            console.warn("Push send failed", status, e);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
    }

    return { sent, skipped: false };
  });

export const sendTestAdminPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!roleRow) throw new Error("Forbidden");
    return await sendAdminPush({
      data: {
        title: "MyTransporter · Test",
        body: "Push funktioniert. Du bekommst ab jetzt Buchungen aufs Handy.",
        url: "/admin",
        tag: "mt-test",
      },
    });
  });