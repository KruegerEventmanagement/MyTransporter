/**
 * Geburtstagsmail + Gutscheine (Geburtstag & Dankeschön) – serverseitig.
 *
 * Idempotenz Geburtstag: pro (user_id, year) höchstens eine Zeile in
 * `birthday_campaigns` (DB-Unique) und fester Gmail-Schlüssel je Person/Jahr.
 * `sent` wird nie erneut versendet; unklare Versuche ⇒ `needs_review` (kein Blindversand).
 * Versand nur mit Einwilligung: Profil-Flag oder dokumentierte Telefon-Einwilligung.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { birthdaySubject, renderBirthdayEmail } from "@/lib/birthday-email";
import {
  BIRTHDAY_DISCOUNT_PERCENT,
  berlinDateParts,
  checkCoupon,
  couponValidUntil,
  discountCentsForRent,
  generateCouponCode,
  isBirthdayOn,
  normalizeCouponCode,
  type CouponRow,
} from "@/lib/birthday";
import { checkThanksCoupon, type ThanksCouponRow } from "@/lib/coupons";

/** Dauerhaft vom Betreiber ausgeschlossene Adressen (Marketing/Bewertung). */
export const MARKETING_EXCLUDED_EMAILS = ["rainerrene11@web.de"];
const RESERVE_MS = 40 * 60_000;

function deLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export interface BirthdayRunResult {
  date: string;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
}

async function hasAttestation(emailLower: string, scope: "feedback" | "birthday"): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("marketing_consent_attestations").select("id").eq("email_lower", emailLower).eq("scope", scope).maybeSingle();
  if (error) throw new Error(`Einwilligung nicht prüfbar: ${error.message}`);
  return !!data;
}

async function optedOut(emailLower: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("email_opt_outs").select("email_lower").eq("email_lower", emailLower).maybeSingle();
  if (error) throw new Error(`Abmeldestatus nicht prüfbar: ${error.message}`);
  return !!data;
}

