import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

// Interne Push-Logik: kann direkt aus anderen Server-Funktionen aufgerufen werden,
// ohne den createServerFn-RPC-Boundary zu überqueren. Loggt Fehler in admin_notifications,
// damit der Admin sieht, warum ggf. kein Push ankam.
export async function pushToAdmins(input: {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; skipped: boolean; reason?: string }> {
  const data = {
    title: (input.title ?? "MyTransporter").slice(0, 120),
    body: (input.body ?? "").slice(0, 300),
    url: (input.url ?? "/admin").slice(0, 500),
    tag: (input.tag ?? `mt-${Date.now()}`).slice(0, 80),
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const logIssue = async (reason: string, body: string) => {
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "push_failed",
        title: `Push nicht zugestellt (${reason})`,
        body,
      });
    } catch {
      // ignore
    }
  };

  // web-push verlangt URL-safe Base64 ohne Padding – Secrets kommen aber oft
  // im Standard-Base64-Format ("+", "/", "="). Daher hier normalisieren.
  const toUrlSafeBase64 = (v: string) =>
    v.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const publicKey = toUrlSafeBase64(VAPID_PUBLIC_KEY);
  const rawPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const privateKey = rawPrivateKey ? toUrlSafeBase64(rawPrivateKey) : undefined;
  const subject = process.env.VAPID_SUBJECT || "mailto:info@mytransporter.org";
  if (!privateKey) {
    await logIssue("vapid_missing", "VAPID_PRIVATE_KEY ist nicht gesetzt.");
    return { sent: 0, skipped: true, reason: "vapid_missing" };
  }

  const webpushMod = await import("web-push");
  const webpush = (webpushMod.default ?? webpushMod) as typeof import("web-push");
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: adminRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  const adminIds = (adminRoles ?? []).map((r) => r.user_id);
  if (adminIds.length === 0) {
    await logIssue("no_admin", "Es ist kein User als Admin eingetragen.");
    return { sent: 0, skipped: true, reason: "no_admin" };
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", adminIds);

  if (!subs || subs.length === 0) {
    await logIssue(
      "no_subscription",
      "Kein Admin-Gerät hat Push aktiviert. Im Admin oben rechts auf 'Push aktivieren' tippen.",
    );
    return { sent: 0, skipped: true, reason: "no_subscription" };
  }

  const payload = JSON.stringify(data);
  let sent = 0;
  const staleIds: string[] = [];
  const errors: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            TTL: 3600,
            urgency: "high",
            topic: (data.tag ?? "mt").slice(0, 32),
          },
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(s.id);
        } else {
          errors.push(`status=${status ?? "?"} ${(e as Error)?.message ?? ""}`.slice(0, 200));
          console.warn("Push send failed", status, e);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
  }

  if (sent === 0 && errors.length > 0) {
    await logIssue("send_failed", errors.join(" · "));
  }

  return { sent, skipped: false };
}

// Server-Push an alle Admin-Geräte. RPC-Wrapper für Browser-Aufrufe.
export const sendAdminPush = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string; body?: string; url?: string; tag?: string }) => {
    if (!data?.title || typeof data.title !== "string") throw new Error("title fehlt");
    return data;
  })
  .handler(async ({ data }) => pushToAdmins(data));

export const sendTestAdminPush = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!roleRow) throw new Error("Forbidden");
    return await pushToAdmins({
      title: "MyTransporter · Test",
      body: "Push funktioniert. Du bekommst ab jetzt Buchungen aufs Handy.",
      url: "/admin",
      tag: "mt-test",
    });
  });