import { useRouterState } from "@tanstack/react-router";

/**
 * Aktueller Pfad aus dem TanStack-Router (reaktiv bei SPA-Navigation).
 * Einzige Pfadquelle für Werbe-Policy, Slots und CMP-Bootstrap, damit nie
 * eine Policy vom vorherigen Pfad weitergilt.
 */
export function useAdPathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}
