/** Routenalternativen sortiert nach Dauer, mit Originalindex für DirectionsRenderer.setRouteIndex. */
export interface RouteAlt {
  originalIndex: number;
  distance: string;
  duration: string;
  durationValue: number;
  distanceValue: number;
}

export function rankRoutes(
  routes: Array<{ legs: Array<{ distance?: { text?: string; value?: number }; duration?: { text?: string; value?: number } } | undefined> }>,
): RouteAlt[] {
  return routes
    .map((r, originalIndex) => {
      const l = r.legs[0];
      return {
        originalIndex,
        distance: l?.distance?.text || "",
        duration: l?.duration?.text || "",
        durationValue: l?.duration?.value || 0,
        distanceValue: l?.distance?.value || 0,
      };
    })
    .sort((a, b) => a.durationValue - b.durationValue || a.originalIndex - b.originalIndex);
}

/** Monoton steigender Token: nur die jüngste Anfrage darf den Zustand setzen. */
export function createRequestGate() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (t: number) => t === current,
    invalidate: () => {
      current++;
    },
  };
}
