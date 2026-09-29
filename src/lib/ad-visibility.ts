/**
 * Globale Unterdrückung von Werbeflächen während transaktionaler Schritte
 * (Registrierung, Login, Dokumenten-Upload, Zahlung, Bestätigung, aktive Fahrt).
 *
 * Quellenbasiert: Jede Quelle (Hook-Instanz) meldet sich einzeln an/ab. Werbung
 * ist unterdrückt, solange mindestens eine Quelle aktiv ist oder der manuelle
 * Schalter `setAdsSuppressed(true)` gesetzt ist. Eine inaktive Quelle kann so
 * keine andere aktive Quelle überschreiben.
 *
 * Reines UI-Signal, keine Geschäftslogik.
 */

import { useEffect, useId, useState } from "react";

let manual = false;
const sources = new Set<string>();
let current = false;
const listeners = new Set<(value: boolean) => void>();

function emit(): void {
  const next = manual || sources.size > 0;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(next);
}

export function areAdsSuppressed(): boolean {
  return current;
}

/** Manueller Schalter (bestehende API), unabhängig von Hook-Quellen. */
export function setAdsSuppressed(value: boolean): void {
  manual = value;
  emit();
}

/** Quelle an- oder abmelden. */
export function setAdsSuppressionSource(source: string, active: boolean): void {
  if (active) sources.add(source);
  else sources.delete(source);
  emit();
}

export function subscribeAdsSuppressed(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdsSuppressed(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    setValue(areAdsSuppressed());
    return subscribeAdsSuppressed(setValue);
  }, []);
  return value;
}

/** Hilfshook: unterdrückt Werbung, solange `active` wahr ist (pro Aufrufer eigene Quelle). */
export function useSuppressAds(active: boolean): void {
  const id = useId();
  useEffect(() => {
    setAdsSuppressionSource(id, active);
    return () => setAdsSuppressionSource(id, false);
  }, [id, active]);
}