/** Stündlicher Job: ab 09:00 Uhr Berlin die heutigen Geburtstage mit Einwilligung, je Person/Jahr einmal. */
export async function processBirthdayEmails(now: Date = new Date()): Promise<BirthdayRunResult> {
  const today = berlinDateParts(now);
  const result: BirthdayRunResult = { date: today.iso, candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (today.hour < 9) return result;

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles").select("id, email, first_name, birth_date, birthday_marketing_consent").not("birth_date", "is", null);
  if (error) throw new Error(error.message);
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = new Set((admins ?? []).map((a) => a.user_id));
  const { isAccountActiveForMail } = await import("@/lib/customer-mail-outbox.server");
  const { sendEmailDetailed } = await import("@/lib/mail-provider.server");

  for (const p of profiles ?? []) {
    if (!p.birth_date || !isBirthdayOn(p.birth_date, today)) continue;
    const email = (p.email ?? "").trim();
    const lower = email.toLowerCase();
    if (!email.includes("@") || adminIds.has(p.id) || MARKETING_EXCLUDED_EMAILS.includes(lower)) { result.skipped++; continue; }
    result.candidates++;
    try {
      const consent = p.birthday_marketing_consent === true || (await hasAttestation(lower, "birthday"));
      if (!consent || (await optedOut(lower)) || !(await isAccountActiveForMail(p.id))) { result.skipped++; continue; }

      await supabaseAdmin.from("birthday_campaigns").upsert(
        {
          user_id: p.id, year: today.year, birthday_on: today.iso, coupon_code: generateCouponCode(),
          discount_percent: BIRTHDAY_DISCOUNT_PERCENT, valid_from: today.iso, valid_until: couponValidUntil(today.iso),
          email_status: "pending",
        } as never,
        { onConflict: "user_id,year", ignoreDuplicates: true },
      );
      const { data: c, error: cErr } = await supabaseAdmin
        .from("birthday_campaigns").select("id, coupon_code, discount_percent, valid_until, email_status")
        .eq("user_id", p.id).eq("year", today.year).maybeSingle();
      if (cErr || !c) throw new Error(cErr?.message ?? "Kampagne fehlt");
      if (c.email_status !== "pending" && c.email_status !== "failed") { result.skipped++; continue; }

      const html = renderBirthdayEmail({
        firstName: p.first_name, couponCode: c.coupon_code, discountPercent: c.discount_percent,
        validUntilLabel: deLabel(c.valid_until),
        unsubscribeUrl: "mailto:info@mytransporter.org?subject=Keine%20Geburtstagsmails",
      });
      const res = await sendEmailDetailed({
        provider: "gmail", to: email, subject: birthdaySubject(p.first_name, c.discount_percent), html,
        idempotencyKey: `mt-birthday-${p.id}-${today.year}`, timeoutMs: 20_000,
      } as never);
      if (res.ok) {
        await supabaseAdmin.from("birthday_campaigns").update({ email_status: "sent", sent_at: new Date().toISOString(), email_error: null } as never).eq("id", c.id);
        result.sent++;
      } else {
        await supabaseAdmin.from("birthday_campaigns").update({
          email_status: res.ambiguous ? "needs_review" : "failed", email_error: `${res.kind}: ${res.error}`.slice(0, 300),
        } as never).eq("id", c.id);
        result.failed++;
      }
    } catch (e) {
      console.error("[birthday] Versand fehlgeschlagen", String((e as Error)?.message ?? e).slice(0, 200));
      result.failed++;
    }
  }
  return result;
}

export interface CouponResolution {
  ok: boolean;
  reason?: string;
  code?: string;
  discountPercent?: number;
  discountCents?: number;
  validUntil?: string;
  source?: "birthday" | "thanks";
}

async function profileEmailLower(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
  return data?.email ? data.email.trim().toLowerCase() : null;
}

/**
 * Prüft einen Gutscheincode für einen Nutzer und berechnet den Rabatt auf die
 * Mietleistung. Nie auf Kaution oder Zusatzleistungen anwenden.
 */
export async function resolveCouponForRent(
  rawCode: string | null | undefined,
  userId: string,
  rentCents: number,
  now: Date = new Date(),
): Promise<CouponResolution> {
  const code = normalizeCouponCode(rawCode ?? "");
  if (!code) return { ok: true, discountCents: 0 };
  const today = berlinDateParts(now).iso;

  const { data: t, error: tErr } = await supabaseAdmin
    .from("customer_coupons")
    .select("code, email_lower, user_id, discount_percent, valid_from, valid_until, redeemed_at, reserved_until, reserved_by")
    .eq("code", code).maybeSingle();
  if (tErr) return { ok: false, reason: "Gutschein gerade nicht prüfbar. Bitte später erneut versuchen." };
  if (t) {
    const check = checkThanksCoupon(t as ThanksCouponRow, { userId, emailLower: await profileEmailLower(userId) }, today, now.getTime());
    if (!check.ok) return { ok: false, reason: check.reason };
    return { ok: true, code, source: "thanks", discountPercent: check.discountPercent, validUntil: t.valid_until, discountCents: discountCentsForRent(rentCents, check.discountPercent) };
  }

  const { data } = await supabaseAdmin
    .from("birthday_campaigns")
    .select("coupon_code, user_id, discount_percent, valid_from, valid_until, redeemed_at, reserved_until, reserved_by")
    .eq("coupon_code", code)
    .maybeSingle();
  const check = checkCoupon((data as CouponRow | null) ?? null, userId, today);
  if (!check.ok) return { ok: false, reason: check.reason };
  const row = data as unknown as { reserved_until: string | null; reserved_by: string | null; valid_until: string };
  if (row.reserved_until && row.reserved_by !== userId && new Date(row.reserved_until).getTime() > now.getTime())
    return { ok: false, reason: "Dieser Gutschein wird gerade in einer anderen Zahlung verwendet." };
  return { ok: true, code, source: "birthday", discountPercent: check.discountPercent, validUntil: row.valid_until, discountCents: discountCentsForRent(rentCents, check.discountPercent) };
}

/**
 * Reserviert den Gutschein atomar für diese Zahlung (40 Min.), damit derselbe Code
 * nicht parallel von anderer Seite benutzt wird. false ⇒ nicht verwenden.
 */
export async function reserveCouponForCheckout(code: string, userId: string, source: "birthday" | "thanks"): Promise<boolean> {
  const until = new Date(Date.now() + RESERVE_MS).toISOString();
  const nowIso = new Date().toISOString();
  const table = source === "thanks" ? "customer_coupons" : "birthday_campaigns";
  const col = source === "thanks" ? "code" : "coupon_code";
  const { data, error } = await (supabaseAdmin.from(table) as any)
    .update({ reserved_until: until, reserved_by: userId })
    .eq(col, code).is("redeemed_at", null)
    .or(`reserved_until.is.null,reserved_until.lt.${nowIso},reserved_by.eq.${userId}`)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Markiert einen Gutschein nach bestätigter Zahlung als eingelöst.
 * Atomar: nur wenn noch nicht eingelöst. Fehler dürfen die bezahlte Buchung
 * niemals zurückrollen.
 */
export async function redeemCouponForBooking(
  rawCode: string | null | undefined,
  userId: string,
  bookingId: string,
  discountCents: number,
): Promise<boolean> {
  const code = normalizeCouponCode(rawCode ?? "");
  if (!code) return false;
  try {
    const patch = { redeemed_at: new Date().toISOString(), redeemed_booking_id: bookingId, discount_cents: discountCents };
    const { data: t } = await supabaseAdmin.from("customer_coupons").update(patch as never)
      .eq("code", code).is("redeemed_at", null).select("id");
    if ((t?.length ?? 0) > 0) return true;
    const { data } = await supabaseAdmin
      .from("birthday_campaigns")
      .update(patch as never)
      .eq("coupon_code", code)
      .eq("user_id", userId)
      .is("redeemed_at", null)
      .select("id");
    const ok = (data?.length ?? 0) > 0;
    if (!ok) {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "email_failed", title: "Gutschein doppelt verwendet?",
        body: `Code ${code} war bei Buchung ${bookingId} bereits eingelöst oder unbekannt. Bitte prüfen.`,
        booking_id: bookingId, user_id: userId,
      });
    }
    return ok;
  } catch (e) {
    console.error("coupon redeem failed", String((e as Error)?.message ?? e));
    return false;
  }
}
