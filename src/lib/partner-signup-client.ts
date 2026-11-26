/** Client: verifizierte QR-Registrierung melden (Server prüft alles; idempotent). */
import { supabase } from "@/integrations/supabase/client";
import { claimPartnerSignupFn } from "@/lib/partners.functions";
import { getPartnerRef, PARTNER_REF_PARAM } from "@/lib/partner-tracking";

const tried = new Set<string>();

export async function maybeClaimPartnerSignup(): Promise<void> {
  try {
    const ref = getPartnerRef();
    if (!ref) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid || tried.has(`${uid}:${ref}`)) return;
    const r = await claimPartnerSignupFn({ data: { ref } });
    // Nur bestätigte Endergebnisse merken; Netz-/Serverfehler ⇒ nächster Aufruf versucht erneut.
    if (r && typeof r === "object" && "result" in r && (r.result === "attached" || r.result === "exists")) tried.add(`${uid}:${ref}`);
  } catch { /* nie blockierend */ }
}

/** Bestätigungslink trägt die Referenz mit (kein Browser-Speicher nötig). */
export function withPartnerRef(url: string): string {
  const ref = getPartnerRef();
  if (!ref) return url;
  const u = new URL(url);
  u.searchParams.set(PARTNER_REF_PARAM, ref);
  return u.toString();
}
