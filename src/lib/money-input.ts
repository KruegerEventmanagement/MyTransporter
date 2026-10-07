/**
 * Sichere Euro-Eingabe → ganze Cent (keine Float-Rechnung).
 * Akzeptiert: "120", "120,5", "120,50", "120.50", "1.234,56", "1,234.56", "1234 €".
 * Lehnt ab: leer, negativ, mehr als 2 Nachkommastellen, Buchstaben, mehrdeutige Gruppierung.
 */
export const MAX_PRICE_CENTS = 10_000_000; // 100.000 €

export type EuroParse = { ok: true; cents: number } | { ok: false; error: string };

export function parseEuroToCents(raw: string): EuroParse {
  const s = String(raw ?? "").replace(/€/g, "").replace(/\s+/g, "").trim();
  if (!s) return { ok: false, error: "Bitte einen Gesamtmietpreis eintragen" };
  if (/^[-−]/.test(s)) return { ok: false, error: "Der Preis darf nicht negativ sein" };
  if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: "Bitte nur Ziffern mit Komma oder Punkt eingeben" };

  let intPart: string;
  let frac = "";
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const thousands = (v: string, sep: string) =>
    new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(v);

  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? "," : ".";
    const grpSep = decSep === "," ? "." : ",";
    const idx = s.lastIndexOf(decSep);
    const head = s.slice(0, idx);
    frac = s.slice(idx + 1);
    if (!thousands(head, grpSep)) return { ok: false, error: "Ungültiges Zahlenformat" };
    intPart = head.split(grpSep).join("");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    if (parts.length === 2 && parts[1].length <= 2) {
      intPart = parts[0] || "0";
      frac = parts[1];
    } else if (sep === "." && thousands(s, sep)) {
      intPart = parts.join("");
    } else {
      return { ok: false, error: "Höchstens zwei Nachkommastellen" };
    }
  } else {
    intPart = s;
  }
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(frac)) {
    return { ok: false, error: "Höchstens zwei Nachkommastellen" };
  }
  if (intPart.length > 7) return { ok: false, error: "Preis ist unplausibel hoch" };
  const cents = Number(intPart) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0) return { ok: false, error: "Ungültiger Preis" };
  if (cents > MAX_PRICE_CENTS) return { ok: false, error: "Preis ist unplausibel hoch" };
  return { ok: true, cents };
}

/** 12345 → "123,45 €" */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const c = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${euros},${c} €`;
}

/** Cent → Eingabewert fürs Formular ("123,45"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return formatCents(cents).replace(" €", "").replace(/\./g, "");
}
