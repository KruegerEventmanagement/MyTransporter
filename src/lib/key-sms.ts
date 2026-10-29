/** Schlüsselcode-SMS: reiner Textbaukasten + Telefonnummernprüfung (ohne Serverzugriff). */
import { keySafeFor } from "./key-handover";

export const KEY_SMS_SENDER = "MyTransport"; // max. 11 Zeichen

/** EU/EWR + CH-Vorwahlen; alles andere wird nicht beschickt (Schutz vor SMS-Pumping). */
const ALLOWED_PREFIXES = ["49", "43", "41", "39", "33", "34", "31", "32", "45", "46", "48", "30", "351", "352", "353", "358", "359", "36", "385", "386", "40", "420", "421", "370", "371", "372", "356", "357", "47", "354", "423"];

/** Normalisiert auf E.164 (+49…); null, wenn ungültig oder nicht erlaubt. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let s = (raw ?? "").replace(/[\s\-/().]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0")) s = "+49" + s.slice(1);
  else if (!s.startsWith("+")) return null;
  if (!/^\+\d{8,15}$/.test(s)) return null;
  const digits = s.slice(1);
  if (!ALLOWED_PREFIXES.some((p) => digits.startsWith(p))) return null;
  if (digits.startsWith("49") && !/^49(15|16|17)/.test(digits)) return null; // nur deutsche Mobilnummern
  return s;
}

export function buildKeySms(plate: string, code: string): string | null {
  const safe = keySafeFor(plate);
  if (!safe || !code) return null;
  return [
    `MyTransporter: Dein Schlüsselcode für den Transporter ${plate}.`,
    `Dein Schlüssel liegt in Box ${safe} am OBI Leonberg (Eingang, Fahrradständer). Code: ${code}`,
    "Der Transporter steht an der Poststraße 63 an der Straße – bitte nirgends klingeln.",
    "",
    "Bitte mach vor und nach der Fahrt Fotos in der App bzw. auf mytransporter.org: außen, innen, Tachostand und nach der Fahrt den Tankbeleg. Fehlen sie, müssen wir alles selbst prüfen lassen – dann werden mindestens 30 € von der Kaution abgezogen.",
    "Bitte nicht rauchen und Schäden sofort melden. Verschwiegene Schäden verursachen zusätzliche Kosten.",
    "Gute Fahrt!",
  ].join("\n");
}
