import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./platform";

/**
 * Native Push (FCM/APNs) – getrennt vom Web Push (push_subscriptions).
 * Registriert nur auf ausdrückliche Nutzeraktion und speichert das Gerätetoken
 * in native_push_tokens. Es wird hier nichts gesendet; ein Versandweg braucht
 * später FCM-/APNs-Zugangsdaten (siehe docs/native-store-release.md).
 */
export type NativePushResult = { ok: true } | { ok: false; reason: string };

export async function enableNativePush(): Promise<NativePushResult> {
  if (!isNativeApp()) return { ok: false, reason: "Nur in der App verfügbar." };
  const { Capacitor } = await import("@capacitor/core");
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "Berechtigung für Mitteilungen wurde nicht erteilt." };

  const token = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 15_000);
    void PushNotifications.addListener("registration", (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    void PushNotifications.addListener("registrationError", (e) => {
      clearTimeout(timer);
      reject(new Error(e.error));
    });
    void PushNotifications.register();
  }).catch(() => null);
  if (!token) return { ok: false, reason: "Gerät konnte nicht für Mitteilungen registriert werden." };

  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, reason: "Nicht eingeloggt." };
  const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
  const { error } = await supabase.from("native_push_tokens").upsert(
    {
      user_id: data.user.id,
      token,
      platform,
      provider: platform === "ios" ? "apns" : "fcm",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (error) return { ok: false, reason: "Token konnte nicht gespeichert werden." };
  return { ok: true };
}

/** Tipp auf eine native Mitteilung → gleicher Zielpfad wie im Service Worker. */
export async function listenNativePushTaps(navigate: (path: string) => void): Promise<void> {
  if (!isNativeApp()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { resolvePushTarget } = await import("./push-target");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = (action.notification.data as { url?: unknown } | undefined)?.url;
    navigate(resolvePushTarget(url));
  });
}
