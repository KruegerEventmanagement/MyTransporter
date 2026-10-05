/**
 * Authentifizierte, idempotente Rückgabemeldung. Läuft mit dem Nutzer-Client
 * (RLS als Kunde) und filtert zusätzlich auf user_id. Keine Kautionsaktion.
 */
import { isActiveTripStatus, isReturningStatus } from "./active-trip";
import {
  cleanExceptions,
  evaluateReturnKm,
  generateReturnCode,
  missingReturnEvidence,
  type ReturnExceptions,
} from "./trip-return";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReturnClient {
  from: (table: any) => any;
}

export interface ReportReturnInput {
  bookingId: string;
  endKm: number;
  endFuelPercent: number | null;
  endKmManual: boolean;
  exceptions: ReturnExceptions;
}

export type ReportReturnResult =
  | { ok: true; returnCode: string; alreadyReported: boolean; reviewReason: string | null }
  | { ok: false; error: string; missing?: string[] };

const BOOKING_COLS =
  "id, user_id, status, plan_id, start_km, free_km, km_price_cents, return_code, return_review_reason";

export function parseReportInput(raw: unknown): ReportReturnInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const id = String(d.bookingId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Ungültige Buchung.");
  const endKm = Number(d.endKm);
  if (!Number.isInteger(endKm) || endKm < 0 || endKm > 9_999_999) throw new Error("Ungültiger Kilometerstand.");
  const fuelRaw = d.endFuelPercent;
  const fuel = fuelRaw === null || fuelRaw === undefined || fuelRaw === "" ? null : Number(fuelRaw);
  if (fuel !== null && (!Number.isInteger(fuel) || fuel < 0 || fuel > 100)) throw new Error("Ungültiger Tankstand.");
  const ex = (d.exceptions ?? {}) as Record<string, unknown>;
  return {
    bookingId: id,
    endKm,
    endFuelPercent: fuel,
    endKmManual: d.endKmManual === true,
    exceptions: {
      photos: typeof ex.photos === "string" ? ex.photos : undefined,
      fuel: typeof ex.fuel === "string" ? ex.fuel : undefined,
      receipt: typeof ex.receipt === "string" ? ex.receipt : undefined,
    },
  };
}

export async function performReturnReport(
  client: ReturnClient,
  userId: string,
  input: ReportReturnInput,
  deps: { code?: () => string; now?: () => Date } = {},
): Promise<ReportReturnResult> {
  const load = async () => {
    const { data, error } = await client
      .from("bookings")
      .select(BOOKING_COLS)
      .eq("id", input.bookingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Buchung konnte nicht geladen werden.");
    return data as null | {
      id: string;
      status: string | null;
      plan_id: string | null;
      start_km: number | null;
      free_km: number | null;
      km_price_cents: number | null;
      return_code: string | null;
      return_review_reason: string | null;
    };
  };

  const b = await load();
  if (!b) return { ok: false, error: "Buchung nicht gefunden." };

  // Bereits gemeldet (verlorene Antwort, Reload, Doppelklick): vorhandenen Code wiederverwenden.
  if (isReturningStatus(b.status) && b.return_code) {
    return { ok: true, returnCode: b.return_code, alreadyReported: true, reviewReason: b.return_review_reason };
  }
  if (!isActiveTripStatus(b.status)) {
    return { ok: false, error: "Für diese Buchung ist keine Rückgabe möglich." };
  }

  const { data: photoRows, error: photoErr } = await client
    .from("trip_photos")
    .select("photo_type")
    .eq("booking_id", input.bookingId);
  if (photoErr) return { ok: false, error: "Fotos konnten nicht geprüft werden. Bitte erneut versuchen." };
  const exceptions = cleanExceptions(input.exceptions);
  const missing = missingReturnEvidence(
    ((photoRows ?? []) as Array<{ photo_type: string }>).map((r) => r.photo_type),
    exceptions,
  );
  if (missing.length) {
    return {
      ok: false,
      error: "Es fehlen bestätigte Nachweise. Bitte Fotos übertragen oder das Problem mit Grund angeben.",
      missing,
    };
  }

  const km = evaluateReturnKm({
    planId: b.plan_id,
    startKm: b.start_km,
    endKm: input.endKm,
    freeKm: b.free_km,
    kmPriceCents: b.km_price_cents,
  });
  const reasons = [km.reviewReason];
  if (exceptions.photos) reasons.push(`Foto-/Kameraproblem: ${exceptions.photos}`);
  if (exceptions.fuel) reasons.push(`Tankstand-Foto fehlt: ${exceptions.fuel}`);
  if (exceptions.receipt) reasons.push(`Tankbeleg fehlt: ${exceptions.receipt}`);
  const reviewReason = reasons.filter(Boolean).join(" · ") || null;

  const code = (deps.code ?? generateReturnCode)();
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const values: Record<string, unknown> = {
    status: "returning",
    return_code: code,
    end_km: input.endKm,
    end_km_manual: input.endKmManual,
    extra_km: km.extra,
    extra_km_charge_cents: km.chargeCents,
    return_reported_at: nowIso,
    return_review_reason: reviewReason,
    return_exceptions: Object.keys(exceptions).length ? exceptions : null,
  };
  if (input.endFuelPercent !== null) values.ai_end_fuel_percent = input.endFuelPercent;

  // Nur gewinnen, wenn noch kein Code existiert (parallele Meldungen).
  const { data: upd, error: updErr } = await client
    .from("bookings")
    .update(values)
    .eq("id", input.bookingId)
    .eq("user_id", userId)
    .is("return_code", null)
    .select("id");
  if (updErr) return { ok: false, error: "Rückgabe nicht gespeichert. Bitte erneut versuchen." };

  if (!Array.isArray(upd) || upd.length === 0) {
    const again = await load();
    if (again?.return_code && isReturningStatus(again.status)) {
      return { ok: true, returnCode: again.return_code, alreadyReported: true, reviewReason: again.return_review_reason };
    }
    return { ok: false, error: "Rückgabe nicht gespeichert. Bitte erneut versuchen." };
  }

  // Nur der Gewinner benachrichtigt den Admin (keine doppelten Nebenaktionen).
  const body = [
    `Rückgabecode ${code}`,
    km.driven !== null ? `${km.driven} km gefahren` : null,
    km.chargeCents !== null ? `Mehrkilometer ${(km.chargeCents / 100).toFixed(2)} €` : null,
    reviewReason ? `Prüfung: ${reviewReason}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  try {
    await client.from("admin_notifications").insert({
      type: "trip_returning",
      title: reviewReason ? "Rückgabe gemeldet – Prüfung nötig" : "Rückgabe steht an",
      body,
      booking_id: input.bookingId,
      user_id: userId,
    });
  } catch {
    /* Benachrichtigung darf die gemeldete Rückgabe nie gefährden */
  }

  return { ok: true, returnCode: code, alreadyReported: false, reviewReason };
}
