/**
 * Gemeinsamer Kunden-Hinweis zur Rückgabe mit Pflichtfotos und Kautionsdauer.
 * Die 30 € werden nie automatisch belastet (siehe documentation-fee.ts) – nur nach Prüfung.
 */
import { DOCUMENTATION_FEE_EUR } from "./documentation-fee";

export const RETURN_NOTICE_TITLE = "Wichtig: Fahrt mit Fotos beenden";
export const RETURN_NOTICE_FAST =
  "Bitte beende nach dem Abstellen des Fahrzeugs die Fahrt in der App und mache alle vorgegebenen Fotos inklusive Tankbeleg. Dann erhältst du deine Kaution schneller zurück und es fällt keine Bearbeitungspauschale an.";
export const RETURN_NOTICE_SLOW = `Ohne vollständige Rückgabe-Fotos kann die Rückzahlung der Kaution bis zu 10 Werktage dauern und es werden ${DOCUMENTATION_FEE_EUR} € von der Kaution abgezogen.`;
export const DEPOSIT_BANK_NOTE = "Je nach Bank kann die Gutschrift der Kaution 1–10 Werktage dauern.";
export const DEPOSIT_RETURN_NOTICE = `${RETURN_NOTICE_FAST} ${RETURN_NOTICE_SLOW} ${DEPOSIT_BANK_NOTE}`;

/** Pop-up erscheint ab 60 min vor Mietende. */
export const RETURN_POPUP_LEAD_MS = 60 * 60_000;
/** E-Mail-Erinnerung 30 min vor Mietende; Nachholfenster bis Mietende. */
export const RETURN_MAIL_LEAD_MS = 30 * 60_000;

export type ReturnPopupPhase = "soon" | "overdue" | null;

export function returnPopupPhase(nowMs: number, endMs: number, returning: boolean): ReturnPopupPhase {
  if (returning || !Number.isFinite(endMs)) return null;
  if (nowMs >= endMs) return "overdue";
  if (nowMs >= endMs - RETURN_POPUP_LEAD_MS) return "soon";
  return null;
}

/** Mail fällig zwischen Ende−30 min und Ende (danach übernimmt Pop-up/Push). */
export function returnMailDue(nowMs: number, endMs: number): boolean {
  return Number.isFinite(nowMs) && Number.isFinite(endMs) && nowMs >= endMs - RETURN_MAIL_LEAD_MS && nowMs < endMs;
}

/** Penetrante Nachfass-Stufen nach Mietende, solange die Rückgabe mit Fotos fehlt. */
export type OverdueKind = "return_overdue_1" | "return_overdue_2";
export const OVERDUE_STAGES: ReadonlyArray<{ kind: OverdueKind; afterMs: number; untilMs: number }> = [
  { kind: "return_overdue_1", afterMs: 30 * 60_000, untilMs: 3 * 3600_000 },
  { kind: "return_overdue_2", afterMs: 3 * 3600_000, untilMs: 24 * 3600_000 },
];
export function overdueStageDue(nowMs: number, endMs: number): OverdueKind | null {
  if (!Number.isFinite(nowMs) || !Number.isFinite(endMs)) return null;
  const d = nowMs - endMs;
  return OVERDUE_STAGES.find((s) => d >= s.afterMs && d < s.untilMs)?.kind ?? null;
}
export const DEPOSIT_DEDUCTION_LINE = "Ohne vollständige Rückgabefotos ziehen wir 30 € von deiner Kaution ab.";

export const RETURN_FEE_SUBJECT = "Vermeiden Sie 30 Euro Bearbeitungsgebühr.";
export const RETURN_PHOTO_LIST = [
  "Tankbeleg",
  "Tacho mit Kilometerstand und Tankanzeige",
  "Innenraum / Fahrerkabine (wie sauber das Fahrzeug ist)",
  "Laderaum innen",
  "Außen: vorn, hinten, links und rechts",
];
/** Hinweis in der Buchungsbestätigung: Vorher-/Nachher-Tachofoto. */
export const PRE_TRIP_PHOTO_NOTICE = [
  "Ganz wichtig: Fotografiere vor dem Losfahren den Kilometerstand (Tacho) – und nach der Fahrt noch einmal.",
  "Nur mit Vorher- und Nachher-Foto ist dein Kilometerstand eindeutig belegt und dir können keine falschen Kilometer berechnet werden.",
  "Fehlen die Fotos, droht ein Kautionsabzug von mindestens 30 €.",
  "Über den Button unten kommst du direkt zu deiner Fahrt: Dort machst du das Tachofoto und auf Wunsch gleich die Fotos von außen und innen – sie werden sofort gespeichert.",
];
export const RETURN_NOTES_MAX = 1000;
export const RETURN_FEE_OPENING = "Es müssen alle Fotos gemacht und hochgeladen werden:";
export const RETURN_FEE_CONSEQUENCE = "Werden diese Fotos nicht hochgeladen und muss ein Mitarbeiter das Fahrzeug nachträglich prüfen, stellen wir dir zusätzlich 30 € Bearbeitungsgebühr in Rechnung.";
export const RETURN_FEE_INTRO = [RETURN_FEE_OPENING, ...RETURN_PHOTO_LIST.map((p) => `• ${p}`), RETURN_FEE_CONSEQUENCE];

/** Hinweis direkt nach der Zahlung (Zahlungsseite + einmaliges Pop-up je Buchung). */
export const POST_PAYMENT_PHOTO_HEADLINE = "Rückgabefotos sind Pflicht – sonst droht eine Bearbeitungsgebühr von 30 €";
export const POST_PAYMENT_PHOTO_TITLE = "Wichtig: Rückgabefotos sind Pflicht";
export const POST_PAYMENT_PHOTO_NOTICE = "Fehlen nach der Fahrt die Rückgabefotos, droht eine Bearbeitungsgebühr von 30 €.";
export const postPaymentNoticeKey = (bookingId: string) => `mt_postpay_notice_${bookingId}`;
export function shouldShowPostPaymentNotice(fromCheckout: boolean, alreadySeen: boolean): boolean {
  return fromCheckout && !alreadySeen;
}
