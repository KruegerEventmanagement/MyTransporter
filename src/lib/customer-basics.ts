/**
 * Pflicht-Stammdaten je Kunde (Name, E-Mail, Geburtsdatum, Handynummer).
 * Gemeinsame Prüfung für Registrierung, Ergänzung im Buchungsablauf, Checkout-Server und Admin-Anzeige.
 * Handynummer: gleiche Regeln wie die Schlüssel-SMS (E.164, EU/EWR/CH, DE nur Mobil).
 */
import { normalizePhone } from "./key-sms";
import { ageOn, MIN_DRIVER_AGE } from "./birthday";

export type BasicsField = "first_name" | "last_name" | "email" | "birth_date" | "phone";
export const BASICS_LABELS: Record<BasicsField, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  email: "E-Mail",
  birth_date: "Geburtsdatum",
  phone: "Handynummer",
};

export type BasicsInput = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  birth_date?: string | null;
  phone?: string | null;
};

export type BasicsCheck = {
  ok: boolean;
  /** Feld → verständlicher Grund. */
  problems: Partial<Record<BasicsField, string>>;
  normalized: { first_name: string; last_name: string; email: string; birth_date: string; phone: string | null };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /\p{L}/u;

export function isRealBirthDate(s: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  const age = ageOn(s, now);
  return age !== null && age >= 0 && age <= 110;
}

export function checkCustomerBasics(input: BasicsInput, now: Date = new Date()): BasicsCheck {
  const first = (input.first_name ?? "").trim().replace(/\s+/g, " ");
  const last = (input.last_name ?? "").trim().replace(/\s+/g, " ");
  const email = (input.email ?? "").trim().toLowerCase();
  const birth = (input.birth_date ?? "").trim();
  const phone = normalizePhone(input.phone);
  const p: BasicsCheck["problems"] = {};
  if (!first || !NAME_RE.test(first) || first.length > 80) p.first_name = "Bitte gib deinen Vornamen an.";
  if (!last || !NAME_RE.test(last) || last.length > 80) p.last_name = "Bitte gib deinen Nachnamen an.";
  if (!EMAIL_RE.test(email) || email.length > 254) p.email = "Bitte gib eine gültige E-Mail-Adresse an.";
  if (!isRealBirthDate(birth, now)) p.birth_date = "Bitte gib dein echtes Geburtsdatum an.";
  else if ((ageOn(birth, now) ?? 0) < MIN_DRIVER_AGE) p.birth_date = `Für eine Buchung musst du mindestens ${MIN_DRIVER_AGE} Jahre alt sein.`;
  if (!phone) p.phone = "Bitte gib eine gültige Handynummer an (z. B. 0171 2345678 oder +357 99 123456). Festnetz und Länder außerhalb Europas werden nicht unterstützt.";
  return {
    ok: Object.keys(p).length === 0,
    problems: p,
    normalized: { first_name: first, last_name: last, email, birth_date: birth, phone },
  };
}

export function missingBasicsMessage(c: BasicsCheck): string {
  const fields = (Object.keys(c.problems) as BasicsField[]).map((f) => BASICS_LABELS[f]);
  return `Bitte ergänze zuerst deine Pflichtangaben: ${fields.join(", ")}.`;
}
