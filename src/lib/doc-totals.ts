export type DocItemInput = {
  label: string;
  /** Betrag in Euro (negativ = Rabatt/Nachlass) */
  amount: number;
  mode: "net" | "gross";
  /** 19% MwSt. anwenden (z.B. Kaution = false) */
  vat: boolean;
};

export const VAT_RATE = 0.19;

export function computeDocTotals(items: DocItemInput[]) {
  let vatNetC = 0;
  let vatVatC = 0;
  let plainC = 0;
  const rows = items.map((it) => {
    const cents = Math.round((Number.isFinite(it.amount) ? it.amount : 0) * 100);
    if (!it.vat) {
      plainC += cents;
      return { label: it.label, netC: null as number | null, vatC: null as number | null, grossC: cents };
    }
    const netC = it.mode === "net" ? cents : Math.round(cents / (1 + VAT_RATE));
    const grossC = it.mode === "net" ? Math.round(cents * (1 + VAT_RATE)) : cents;
    const vC = grossC - netC;
    vatNetC += netC;
    vatVatC += vC;
    return { label: it.label, netC, vatC: vC, grossC };
  });
  const vatGrossC = vatNetC + vatVatC;
  return { rows, vatNetC, vatVatC, vatGrossC, plainC, totalC: vatGrossC + plainC };
}

export function fmtEurC(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
