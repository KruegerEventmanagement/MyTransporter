import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "./push-config";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushStatus(): Promise<"unsupported" | "denied" | "granted" | "default"> {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as "denied" | "granted" | "default";
}

export async function isSubscribedOnThisDevice(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function enablePushOnThisDevice(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!pushSupported()) return { ok: false, reason: "Dieses Gerät unterstützt keine Push-Benachrichtigungen." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Berechtigung für Push wurde nicht erteilt." };
  }

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "Push-Abo konnte nicht erstellt werden." };
  }

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { ok: false, reason: "Nicht eingeloggt." };

  // upsert auf endpoint (unique)
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}

export async function disablePushOnThisDevice(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch {}
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}

/**
 * Stille Wiederherstellung des Push-Abos.
 * Ruft KEINEN Permission-Dialog auf. Wenn die Berechtigung bereits erteilt ist,
 * wird ein evtl. fehlendes lokales Abo neu angelegt und in der DB upserted.
 */
export async function ensurePushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return false;

    const reg = await getRegistration();
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );
    return true;
  } catch {
    return false;
  }
}