import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import { parseReportInput, type ReportReturnResult } from "./trip-return.server";

/**
 * Kunde meldet die physische Rückgabe. Serverseitig als DB-Funktion
 * implementiert, damit der Trigger-Schutz "mt.trip_return_rpc" greift und
 * Mehrkilometer/Preis ausschließlich aus den unveränderten Buchungs-Snapshots
 * berechnet werden. Bei Fehlern wird ehrlich "nicht gespeichert" gemeldet.
 */
export const reportReturn = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => parseReportInput(d))
  .handler(async ({ data, context }): Promise<ReportReturnResult> => {
    const { data: rpc, error } = await (context.supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    }).rpc("report_trip_return", {
      _booking_id: data.bookingId,
      _end_km: data.endKm,
      _end_km_manual: data.endKmManual,
      _end_fuel_percent: data.endFuelPercent,
      // flow/refueled reisen im bestehenden jsonb-Parameter (keine Signaturänderung, Altclients unverändert).
      _exceptions: data.mode ? { ...data.exceptions, flow: data.mode.flow, refueled: data.mode.refueled } : data.exceptions,
    });
    if (!error && rpc && typeof rpc === "object") {
      const r = rpc as Record<string, unknown>;
      if (r.ok === true)
        return { ok: true, returnCode: String(r.returnCode), alreadyReported: !!r.alreadyReported, reviewReason: (r.reviewReason as string | null) ?? null };
      if (r.ok === false)
        return { ok: false, error: String(r.error ?? "Rückgabe nicht gespeichert."), ...(Array.isArray(r.missing) ? { missing: r.missing as string[] } : {}) };
    }
    // Kein unsicherer Ausweichpfad: Status/Preis darf nur die DB-Funktion setzen.
    return { ok: false, error: "Rückgabe nicht gespeichert. Bitte erneut versuchen." };
  });
