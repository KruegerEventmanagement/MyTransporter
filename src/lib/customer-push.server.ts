/**
 * Web-Push an die Geräte EINES Kunden (nur vorhandene, freiwillig per Klick
 * angelegte push_subscriptions). Kein Versand, wenn VAPID oder Abo fehlt.
 */
export async function pushToUser(
  userId: string,
  input: { title: string; body: string; url: string; tag: string },
): Promise<{ sent: number; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { VAPID_PUBLIC_KEY } = await import("@/lib/push-config");
  const safe = (v: string) => v.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const raw = process.env.VAPID_PRIVATE_KEY;
  if (!raw) return { sent: 0, reason: "vapid_missing" };
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return { sent: 0, reason: "no_subscription" };

  const mod = await import("web-push");
  const webpush = (mod.default ?? mod) as typeof import("web-push");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@mytransporter.org", safe(VAPID_PUBLIC_KEY), safe(raw));
  const payload = JSON.stringify(input);
  let sent = 0;
  const stale: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 900,
          urgency: "high",
          topic: input.tag.slice(0, 32),
        });
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
      }
    }),
  );
  if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  return { sent };
}
