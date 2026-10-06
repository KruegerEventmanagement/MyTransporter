import { IS_NATIVE_BUILD } from "@/lib/native/platform";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { privateHead } from "@/lib/seo";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PreDriveFlow } from "@/components/PreDriveFlow";
import { ReturnFlow } from "@/components/ReturnFlow";
import { ActiveTripDashboard } from "@/components/ActiveTripDashboard";
import { ScheduledTripView } from "@/components/ScheduledTripView";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { requireLogin } from "@/lib/login-redirect";
import { resolveTripWindow } from "@/lib/trip-time";
import { isLegacyOpenTrip, isReturningStatus, phaseFor } from "@/lib/active-trip";
import { loadReturnDraft, saveReturnDraft, clearReturnDraft } from "@/lib/return-draft";
import { BrandHomeLink } from "@/components/BrandHomeLink";

export const Route = createFileRoute("/trip/$bookingId")({
  head: () => privateHead("MyTransporter · Fahrt"),
  component: TripPage,
});

type Phase = "pre" | "active" | "return" | "done";

interface Booking {
  id: string;
  user_id?: string;
  plan_id: string;
  plan_label: string;
  start_date: string;
  start_hour: number;
  pickup_code: string;
  vehicle_name: string;
  vehicle_plate: string;
  start_km: number | null;
  free_km?: number | null;
  km_price_cents?: number | null;
  addons?: Array<{ id: string; label: string; price_cents: number }> | null;
  status?: string | null;
  return_code?: string | null;
}

const LOAD_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function TripLogoBar() {
  return (
    <div className="px-4 pb-2" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <BrandHomeLink imageClassName="h-8 w-auto" />
    </div>
  );
}

function TripPage() {
  const { bookingId } = Route.useParams();
  // Neuer Schlüssel je Buchung: kein Zustand (Phase, Start-KM, Adresse) wandert zur nächsten Fahrt.
  return <TripView key={bookingId} bookingId={bookingId} />;
}

type PickupState = { status: "loading" | "ok" | "missing" | "error"; address: string | null };

