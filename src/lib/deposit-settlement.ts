// Reine Regeln für Kautionsabrechnung und Storno-Erstattung (ohne I/O).

export type SettlementKind = "deposit" | "cancellation" | "legacy";
export type SettlementStatus =
  | "processing"
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled"
  | "no_refund"
  | "needs_review";

/** Abgeschlossen: kein weiterer Stripe-Abgleich nötig. */
export const TERMINAL_STATUSES: SettlementStatus[] = ["succeeded", "failed", "canceled", "no_refund"];
/** Halten den gemeinsamen Buchungs-Lock. */
export const INFLIGHT_STATUSES: SettlementStatus[] = ["processing", "pending", "requires_action", "needs_review"];

/** Stripe-Idempotenz-Keys gelten 24 h; mit Sicherheitsabstand nur 23 h darauf verlassen. */
export const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;
/** Obergrenze einer einzelnen Erstattung (Plausibilität). */
export const MAX_REFUND_CENTS = 5_000_00;

export function eurToCents(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new Error("Ungültiger Betrag in der Buchung");
  }
  const cents = Math.round(n * 100);
  if (!Number.isSafeInteger(cents) || cents > MAX_REFUND_CENTS) throw new Error("Betrag außerhalb des Limits");
  return cents;
}

export function assertCents(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_REFUND_CENTS) {
    throw new Error(`${label} ungültig`);
  }
  return value;
}

/** Kautionsabrechnung: nur Kaution, nie Miete. */
export function computeDepositSettlement(input: { depositEur: unknown; deductCents: unknown }) {
  const depositCents = eurToCents(input.depositEur);
  const deductCents = assertCents(input.deductCents, "Abzug");
  if (deductCents > depositCents) {
    throw new Error(`Abzug darf die Kaution (${(depositCents / 100).toFixed(2)} €) nicht übersteigen`);
  }
  return { depositCents, deductCents, refundCents: depositCents - deductCents };
}

/** Stornogebühr: ≥13 h: 0 € · 12 h: 1 € · … · ≤1 h: 12 €. */
export function computeCancellationFeeCents(startsAtMs: number, nowMs: number) {
  const hours = Math.max(0, Math.ceil((startsAtMs - nowMs) / 3_600_000));
  const feeEuro = hours >= 13 ? 0 : hours <= 1 ? 12 : 13 - hours;
  return { hours, feeCents: feeEuro * 100 };
}

export function computeCancellationRefund(input: {
  planPriceEur: unknown;
  depositEur: unknown;
  kmPackageCents: number;
  feeCents: number;
  /** Kaution wurde bereits (ganz oder teilweise) abgerechnet → nie erneut erstatten. */
  depositAlreadySettled: boolean;
}) {
  const planCents = eurToCents(input.planPriceEur);
  const depositCents = eurToCents(input.depositEur);
  const km = assertCents(input.kmPackageCents, "Kilometerpaket");
  const rentRefund = Math.max(0, planCents - input.feeCents);
  const depositPart = input.depositAlreadySettled ? 0 : depositCents;
  return { depositCents, depositPart, refundCents: rentRefund + km + depositPart };
}

export function mapRefundStatus(s: string | null | undefined): SettlementStatus {
  switch (s) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "requires_action":
      return "requires_action";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return "needs_review";
  }
}

/**
 * true ⇒ Stripe hat die Anfrage eindeutig abgelehnt (kein Geld bewegt).
 * Netzwerkfehler, 5xx, 409/429 und Idempotenzkonflikte sind UNKLAR.
 */
export function isDefinitiveStripeRejection(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { statusCode?: number; type?: string; raw?: { type?: string } };
  const type = err.type ?? "";
  if (type === "StripeIdempotencyError" || err.raw?.type === "idempotency_error") return false;
  if (type === "StripeConnectionError" || type === "StripeAPIError") return false;
  return err.statusCode === 400 || err.statusCode === 402 || err.statusCode === 404;
}

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  processing: "Wird an Stripe übermittelt / Ergebnis unklar",
  pending: "Bei Stripe ausstehend",
  requires_action: "Stripe benötigt eine Aktion",
  succeeded: "Von Stripe bestätigt",
  failed: "Fehlgeschlagen",
  canceled: "Abgebrochen",
  no_refund: "Keine Erstattung (voll einbehalten)",
  needs_review: "Manuelle Prüfung nötig",
};
