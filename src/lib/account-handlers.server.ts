/**
 * Handler-Logik der Kontoaktionen, getrennt von createServerFn, damit
 * Auth-/Rollen-/Fehlerpfade ohne echte Dienste getestet werden können.
 */
import { runAccountDeletion, removeDocumentsFromAccount, type PrivacyStore } from "./privacy-ops.server";

/** Erneute Besitzbestätigung gilt ohne Passwort nur so lange nach der Anmeldung. */
export const RECENT_AUTH_SECONDS = 600;
/** Nur interaktive Anmeldungen zählen (kein Token-Refresh, kein Recovery-/Anonym-Login). */
export const INTERACTIVE_AMR = new Set(["password", "oauth", "otp", "magiclink", "sso/saml", "totp"]);

export function isRecentAuth(claims: Record<string, unknown>, nowSec: number): boolean {
  const amr = Array.isArray(claims.amr) ? (claims.amr as Array<{ method?: string; timestamp?: number }>) : [];
  return amr.some((a) => {
    const ts = Number(a?.timestamp) || 0;
    return INTERACTIVE_AMR.has(String(a?.method)) && ts > 0 && ts <= nowSec + 60 && nowSec - ts <= RECENT_AUTH_SECONDS;
  });
}

export interface DeleteDeps {
  uid: string;
  claims: Record<string, unknown>;
  password: string;
  nowMs: number;
  store: PrivacyStore;
  getAuthUser: () => Promise<{ email: string | null; created_at: string | null } | null>;
  /** Muss bei Fehler werfen (fail closed). */
  isAdmin: () => Promise<boolean>;
  verifyPassword: (email: string, password: string) => Promise<boolean>;
}

export type DeleteResponse =
  | { ok: true; completedAt: string | null }
  | { ok: false; reason: string; needsPassword?: boolean; requested?: boolean; requestedAt?: string | null };

export async function handleDeleteMyAccount(d: DeleteDeps): Promise<DeleteResponse> {
  const authUser = await d.getAuthUser();
  if (!authUser) {
    const s = await d.store.deletionStatus(d.uid);
    if (s?.status === "completed") return { ok: true, completedAt: s.completed_at };
    if (s) return { ok: false, reason: "Deine Löschung wird automatisch abgeschlossen. Bei Fragen: info@mytransporter.org." };
    return { ok: false, reason: "Konto nicht gefunden." };
  }
  let admin: boolean;
  try {
    admin = await d.isAdmin();
  } catch {
    return { ok: false, reason: "Berechtigung konnte nicht geprüft werden. Bitte später erneut versuchen." };
  }
  if (admin) return { ok: false, reason: "Admin-Konten können hier nicht gelöscht werden." };

  const nowSec = Math.floor(d.nowMs / 1000);
  let confirmed = false;
  if (d.password) confirmed = !!authUser.email && (await d.verifyPassword(authUser.email, d.password).catch(() => false));
  else confirmed = isRecentAuth(d.claims, nowSec);
  if (!confirmed) {
    return {
      ok: false,
      needsPassword: true,
      reason: d.password
        ? "Das Passwort stimmt nicht. Bitte versuche es erneut."
        : "Bitte bestätige mit deinem Passwort (oder melde dich neu an).",
    };
  }

  const bookings = await d.store.listBookings(d.uid);
  const r = await runAccountDeletion(d.store, {
    uid: d.uid,
    accountCreatedAt: authUser.created_at,
    bookings,
    nowMs: d.nowMs,
    create: true,
  });
  if (r.ok) return { ok: true, completedAt: r.completedAt };
  if (r.kind === "requested") {
    return {
      ok: false,
      requested: true,
      requestedAt: r.requestedAt,
      reason:
        "Du hast eine laufende oder bevorstehende Miete. Dein Löschantrag ist gespeichert; nach Ende der Miete wird dein Konto automatisch gelöscht (stündliche Prüfung). Bei Fragen: info@mytransporter.org.",
    };
  }
  if (r.kind === "admin") return { ok: false, reason: "Admin-Konten können hier nicht gelöscht werden." };
  if (r.kind === "busy") return { ok: false, reason: "Die Löschung läuft bereits. Bitte warte einen Moment." };
  return {
    ok: false,
    reason: "Löschen noch nicht abgeschlossen. Wir wiederholen es automatisch; bereits erledigte Schritte bleiben erhalten.",
  };
}

export async function handleRemoveMyDocuments(store: PrivacyStore, uid: string, types: readonly string[], nowMs: number) {
  try {
    const r = await removeDocumentsFromAccount(store, uid, types, nowMs);
    return { ok: true as const, ...r };
  } catch (e) {
    console.error("document removal failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return { ok: false as const, reason: "Entfernen fehlgeschlagen. Bitte versuche es erneut." };
  }
}
