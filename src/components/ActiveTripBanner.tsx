import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useActiveTrip } from "@/hooks/useActiveTrip";
import { isTripPath } from "@/lib/active-trip";

/** Höhe der Leiste ohne Safe Area. Seite, Navbar, Hinweise und Toasts rücken per --mt-trip-bar nach unten. */
export const BAR_PX = 44;
export const TRIP_BAR_HEIGHT = `calc(${BAR_PX}px + env(safe-area-inset-top))`;

/** Schwarze Leiste OBEN (wie bei laufendem Telefonat). */
export function ActiveTripBannerView({ bookingId }: { bookingId: string }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-[80]"
      style={{ paddingTop: "env(safe-area-inset-top)", background: "var(--trip-bar)" }}
      data-testid="active-trip-banner"
    >
      <Link
        to="/trip/$bookingId"
        params={{ bookingId }}
        className="flex w-full items-center justify-center gap-1.5 px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ minHeight: BAR_PX, color: "var(--trip-bar-foreground)", background: "var(--trip-bar)" }}
      >
        Sofort zurückkehren
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Wird als Geschwister von <Outlet /> gerendert; Platz entsteht nur über die
 * CSS-Variable (body padding-top), damit die Seite beim Ein-/Ausblenden nicht neu mountet.
 */
export function ActiveTripBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { trip } = useActiveTrip(null);
  const visible = !!trip && !isTripPath(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty("--mt-trip-bar", TRIP_BAR_HEIGHT);
    else root.style.removeProperty("--mt-trip-bar");
    return () => {
      root.style.removeProperty("--mt-trip-bar");
    };
  }, [visible]);

  if (!visible || !trip) return null;
  return <ActiveTripBannerView bookingId={trip.id} />;
}
