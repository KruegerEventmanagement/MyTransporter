// VAPID Public Key - öffentlich, darf im Client-Bundle stehen.
// Muss zum VAPID_PRIVATE_KEY Secret auf dem Server passen.
export const VAPID_PUBLIC_KEY =
  "BC5hiT41t6tEFOahUVRpXvoXm5DMgQPA8FdaYNMZgdHlqa7a-WVAGEQScmOVgMahNG8VOam2vQIKOOn3mjMIpWQ";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}