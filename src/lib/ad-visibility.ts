/**
 * Globale Unterdrückung von Werbeflächen während transaktionaler Schritte
 * (Registrierung, Dokumenten-Upload, Zahlung, Bestätigung, aktive Fahrt).
 *
 * Reines UI-Signal, keine Geschäftslogik.
 */

import { useEffect, useState } from "react";

let suppressed = false;
const listeners = new Set<(value: boolean) => void>();

export function areAdsSuppressed(): boolean {
  return suppressed;
}

export function setAdsSuppressed(value: boolean): void {
  if (suppressed === value) return;
  suppressed = value;
  for (const listener of listeners) listener(value);
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

/** Hilfshook: setzt die Unterdrückung während der Lebensdauer einer Bedingung. */
export function useSuppressAds(active: boolean): void {
  useEffect(() => {
    setAdsSuppressed(active);
    return () => setAdsSuppressed(false);
  }, [active]);
}
