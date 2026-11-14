export type RefundBlockInput = {
  busy: boolean;
  itemsError: string | null;
  refundError: string | null;
  stripeBlocked: boolean;
  externalRefundLabel?: string;
  refundCents: number | null;
};

/** Alle Gründe, warum der Rückzahlungsknopf gesperrt ist – immer sichtbar anzeigen. */
export function refundBlockReasons(i: RefundBlockInput): string[] {
  const r: string[] = [];
  if (i.busy) r.push("Wird verarbeitet …");
  if (i.itemsError) r.push(i.itemsError);
  if (i.refundError) r.push(i.refundError);
  if (i.stripeBlocked && (i.refundCents ?? 0) > 0)
    r.push(`Bei Stripe wurde direkt bereits ${i.externalRefundLabel ?? "ein Betrag"} erstattet. Rückzahlung gesperrt – bitte in Stripe prüfen.`);
  return r;
}

import { parseEuroToCents } from "@/lib/money-input";

/**
 * Liest einen Betrag auch aus Freitext ("20 euro reine Tankkosten" → 2000).
 * Nur wenn genau eine Zahl vorkommt; sonst null (nie raten).
 */
export function parseLenientEuro(text: string): number | null {
  const matches = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  if (matches.length !== 1) return null;
  const r = parseEuroToCents(matches[0]);
  return r.ok && r.cents >= 0 ? r.cents : null;
}
