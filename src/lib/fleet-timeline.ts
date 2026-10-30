/** Admin-Fuhrpark-Zeitleiste: Fahrzeugfarben und Kautionszusammenfassung (rein, testbar). */

export type VehicleColor = 0 | 1 | 2 | 3 | 4 | 5;

const norm = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Feste Farbe je Fahrzeug: 101 blau, 102 grün, 1003 orange, OF-DK violett, 1004 türkis. */
export function vehicleColor(plate: string): VehicleColor {
  const p = norm(plate);
  if (p.startsWith("OFDK")) return 4;
  if (p.endsWith("1004")) return 5;
  if (p.endsWith("1003")) return 3;
  if (p.endsWith("102")) return 2;
  if (p.endsWith("101")) return 1;
  return 0;
}

export const VEHICLE_COLOR_NAME: Record<VehicleColor, string> = {
  0: "Grau",
  1: "Blau",
  2: "Grün",
  3: "Orange",
  4: "Violett",
  5: "Türkis",
};

/** Statische Klassen, damit Tailwind sie erkennt. */
export const VEHICLE_BG: Record<VehicleColor, string> = {
  0: "bg-vehicle-0",
  1: "bg-vehicle-1",
  2: "bg-vehicle-2",
  3: "bg-vehicle-3",
  4: "bg-vehicle-4",
  5: "bg-vehicle-5",
};

export interface DepositInput {
  depositEuro: number | null;
  depositStatus: string | null;
  settlements: { refund_cents: number; status: string; refund_status: string | null; confirmed_at: string | null }[];
  review: { status: string; final_refund_cents: number | null; manual_payout_status: string | null; finalized_at: string | null } | null;
}

export interface DepositSummary {
  paidCents: number;
  refundedCents: number | null;
  refundedAt: string | null;
  label: string;
}

/** Nur bestätigte Rückzahlungen zählen als „zurückbezahlt“ – nie ein bloßer Auftrag. */
export function depositSummary(i: DepositInput): DepositSummary {
  const paidCents = Math.round((i.depositEuro ?? 0) * 100);
  const ok = i.settlements.filter((s) => s.refund_status === "succeeded" || s.status === "succeeded");
  if (ok.length > 0) {
    const refunded = ok.reduce((a, s) => a + s.refund_cents, 0);
    return { paidCents, refundedCents: refunded, refundedAt: ok[0].confirmed_at, label: "Kaution zurückbezahlt" };
  }
  if (i.review?.manual_payout_status === "confirmed" && i.review.final_refund_cents !== null) {
    return { paidCents, refundedCents: i.review.final_refund_cents, refundedAt: i.review.finalized_at, label: "Kaution zurückbezahlt" };
  }
  if (i.settlements.some((s) => s.status === "pending" || s.status === "processing" || s.status === "requested")) {
    return { paidCents, refundedCents: null, refundedAt: null, label: "Rückzahlung läuft" };
  }
  if (paidCents === 0) return { paidCents, refundedCents: null, refundedAt: null, label: "Keine Kaution" };
  return { paidCents, refundedCents: null, refundedAt: null, label: "Kaution offen" };
}
