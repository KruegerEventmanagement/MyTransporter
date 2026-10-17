/**
 * Geburtstagsaktion – serverseitige Orchestrierung.
 *
 * Idempotenz: Pro (user_id, year) existiert höchstens eine Zeile in
 * `birthday_campaigns` (DB-Unique). Der Versand wird erst nach echtem
 * Mailversand als `sent` markiert; `failed` bleibt retrybar, `sent` wird
 * niemals erneut versendet.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/booking-emails.server";
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

/** Tagesjob: findet heutige Geburtstage mit gültiger Einwilligung und versendet. */
export async function processBirthdayEmails(now: Date = new Date()): Promise<BirthdayRunResult> {
  const today = berlinDateParts(now);
  const result: BirthdayRunResult = {
    date: today.iso,
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Promotional birthday campaigns are not supported by the app-mail service.
  // Preserve existing coupons/redemption; never read DOB or create/send campaigns.
  return result;
}

export interface CouponResolution {
  ok: boolean;
  reason?: string;
  code?: string;
  discountPercent?: number;
  discountCents?: number;
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

  const { data } = await supabaseAdmin
    .from("birthday_campaigns")
    .select("coupon_code, user_id, discount_percent, valid_from, valid_until, redeemed_at")
    .eq("coupon_code", code)
    .maybeSingle();

  const check = checkCoupon((data as CouponRow | null) ?? null, userId, berlinDateParts(now).iso);
  if (!check.ok) return { ok: false, reason: check.reason };

  return {
    ok: true,
    code,
    discountPercent: check.discountPercent,
    discountCents: discountCentsForRent(rentCents, check.discountPercent),
  };
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
    const { data } = await supabaseAdmin
      .from("birthday_campaigns")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_booking_id: bookingId,
        discount_cents: discountCents,
      })
      .eq("coupon_code", code)
      .eq("user_id", userId)
      .is("redeemed_at", null)
      .select("id");
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.error("coupon redeem failed", String((e as Error)?.message ?? e));
    return false;
  }
}
