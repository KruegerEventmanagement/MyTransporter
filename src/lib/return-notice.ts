/**
 * Gemeinsamer Kunden-Hinweis zur Rückgabe mit Pflichtfotos und Kautionsdauer.
 * Die 30 € werden nie automatisch belastet (siehe documentation-fee.ts) – nur nach Prüfung.
 */
import { DOCUMENTATION_FEE_EUR } from "./documentation-fee";

export const RETURN_NOTICE_TITLE = "Wichtig: Fahrt mit Fotos beenden";
export const RETURN_NOTICE_FAST =
  "Bitte beende nach dem Abstellen des Fahrzeugs die Fahrt in der App und mache alle vorgegebenen Fotos inklusive Tankbeleg. Dann erhältst du deine Kaution schneller zurück und es fällt keine Bearbeitungspauschale an.";
export const RETURN_NOTICE_SLOW = `Ohne vollständige Rückgabe-Fotos kann die Rückzahlung der Kaution bis zu 10 Werktage dauern und es wird eine Bearbeitungspauschale von ${DOCUMENTATION_FEE_EUR} € berechnet.`;
export const DEPOSIT_BANK_NOTE = "Je nach Bank kann die Gutschrift der Kaution 1–10 Werktage dauern.";
export const DEPOSIT_RETURN_NOTICE = `${RETURN_NOTICE_FAST} ${RETURN_NOTICE_SLOW} ${DEPOSIT_BANK_NOTE}`;

/** Pop-up erscheint ab 60 min vor Mietende. */
export const RETURN_POPUP_LEAD_MS = 60 * 60_000;
/** E-Mail-Erinnerung 60 min vor Mietende; Nachholfenster bis Mietende. */
export const RETURN_MAIL_LEAD_MS = 60 * 60_000;

export type ReturnPopupPhase = "soon" | "overdue" | null;

export function returnPopupPhase(nowMs: number, endMs: number, returning: boolean): ReturnPopupPhase {
  if (returning || !Number.isFinite(endMs)) return null;
  if (nowMs >= endMs) return "overdue";
  if (nowMs >= endMs - RETURN_POPUP_LEAD_MS) return "soon";
  return null;
}

/** Mail fällig zwischen Ende−60 min und Ende (danach übernimmt Pop-up/Push). */
export function returnMailDue(nowMs: number, endMs: number): boolean {
  return nowMs >= endMs - RETURN_MAIL_LEAD_MS && nowMs < endMs;
}
