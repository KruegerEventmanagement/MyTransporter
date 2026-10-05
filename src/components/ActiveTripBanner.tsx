import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useActiveTrip } from "@/hooks/useActiveTrip";
import { isTripPath } from "@/lib/active-trip";

/** Höhe der Leiste ohne Safe Area; andere Overlays rücken per CSS-Variable nach oben. */
const BAR_PX = 56;

export function ActiveTripBannerView({ bookingId }: { bookingId: string }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", background: "var(--trip-bar)" }}
      data-testid="active-trip-banner"
    >
      <Link
        to="/trip/$bookingId"
        params={{ bookingId }}
        className="flex w-full items-center justify-center gap-2 px-4 text-base font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ minHeight: BAR_PX, color: "var(--trip-bar-foreground)", background: "var(--trip-bar)" }}
      >
        Sofort zurückkehren
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Link>
    </div>
  );
}

export function ActiveTripBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { trip } = useActiveTrip();
  const visible = !!trip && !isTripPath(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty("--mt-trip-bar", `calc(${BAR_PX}px + env(safe-area-inset-bottom))`);
    else root.style.removeProperty("--mt-trip-bar");
    return () => root.style.removeProperty("--mt-trip-bar");
  }, [visible]);

  if (!visible || !trip) return null;
  return (
    <>
      {/* Platzhalter, damit Seiteninhalt und Buttons am Ende nicht verdeckt werden */}
      <div aria-hidden style={{ height: `calc(${BAR_PX}px + env(safe-area-inset-bottom))` }} />
      <ActiveTripBannerView bookingId={trip.id} />
    </>
  );
}
