import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_TRIP_STATUSES,
  TRIP_COMPLETION_REQUIRED_FROM,
  pickActiveTrip,
  type ActiveTrip,
  type ActiveTripRow,
} from "@/lib/active-trip";
import { clearAllTripSnapshots, isNetworkFailure, loadTrips, replaceTrips } from "@/lib/trip-snapshot";

const POLL_MS = 60_000;

/**
 * Laufende eigene Miete. Serverstatus ist Wahrheit; Netzfehler behalten den
 * letzten Stand desselben Kontos. Abmelden/Kontowechsel invalidiert synchron
 * (Identität + Request-Generation), bevor der nächste Render passiert.
 * Im Auth-Callback wird nur synchroner State gesetzt (kein Supabase-Aufruf → kein Lock).
 */
export function useActiveTrip(preferredId?: string | null) {
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<{ uid: string; trip: ActiveTrip | null; stale: boolean } | null>(null);
  const userRef = useRef<string | null>(null);
  const prefRef = useRef(preferredId ?? null);
  prefRef.current = preferredId ?? null;
  const seq = useRef(0);
  const alive = useRef(true);

  /** Synchroner Identitätswechsel: alte Antworten sofort ungültig. */
  const applyUser = useCallback((uid: string | null) => {
    if (userRef.current === uid) return;
    // Abmelden/Kontowechsel: kein Offline-Stand eines anderen Kontos bleibt auf dem Gerät.
    if (userRef.current !== null || uid === null) clearAllTripSnapshots();
    userRef.current = uid;
    seq.current++;
    setState(null);
    setUserId(uid);
  }, []);

  useEffect(() => {
    alive.current = true;
    let authEventSeen = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // Ein späteres Auth-Ereignis (Logout/Kontowechsel) hat Vorrang vor dem Initialsnapshot.
        if (alive.current && !authEventSeen) applyUser(data.session?.user?.id ?? null);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      authEventSeen = true;
      applyUser(session?.user?.id ?? null);
    });
    return () => {
      alive.current = false;
      seq.current++;
      sub.subscription.unsubscribe();
    };
  }, [applyUser]);

  const refresh = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    const my = ++seq.current;
    const fromSnapshot = () => {
      if (!alive.current || my !== seq.current || userRef.current !== uid) return;
      const trip = pickActiveTrip(loadTrips(uid), uid, prefRef.current);
      setState((prev) => (trip ? { uid, trip, stale: true } : prev && prev.uid === uid ? { ...prev, stale: true } : prev));
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return fromSnapshot();
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, user_id, status, start_date, start_hour, plan_id, plan_label, vehicle_name, vehicle_plate, start_km, free_km, km_price_cents, addons")
        .eq("user_id", uid)
        .in("status", [...ACTIVE_TRIP_STATUSES])
        .gte("start_date", TRIP_COMPLETION_REQUIRED_FROM);
      if (error) throw error;
      // Nur die jüngste Anfrage desselben Kontos darf den Stand setzen.
      if (!alive.current || my !== seq.current || userRef.current !== uid) return;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      replaceTrips(uid, rows);
      setState({ uid, trip: pickActiveTrip(rows as unknown as ActiveTripRow[], uid, prefRef.current), stale: false });
    } catch (err) {
      // Nur echte Verbindungsfehler nutzen den letzten bestätigten Stand; sonst letzten Stand behalten.
      if (isNetworkFailure(err)) fromSnapshot();
    }
  }, []);

  // Geöffnete Fahrt geändert → Priorität neu bestimmen.
  useEffect(() => {
    if (userRef.current) void refresh();
  }, [preferredId, refresh]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const onWake = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);
    document.addEventListener("visibilitychange", onWake);
    const poll = setInterval(onWake, POLL_MS);
    const channel = supabase
      .channel(`active-trip-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
      document.removeEventListener("visibilitychange", onWake);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Ausgabe nur, wenn der Stand zum aktuellen Konto gehört.
  const own = state && userId && state.uid === userId ? state : null;
  return { userId, trip: own?.trip ?? null, stale: own?.stale ?? false, refresh };
}
