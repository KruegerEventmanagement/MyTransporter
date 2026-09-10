import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { berlinDateParts, checkCoupon, normalizeCouponCode, type CouponRow } from "@/lib/birthday";

export interface CouponPreview {
  valid: boolean;
  reason?: string;
  code?: string;
  discountPercent?: number;
  validUntil?: string;
}

/** Prüft einen Gutscheincode für den angemeldeten Nutzer (nur Anzeige/Vorschau). */
export const previewCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { couponCode: string }) => {
    if (typeof data.couponCode !== "string" || data.couponCode.length > 64) {
      throw new Error("Ungültiger Gutscheincode");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<CouponPreview> => {
    const code = normalizeCouponCode(data.couponCode);
    if (!code) return { valid: false, reason: "Bitte einen Gutscheincode eingeben." };

    const { data: row } = await context.supabase
      .from("birthday_campaigns")
      .select("coupon_code, user_id, discount_percent, valid_from, valid_until, redeemed_at")
      .eq("coupon_code", code)
      .maybeSingle();

    const check = checkCoupon(
      (row as CouponRow | null) ?? null,
      context.userId,
      berlinDateParts().iso,
    );
    if (!check.ok) return { valid: false, reason: check.reason };
    return {
      valid: true,
      code,
      discountPercent: check.discountPercent,
      validUntil: (row as CouponRow).valid_until,
    };
  });

async function assertAdmin(supabase: { rpc: Function }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Nicht autorisiert");
}

export interface BirthdayCampaignRow {
  id: string;
  user_id: string;
  year: number;
  birthday_on: string;
  coupon_code: string;
  discount_percent: number;
  valid_until: string;
  email_status: string;
  email_error: string | null;
  sent_at: string | null;
  redeemed_at: string | null;
  discount_cents: number | null;
  recipient: string;
}

/** Adminübersicht „Geburtstagsaktionen". */
export const listBirthdayCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BirthdayCampaignRow[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("birthday_campaigns")
      .select(
        "id, user_id, year, birthday_on, coupon_code, discount_percent, valid_until, email_status, email_error, sent_at, redeemed_at, discount_cents",
      )
      .order("birthday_on", { ascending: false })
      .limit(200);

    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      for (const p of profiles ?? []) {
        names.set(
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || (p.email ?? "Unbekannt"),
        );
      }
    }

    return (rows ?? []).map((r) => ({ ...r, recipient: names.get(r.user_id) ?? "Unbekannt" }));
  });

export interface MissingBirthDateRow {
  id: string;
  name: string;
  email: string | null;
}

/** Kunden ohne Geburtsdatum – damit Admins es nachtragen können. */
export const listProfilesMissingBirthDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MissingBirthDateRow[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .is("birth_date", null)
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((p) => ({
      id: p.id,
      name:
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || (p.email ?? "Unbekannt"),
      email: p.email ?? null,
    }));
  });

/** Admin trägt ein Geburtsdatum nach. */
export const setCustomerBirthDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; birthDate: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) throw new Error("Ungültiges Datum");
    if (typeof data.userId !== "string" || data.userId.length < 10) {
      throw new Error("Ungültiger Kunde");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ birth_date: data.birthDate })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
