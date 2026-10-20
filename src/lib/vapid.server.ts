/**
 * VAPID-Schlüsselpaar für Web-Push.
 * Bevorzugt: aus dem Secret VAPID_SEED_V2 abgeleitet (privat = SHA-256 des Seeds,
 * öffentlich per WebCrypto berechnet). So existiert der private Schlüssel nur
 * serverseitig und Public/Private passen immer zusammen.
 * Fallback: bisheriger fester Public Key + VAPID_PRIVATE_KEY.
 */
import { VAPID_PUBLIC_KEY as LEGACY_PUBLIC } from "@/lib/push-config";

const PKCS8_P256_PREFIX = "308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420";

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const fromB64url = (v: string) => {
  const b = atob(v.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (v.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const normalize = (v: string) =>
  v.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export type VapidKeys = { publicKey: string; privateKey: string };

/** Leitet ein gültiges P-256-Schlüsselpaar deterministisch aus einem Seed ab. */
export async function deriveVapidKeys(seed: string): Promise<VapidKeys> {
  const priv = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mytransporter-vapid-v2:${seed}`)),
  );
  const prefix = Uint8Array.from(PKCS8_P256_PREFIX.match(/../g)!.map((h) => parseInt(h, 16)));
  const der = new Uint8Array(prefix.length + 32);
  der.set(prefix);
  der.set(priv, prefix.length);
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const jwk = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(fromB64url(jwk.x!), 1);
  pub.set(fromB64url(jwk.y!), 33);
  return { publicKey: b64url(pub), privateKey: b64url(priv) };
}

let cached: Promise<VapidKeys | null> | null = null;

/** null = kein gültiger Schlüssel konfiguriert. */
export function getVapidKeys(): Promise<VapidKeys | null> {
  if (!cached) {
    cached = (async () => {
      const seed = process.env.VAPID_SEED_V2;
      if (seed && seed.length >= 32) return deriveVapidKeys(seed);
      const legacy = process.env.VAPID_PRIVATE_KEY ? normalize(process.env.VAPID_PRIVATE_KEY) : "";
      if (/^[A-Za-z0-9_-]{43}$/.test(legacy)) return { publicKey: normalize(LEGACY_PUBLIC), privateKey: legacy };
      return null;
    })().catch(() => null);
  }
  return cached;
}
