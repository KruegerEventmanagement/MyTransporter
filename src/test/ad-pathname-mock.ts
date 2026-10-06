import { useSyncExternalStore } from "react";

/** Reaktiver Test-Ersatz für den Router-Pfad (simuliert SPA-Navigation). */
const listeners = new Set<() => void>();
export function navigateAdPath(path: string): void {
  window.history.replaceState(null, "", path);
  for (const l of listeners) l();
}
export function useAdPathnameMock(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => window.location.pathname,
    () => "/",
  );
}
