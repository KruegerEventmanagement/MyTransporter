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
