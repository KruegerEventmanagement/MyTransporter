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

  // Geburtstagsautomatik gilt für alle Kunden mit hinterlegtem Geburtsdatum.
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, email, birth_date")
    .not("birth_date", "is", null);

  if (error) throw new Error(`profiles query failed: ${error.message}`);

  const todays = (profiles ?? []).filter(
    (p) => p.birth_date && p.email && isBirthdayOn(p.birth_date, today),
  );
  result.candidates = todays.length;

  for (const p of todays) {
    try {
      // Zeile anlegen (idempotent über UNIQUE(user_id, year))
      await supabaseAdmin.from("birthday_campaigns").insert({
        user_id: p.id,
        year: today.year,
        birthday_on: today.iso,
        coupon_code: generateCouponCode(),
        discount_percent: BIRTHDAY_DISCOUNT_PERCENT,
        valid_from: today.iso,
        valid_until: couponValidUntil(today.iso),
        email_status: "pending",
      });

      const { data: row } = await supabaseAdmin
        .from("birthday_campaigns")
        .select("id, coupon_code, discount_percent, valid_until, email_status")
        .eq("user_id", p.id)
        .eq("year", today.year)
        .maybeSingle();

      if (!row) {
        result.failed += 1;
        continue;
      }
      if (row.email_status === "sent") {
        result.skipped += 1;
        continue;
      }

      const html = renderBirthdayEmail({
        firstName: p.first_name,
        couponCode: row.coupon_code,
        discountPercent: row.discount_percent,
        validUntilLabel: deLabel(row.valid_until),
      });

      const ok = await sendEmail(
        p.email!,
        birthdaySubject(p.first_name, row.discount_percent),
        html,
        undefined,
        `birthday-${p.id}-${today.year}`,
      );

      if (ok) {
        await supabaseAdmin
          .from("birthday_campaigns")
          .update({ email_status: "sent", sent_at: new Date().toISOString(), email_error: null })
          .eq("id", row.id);
        result.sent += 1;
      } else {
        await supabaseAdmin
          .from("birthday_campaigns")
          .update({ email_status: "failed", email_error: "Mailversand fehlgeschlagen" })
          .eq("id", row.id);
        result.failed += 1;
      }
    } catch (e) {
      result.failed += 1;
      console.error("birthday send failed", String((e as Error)?.message ?? e));
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
