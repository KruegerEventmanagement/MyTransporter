import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifyAdmin } from "@/lib/admin-notify";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Keine Sitzungs-Information gefunden.");
      return;
    }

    let cancelled = false;
    const finalize = async () => {
      try {
        const raw = localStorage.getItem("mt_pending_booking");
        if (!raw) {
          setError("Buchungsdaten nicht gefunden. Bitte erneut buchen.");
          return;
        }
        const pending = JSON.parse(raw) as {
          planId: string;
          planLabel: string;
          planPrice: number;
          startDate: string;
          startHour: number;
          vehicleName?: string;
          vehiclePlate?: string;
        };

        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: userData } = await supabase.auth.getUser();

        let bookingId: string;
        if (userData?.user) {
          const { data: booking, error: insertError } = await supabase
            .from("bookings")
            .insert({
              user_id: userData.user.id,
              plan_id: pending.planId,
              plan_label: pending.planLabel,
              plan_price: pending.planPrice,
              start_date: pending.startDate,
              start_hour: pending.startHour,
              pickup_code: code,
              status: "paid",
              ...(pending.vehicleName ? { vehicle_name: pending.vehicleName } : {}),
              ...(pending.vehiclePlate ? { vehicle_plate: pending.vehiclePlate } : {}),
            })
            .select()
            .single();
          if (insertError || !booking) {
            setError("Buchung konnte nicht angelegt werden.");
            return;
          }
          bookingId = booking.id;
          notifyAdmin({
            type: "booking_created",
            title: "Neue Buchung",
            body: `${pending.planLabel} · Start ${pending.startDate} ${String(pending.startHour).padStart(2, "0")}:00 · Code ${code}`,
            bookingId,
            userId: userData.user.id,
          });
        } else {
          // Demo-Fallback ohne Auth
          bookingId = "demo-" + Date.now();
          localStorage.setItem(
            `mt_demo_${bookingId}`,
            JSON.stringify({ ...pending, pickup_code: code })
          );
        }

        localStorage.removeItem("mt_pending_booking");
        if (!cancelled) {
          navigate({ to: "/trip/$bookingId", params: { bookingId }, replace: true });
        }
      } catch (e) {
        console.error(e);
        setError("Etwas ist schiefgelaufen.");
      }
    };
    finalize();
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigate]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {error ? (
          <>
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Hoppla</h1>
            <p className="text-muted-foreground mb-8">{error}</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02]"
            >
              Zur Buchung
            </a>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-foreground animate-spin" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Zahlung erfolgreich</h1>
            <p className="text-muted-foreground">
              Deine Buchung wird vorbereitet – einen Moment bitte...
            </p>
          </>
        )}
      </div>
    </main>
  );
}