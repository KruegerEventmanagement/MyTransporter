/**
 * Separater Karteneinzug Mehrkilometer: atomarer Claim (claim_extra_charge, Buchungslock)
 * gegen Kautionsverrechnung; eingefrorener Betrag + stabiler Stripe-Key.
 * Doppelklick/Timeout setzt mit demselben Betrag/Key fort, nie ein zweiter Einzug.
 */
import { isDefinitiveStripeRejection } from "@/lib/deposit-settlement";

export type ClaimResult =
  | { result: "claimed" | "resume"; amount_cents: number }
  | { result: "not_found" | "in_deposit_review" | "succeeded" | "needs_review" | "failed_final" | "amount_mismatch" };

export interface ExtraChargeDeps {
  claim(bookingId: string, amountCents: number): Promise<ClaimResult>;
  getCard(bookingId: string): Promise<{ customer: string | null; paymentMethod: string | null; environment: "sandbox" | "live" | null }>;
  createIntent(env: "sandbox" | "live", p: { amount: number; customer: string; payment_method: string; description: string; bookingId: string }, key: string): Promise<{ id: string; status: string }>;
  record(bookingId: string, patch: { extra_charge_status: string; extra_charge_intent_id?: string | null }): Promise<void>;
}

export const extraChargeKey = (bookingId: string) => `mt-extra-km-${bookingId}`;

const REFUSE: Record<string, string> = {
  not_found: "Buchung nicht gefunden",
  in_deposit_review: "Mehrkilometer sind in der Kautionsprüfung erfasst oder verrechnet: kein separater Einzug",
  succeeded: "Mehrkilometer wurden bereits eingezogen",
  needs_review: "Früherer Einzug unklar und außerhalb des sicheren Wiederholungsfensters: manuell prüfen",
  failed_final: "Früherer Einzug wurde abgelehnt: kein automatischer neuer Versuch",
  amount_mismatch: "Betrag entspricht nicht der gespeicherten Mehrkilometer-Forderung",
};

export async function runExtraCharge(d: ExtraChargeDeps, bookingId: string, requestedCents: number, description: string) {
  const c = await d.claim(bookingId, requestedCents);
  if (c.result !== "claimed" && c.result !== "resume") throw new Error(REFUSE[c.result] ?? "Nicht möglich");
  const card = await d.getCard(bookingId);
  if (!card.customer || !card.paymentMethod) {
    await d.record(bookingId, { extra_charge_status: "failed" });
    throw new Error("Keine gespeicherte Zahlungsmethode für diese Buchung");
  }
  if (!card.environment) throw new Error("Stripe-Umgebung der Buchung unbekannt: manuell prüfen (Einzug bleibt reserviert)");
  try {
    const intent = await d.createIntent(
      card.environment,
      { amount: c.amount_cents, customer: card.customer, payment_method: card.paymentMethod, description, bookingId },
      extraChargeKey(bookingId),
    );
    await d.record(bookingId, { extra_charge_status: intent.status, extra_charge_intent_id: intent.id });
    return { status: intent.status, intentId: intent.id, amountCents: c.amount_cents };
  } catch (e) {
    if (isDefinitiveStripeRejection(e)) {
      await d.record(bookingId, { extra_charge_status: "failed" });
      throw new Error("Karte wurde abgelehnt");
    }
    // Unklar: Status bleibt processing; erneuter Klick nutzt denselben Betrag/Key.
    throw new Error("Ergebnis unklar: später erneut versuchen (gleicher Betrag, kein Doppeleinzug)");
  }
}
