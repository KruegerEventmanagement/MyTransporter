/**
 * Zeitlich begrenzte Halloween-Aktion (Eigentümerauftrag 29.10.2026).
 * Läuft automatisch bis einschließlich 07.11.2026 (Berliner Zeit) und schaltet sich danach selbst ab.
 */
export const HALLOWEEN_START_MS = Date.parse("2026-10-29T00:00:00+01:00");
export const HALLOWEEN_END_MS = Date.parse("2026-11-08T00:00:00+01:00");

export function isHalloweenActive(nowMs: number = Date.now()): boolean {
  return nowMs >= HALLOWEEN_START_MS && nowMs < HALLOWEEN_END_MS;
}
