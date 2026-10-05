import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_TRIP_STATUSES,
  pickActiveTrip,
  type ActiveTrip,
  type ActiveTripRow,
} from "@/lib/active-trip";

const POLL_MS = 60_000;

/**
 * Laufende eigene Miete. Serverstatus ist Wahrheit; Netzfehler behalten den
 * letzten Stand desselben Kontos. Abmelden/Kontowechsel leert sofort.
 * Im Auth-Callback wird nur der Nutzer gesetzt (kein Supabase-Aufruf → kein Lock).
 */
export function useActiveTrip(preferredId?: string | null) {
  const [userId, setUserId] = useState<string | null>(null);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const userRef = useRef<string | null>(null);
  const prefRef = useRef(preferredId ?? null);
  prefRef.current = preferredId ?? null;
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setUserId(data.session?.user?.id ?? null);
      })
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return;
    const my = ++seq.current;
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, user_id, status, start_date, start_hour, plan_id, vehicle_name, vehicle_plate")
        .eq("user_id", uid)
        .in("status", [...ACTIVE_TRIP_STATUSES]);
      if (error) throw error;
      // Antwort verwerfen, wenn inzwischen Konto gewechselt oder neuer Lauf gestartet.
      if (my !== seq.current || userRef.current !== uid) return;
      setTrip(pickActiveTrip((data ?? []) as ActiveTripRow[], uid, prefRef.current));
    } catch {
      /* Netzfehler: letzten Stand desselben Kontos behalten */
    }
  }, []);

  useEffect(() => {
    userRef.current = userId;
    seq.current++;
    setTrip(null);
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

  return { userId, trip, refresh };
}