function TripView({ bookingId }: { bookingId: string }) {
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("pre");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [startKm, setStartKm] = useState<number | null>(null);
  const [pickup, setPickup] = useState<PickupState>({ status: "loading", address: null });
  const [now, setNow] = useState(() => Date.now());
  const loadedOnce = useRef(false);
  /** Request-Generation: nur die jüngste Antwort des aktuellen Kontos zählt. */
  const gen = useRef(0);
  const alive = useRef(true);
  const uidRef = useRef<string | null>(null);

  const resetForIdentity = useCallback(() => {
    gen.current++;
    loadedOnce.current = false;
    setBooking(null);
    setPhase("pre");
    setStartKm(null);
    setPickup({ status: "loading", address: null });
    setLoadError(null);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      gen.current++;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Offline-Hinweis für Navigationen ohne Netz (keine privaten Daten im Cache).
  useEffect(() => {
    if (IS_NATIVE_BUILD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  // Auth-Wechsel: nur synchroner State; fremde Fahrt sofort entfernen.
  useEffect(() => {
    if (bookingId.startsWith("demo-")) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      if (uid === uidRef.current) return;
      const hadUser = uidRef.current !== null;
      uidRef.current = uid;
      if (!hadUser && uid === null) return;
      resetForIdentity();
      setUserId(uid);
      if (!uid) {
        setLoading(false);
        requireLogin(navigate, `/trip/${bookingId}`);
      } else {
        setLoading(true);
        setAttempt((n) => n + 1);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [bookingId, navigate, resetForIdentity]);

  const load = useCallback(
    async (silent: boolean) => {
      const my = ++gen.current;
      const current = () => alive.current && my === gen.current;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      if (bookingId.startsWith("demo-")) {
        try {
          const raw = localStorage.getItem(`mt_demo_${bookingId}`);
          if (raw) {
            const d = JSON.parse(raw);
            if (!d || typeof d !== "object") throw new Error("demo");
            setBooking({
              id: bookingId,
              plan_id: d.planId,
              plan_label: d.planLabel,
              start_date: d.startDate,
              start_hour: d.startHour,
              pickup_code: d.pickup_code,
              vehicle_name: d.vehicleName ?? "",
              vehicle_plate: d.vehiclePlate ?? "",
              start_km: typeof d.startKm === "number" ? d.startKm : null,
            });
            if (typeof d.startKm === "number") setStartKm(d.startKm);
          }
        } catch {
          setBooking(null);
          setLoadError("Die Demo-Fahrt auf diesem Gerät ist beschädigt.");
        } finally {
          setLoading(false);
        }
        return;
      }
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), LOAD_TIMEOUT_MS);
        if (!current()) return;
        const uid = session?.user?.id ?? null;
        if (uidRef.current !== null && uidRef.current !== uid) {
          // Ein Auth-Ereignis war schneller; dessen Stand gilt.
          return;
        }
        uidRef.current = uid;
        if (!uid) {
          setLoading(false);
          // Nach dem Login direkt zurück zu genau dieser Fahrt
          requireLogin(navigate, `/trip/${bookingId}`);
          return;
        }
        setUserId(uid);
        const { data, error } = await withTimeout(
          supabase.from("bookings").select("*").eq("id", bookingId).eq("user_id", uid).maybeSingle(),
          LOAD_TIMEOUT_MS,
        );
        if (!current() || uidRef.current !== uid) return;
        if (error) throw error;
        if (!data) {
          setBooking(null);
          setLoading(false);
          return;
        }
        const b = data as unknown as Booking;
        if (b.user_id && b.user_id !== uid) {
          setBooking(null);
          setLoading(false);
          return;
        }
        if (b.status === "completed" || b.status === "cancelled") {
          clearReturnDraft(uid, bookingId);
          if (!loadedOnce.current) {
            navigate({ to: "/buchung/$bookingId", params: { bookingId } });
            return;
          }
          setPhase("done");
          return;
        }
        loadedOnce.current = true;
        setBooking(b);
        if (typeof b.start_km === "number") setStartKm(b.start_km);
        const draft = loadReturnDraft(uid, bookingId);
        setPhase((prev) => (prev === "return" && !isReturningStatus(b.status) ? "return" : phaseFor(b.status, !!draft?.started)));
        setLoadError(null);
      } catch {
        if (!current()) return;
        // Beim stillen Neuladen bleibt der letzte Stand sichtbar.
        if (!silent || !loadedOnce.current) setLoadError("Die Verbindung ist gerade zu langsam oder unterbrochen.");
      } finally {
        if (!silent && current()) setLoading(false);
      }
    },
    [bookingId, navigate],
  );

  useEffect(() => {
    void load(false);
  }, [load, attempt]);

  // Serverstatus bei Rückkehr/Fokus/online revalidieren.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "hidden") void load(true);
    };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    const poll = setInterval(wake, 60_000);
    return () => {
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", wake);
      clearInterval(poll);
    };
  }, [load]);

  // Bestätigter fahrzeugbezogener Abholort; kein geratener Ersatz.
  const plate = booking?.vehicle_plate ?? null;
  useEffect(() => {
    if (!plate) {
      setPickup({ status: "missing", address: null });
      return;
    }
    let active = true;
    setPickup({ status: "loading", address: null });
    Promise.resolve(supabase.from("vehicles").select("pickup_address").eq("plate", plate).maybeSingle()).then(
      ({ data, error }) => {
        if (!active || !alive.current) return;
        if (error) setPickup({ status: "error", address: null });
        else if (data?.pickup_address?.trim()) setPickup({ status: "ok", address: data.pickup_address.trim() });
        else setPickup({ status: "missing", address: null });
      },
      () => {
        if (active && alive.current) setPickup({ status: "error", address: null });
      },
    );
    return () => {
      active = false;
    };
  }, [plate]);

  const startReturn = () => {
    if (userId) saveReturnDraft(userId, bookingId, { started: true });
    setPhase("return");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </main>
    );
  }

  if (loadError && !booking) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold mb-2">Fahrt konnte nicht geladen werden</h1>
          <p className="text-sm text-muted-foreground mb-4">{loadError} Bitte versuche es gleich noch einmal.</p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="mb-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 text-background font-semibold"
          >
            <RotateCcw className="w-4 h-4" /> Erneut versuchen
          </button>
          <div>
            <Link to="/profil" className="underline">
              Zu meinen Buchungen
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold mb-2">Diese Buchung finden wir nicht</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Möglicherweise gehört sie zu einem anderen Konto oder der Link ist nicht mehr gültig. In deinem Profil findest du alle deine Buchungen – auch vergangene.
          </p>
          <Link to="/profil" className="underline">
            Zu meinen Buchungen
          </Link>
        </div>
      </main>
    );
  }

  // Offene Altbuchung vor dem Stichtag: verfallen, kein Rückgabeablauf mehr.
  if (!bookingId.startsWith("demo-") && isLegacyOpenTrip(booking)) {
    return (
      <main className="min-h-screen bg-background flex flex-col">
        <TripLogoBar />
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <div className="max-w-sm" data-testid="trip-expired">
            <h1 className="text-2xl font-bold mb-2">Diese Buchung ist abgelaufen</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Die Fahrt liegt in der Vergangenheit und muss nicht mehr abgeschlossen werden. Du kannst jederzeit neu buchen.
            </p>
            <div className="flex flex-col items-center gap-3">
              <Link
                to="/"
                className="inline-flex min-h-12 items-center rounded-full bg-foreground px-8 text-background font-semibold"
              >
                Neu buchen
              </Link>
              <Link to="/profil" className="underline text-sm">
                Zu meinen Buchungen
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const window_ = resolveTripWindow(booking);
  const startDate = new Date(window_.startMs);
  const unlockAt = new Date(window_.startMs - 30 * 60_000);
  const isUnlocked = now >= unlockAt.getTime();
  const effectiveStartKm = booking.start_km ?? startKm ?? 0;

  if (phase === "pre" && !isUnlocked) {
    return (
      <ScheduledTripView
        startDate={startDate}
        startHour={booking.start_hour}
        vehicleName={booking.vehicle_name}
        vehiclePlate={booking.vehicle_plate}
        planLabel={booking.plan_label}
        unlockAt={unlockAt}
        addons={booking.addons ?? undefined}
      />
    );
  }

  return (
    <>
      {phase === "pre" && (
        <main className="min-h-screen bg-background pb-12 px-4">
          <TripLogoBar />
          <PreDriveFlow
            key={`${userId ?? "anon"}:${booking.id}`}
            bookingId={booking.id}
            pickupCode={booking.pickup_code}
            onComplete={(km) => {
              setStartKm(km);
              if (bookingId.startsWith("demo-")) {
                const raw = localStorage.getItem(`mt_demo_${bookingId}`);
                if (raw) {
                  try {
                    const d = JSON.parse(raw);
                    d.startKm = km;
                    localStorage.setItem(`mt_demo_${bookingId}`, JSON.stringify(d));
                  } catch {
                    /* ignore */
                  }
                }
              }
              setBooking((prev) => (prev ? { ...prev, start_km: km, status: "active" } : prev));
              setPhase("active");
            }}
          />
        </main>
      )}

      {phase === "active" && (
        <ActiveTripDashboard
          bookingId={booking.id}
          userId={userId}
          startAtMs={window_.startMs}
          endAtMs={window_.endMs}
          startKm={effectiveStartKm}
          vehicleName={booking.vehicle_name}
          vehiclePlate={booking.vehicle_plate}
          planLabel={booking.plan_label}
          addons={(booking.addons ?? []).filter((a) => a.id !== "km_paket")}
          key={`${userId ?? "anon"}:${booking.id}`}
          pickupAddress={pickup.address}
          pickupStatus={pickup.status}
          onReturn={startReturn}
        />
      )}

      {phase === "return" && (
        <main className="min-h-screen bg-background pb-12 px-4">
          <TripLogoBar />
          <ReturnFlow
            key={`${userId ?? "anon"}:${booking.id}`}
            bookingId={booking.id}
            userId={userId}
            serverReturnCode={isReturningStatus(booking.status) ? (booking.return_code ?? null) : null}
            planId={booking.plan_id}
            startKm={effectiveStartKm}
            freeKm={booking.free_km ?? null}
            kmPriceCents={booking.km_price_cents ?? null}
            addons={booking.addons ?? undefined}
            onBookingRefresh={() => load(true)}
            onComplete={() => {
              if (userId) clearReturnDraft(userId, bookingId);
              setPhase("done");
            }}
          />
        </main>
      )}

      {phase === "done" && (
        <main className="min-h-screen bg-background flex flex-col">
          <TripLogoBar />
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="max-w-md text-center">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-foreground" />
              </div>
              <p className="inline-block mb-3 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                Rückgabe von MyTransporter bestätigt
              </p>
              <h1 className="text-3xl font-bold mb-2">Fahrt beendet</h1>
              <p className="text-muted-foreground mb-8">Vielen Dank! Deine Buchung ist abgeschlossen.</p>
              <Link
                to="/"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium"
              >
                Zur Startseite
              </Link>
            </div>
          </div>
        </main>
      )}
    </>
  );
}
