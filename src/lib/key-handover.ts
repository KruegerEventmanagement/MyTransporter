/**
 * Schlüsselübergabe: fester Schlüsselkasten-Code je Fahrzeug, Versand genau
 * ab 15 Minuten vor Abholung (nie früher). Reine Logik, ohne Serverzugriff.
 */
export const KEY_CODE_LEAD_MS = 15 * 60_000;
/** Nach Abholbeginn noch kurz nachholen (z. B. verpasster Minutenlauf), danach nicht mehr. */
export const KEY_CODE_GRACE_MS = 10 * 60_000;

export const KEY_PICKUP_PLACE = "OBI Leonberg – vor dem Eingang an den Fahrradständern";
export const VEHICLE_PICKUP_PLACE = "Poststraße 60, 71229 Leonberg";

export function isKeyCodeDue(startMs: number, nowMs: number): boolean {
  return nowMs >= startMs - KEY_CODE_LEAD_MS && nowMs <= startMs + KEY_CODE_GRACE_MS;
}

export function keyHandoverRows(code: string | null): { label: string; value: string }[] {
  return [
    { label: "Schlüsselcode", value: code ?? "Bitte ruf uns an – Code wird telefonisch durchgegeben" },
    { label: "Schlüssel abholen", value: KEY_PICKUP_PLACE },
    { label: "Transporter steht", value: VEHICLE_PICKUP_PLACE },
  ];
}

export const KEY_HANDOVER_HINTS = [
  "Den Schlüssel holst du am Schlüsselkasten beim OBI Leonberg ab – vor dem Eingang an den Fahrradständern.",
  "Der Transporter steht in der Poststraße 60 (ca. 500 m Luftlinie). Du kannst zu Fuß hinlaufen oder mit deinem Auto hinfahren, den Transporter wegfahren und dein Auto während der Miete auf dem Parkplatz des Transporters stehen lassen.",
];
