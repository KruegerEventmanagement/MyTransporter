import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";
import { DOC_GROUPS, type DocGroup } from "@/lib/document-retention";

/** Status, bei denen eine Kontolöschung geprüft wird (Spiegel der DB-Funktion). */
export const BLOCKING_STATUSES = [...BLOCKING_BOOKING_STATUSES];

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string; claims: Record<string, unknown> };

/**
 * Echte Kontolöschung (App-Store-/Play-Anforderung). Buchungen/Rechnungen
 * bleiben getrennt erhalten; bei laufender/bevorstehender Miete: Löschantrag,
 * den der stündliche Datenschutz-Job nach Mietende ausführt.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { confirm: string; password?: string }) => {
    if (d?.confirm !== "LÖSCHEN") throw new Error("Bestätigung fehlt");
    if (d.password != null && (typeof d.password !== "string" || d.password.length > 200)) throw new Error("Ungültig");
    return { confirm: d.confirm, password: d.password ?? "" };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const uid = ctx.userId;
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const { handleDeleteMyAccount } = await import("@/lib/account-handlers.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return handleDeleteMyAccount({
      uid,
      claims: ctx.claims,
      password: data.password,
      nowMs: Date.now(),
      store: await createPrivacyStore(),
      getAuthUser: async () => {
        const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (error && !/not.?found/i.test(error.message)) throw new Error("Konto lesen fehlgeschlagen");
        return u?.user ? { email: u.user.email ?? null, created_at: u.user.created_at ?? null } : null;
      },
      isAdmin: async () => {
        const { data: r, error } = await ctx.supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
        if (error) throw new Error("Rollenprüfung fehlgeschlagen");
        return r === true;
      },
      verifyPassword: (email, pw) => verifyPassword(email, pw, uid),
    });
  });

/** Ausweis oder Führerschein aus dem eigenen Konto entfernen (nur eigene Daten). */
export const removeMyDocuments = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { group: DocGroup }) => {
    if (d?.group !== "id" && d?.group !== "license") throw new Error("Ungültig");
    return { group: d.group };
  })
  .handler(async ({ data, context }) => {
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const { handleRemoveMyDocuments } = await import("@/lib/account-handlers.server");
    return handleRemoveMyDocuments(await createPrivacyStore(), context.userId, DOC_GROUPS[data.group], Date.now());
  });

/** Eigener Löschantrag-Status (nur Status/Zeitpunkt). */
export const getMyDeletionStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .handler(async ({ context }) => {
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const s = await (await createPrivacyStore()).deletionStatus(context.userId);
    return s ? { status: s.status, requestedAt: s.requested_at } : null;
  });
