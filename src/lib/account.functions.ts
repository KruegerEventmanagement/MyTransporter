import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";
import { DOC_GROUPS, type DocGroup } from "@/lib/document-retention";

/** Status, bei denen eine Kontolöschung geprüft wird (Spiegel der DB-Funktion). */
export const BLOCKING_STATUSES = [...BLOCKING_BOOKING_STATUSES];

/** Erneute Besitzbestätigung gilt ohne Passwort nur so lange nach der Anmeldung. */
export const RECENT_AUTH_SECONDS = 600;

export function isRecentAuth(claims: Record<string, unknown>, nowSec: number): boolean {
  const amr = Array.isArray(claims.amr) ? (claims.amr as Array<{ timestamp?: number }>) : [];
  const last = Math.max(0, ...amr.map((a) => Number(a?.timestamp) || 0));
  return last > 0 && nowSec - last <= RECENT_AUTH_SECONDS;
}

/** Prüft das Passwort mit einem isolierten Client; erzeugte Sitzung wird sofort beendet. Nie loggen. */
async function verifyPassword(email: string, password: string, uid: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const tmp = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await tmp.auth.signInWithPassword({ email, password });
  const ok = !error && data.user?.id === uid;
  if (data.session) await tmp.auth.signOut({ scope: "local" }).catch(() => {});
  return ok;
}

type Ctx = { supabase: any; userId: string; claims: Record<string, unknown> };

async function isAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

/**
 * Echte Kontolöschung (App-Store-/Play-Anforderung): Auth-Konto inkl. Sitzungen,
 * Profil, Geräte-/Marketingdaten und Kundendokumente. Buchungen/Rechnungen bleiben
 * getrennt erhalten; Ausweiskopien nur befristet im Adminarchiv, wenn ein
 * Mietvertrag sie noch erfordert. Bei laufender/bevorstehender Miete: Löschantrag.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string; password?: string }) => {
    if (d?.confirm !== "LÖSCHEN") throw new Error("Bestätigung fehlt");
    if (d.password != null && (typeof d.password !== "string" || d.password.length > 200)) throw new Error("Ungültig");
    return { confirm: d.confirm, password: d.password ?? "" };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const uid = ctx.userId;
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const { runAccountDeletion } = await import("@/lib/privacy-ops.server");
    const store = await createPrivacyStore();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
    if (!authUser?.user) {
      const s = await store.deletionStatus(uid);
      if (s?.status === "completed") return { ok: true as const, completedAt: s.completed_at };
      return { ok: false as const, reason: "Konto nicht gefunden." };
    }
    if (await isAdmin(ctx)) {
      return { ok: false as const, reason: "Admin-Konten können hier nicht gelöscht werden." };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const email = authUser.user.email ?? "";
    let confirmed = false;
    if (data.password) confirmed = !!email && (await verifyPassword(email, data.password, uid));
    else confirmed = isRecentAuth(ctx.claims, nowSec);
    if (!confirmed) {
      return {
        ok: false as const,
        reason: data.password
          ? "Das Passwort stimmt nicht. Bitte versuche es erneut."
          : "Bitte bestätige mit deinem Passwort (oder melde dich neu an).",
        needsPassword: true,
      };
    }

    const bookings = await store.listBookings(uid);
    const r = await runAccountDeletion(store, {
      uid,
      accountCreatedAt: authUser.user.created_at ?? null,
      bookings,
      nowMs: Date.now(),
    });
    if (r.ok) return { ok: true as const, completedAt: r.completedAt };
    if (r.kind === "requested") {
      return {
        ok: false as const,
        requested: true,
        requestedAt: r.requestedAt,
        reason:
          "Du hast eine laufende oder bevorstehende Miete. Wir haben deinen Löschantrag gespeichert und löschen dein Konto nach Abschluss der Miete. Bei Fragen: info@mytransporter.org.",
      };
    }
    if (r.kind === "busy") return { ok: false as const, reason: "Die Löschung läuft bereits. Bitte warte einen Moment." };
    return { ok: false as const, reason: "Löschen fehlgeschlagen. Bitte versuche es erneut; bereits erledigte Schritte bleiben erhalten." };
  });

/** Ausweis oder Führerschein aus dem eigenen Konto entfernen (nur eigene Daten). */
export const removeMyDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { group: DocGroup }) => {
    if (d?.group !== "id" && d?.group !== "license") throw new Error("Ungültig");
    return { group: d.group };
  })
  .handler(async ({ data, context }) => {
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const { removeDocumentsFromAccount } = await import("@/lib/privacy-ops.server");
    const store = await createPrivacyStore();
    try {
      const r = await removeDocumentsFromAccount(store, context.userId, DOC_GROUPS[data.group], Date.now());
      return { ok: true as const, ...r };
    } catch (e) {
      console.error("document removal failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
      return { ok: false as const, reason: "Entfernen fehlgeschlagen. Bitte versuche es erneut." };
    }
  });

/** Eigener Löschantrag-Status (nur Status/Zeitpunkt). */
export const getMyDeletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const s = await (await createPrivacyStore()).deletionStatus(context.userId);
    return s ? { status: s.status, requestedAt: s.requested_at } : null;
  });
