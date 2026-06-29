import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifyAdmin } from "@/lib/admin-notify";
import { getCheckoutSessionDetails } from "@/lib/payments.functions";
import { sendBookingConfirmation, sendAdminBookingNotification } from "@/lib/booking-emails.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { getPlanById } from "@/lib/booking-rules";
import type { BookingAddonSnapshot } from "@/lib/addons";

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
          addons?: BookingAddonSnapshot[];
        };

        const addons = Array.isArray(pending.addons) ? pending.addons : [];
        const addonsTotalCents = addons.reduce((s, a) => s + (a.price_cents ?? 0), 0);

        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: userData } = await supabase.auth.getUser();

        const planEntry = getPlanById(pending.planId);
        const freeKm = planEntry?.freeKm ?? (pending.planId === "6h" ? 300 : pending.planId === "24h" ? 500 : 0);
        const kmPriceCents = planEntry?.extraKmCents ?? 90;

        // Fahrzeug-Snapshot: bevorzugt aus pending (was der Nutzer gerade gesehen hat),
        // sonst echtes aktives Fahrzeug aus DB. Niemals hardcoded Fallback-Strings.
        let vehicleName = pending.vehicleName ?? null;
        let vehiclePlate = pending.vehiclePlate ?? null;
        if (!vehicleName || !vehiclePlate) {
          try {
            const { data: activeVehicle } = await supabase
              .from("vehicles")
              .select("name, plate")
              .eq("is_active", true)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (activeVehicle) {
              vehicleName = vehicleName ?? activeVehicle.name;
              vehiclePlate = vehiclePlate ?? activeVehicle.plate;
            }
          } catch (e) {
            console.warn("Aktives Fahrzeug konnte nicht ermittelt werden:", e);
          }
        }

        // Stripe-Session abrufen, um Customer + PaymentMethod zu speichern
        let stripeIds: {
          customerId: string | null;
          paymentIntentId: string | null;
          paymentMethodId: string | null;
        } = { customerId: null, paymentIntentId: null, paymentMethodId: null };
        try {
          const details = await getCheckoutSessionDetails({
            data: { sessionId, environment: getStripeEnvironment() },
          });
          stripeIds = {
            customerId: details.customerId,
            paymentIntentId: details.paymentIntentId,
            paymentMethodId: details.paymentMethodId,
          };
        } catch (e) {
          console.warn("Stripe-Session konnte nicht abgerufen werden:", e);
        }

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
              free_km: freeKm,
              km_price_cents: kmPriceCents,
              stripe_customer_id: stripeIds.customerId,
              stripe_payment_intent_id: stripeIds.paymentIntentId,
              stripe_payment_method_id: stripeIds.paymentMethodId,
              ...(vehicleName ? { vehicle_name: vehicleName } : {}),
              ...(vehiclePlate ? { vehicle_plate: vehiclePlate } : {}),
              addons,
              addons_total_cents: addonsTotalCents,
            })
            .select()
            .single();
          if (insertError || !booking) {
            setError("Buchung konnte nicht angelegt werden.");
            return;
          }
          bookingId = booking.id;
          // Reservierungs-Hold freigeben — die Buchung blockiert den Slot nun selbst
          await supabase
            .from("booking_holds")
            .delete()
            .eq("user_id", userData.user.id)
            .eq("start_date", pending.startDate)
            .eq("start_hour", pending.startHour);
          notifyAdmin({
            type: "booking_created",
            title: "Neue Buchung",
            body: `${pending.planLabel} · Start ${pending.startDate} ${String(pending.startHour).padStart(2, "0")}:00 · Code ${code}`,
            bookingId,
            userId: userData.user.id,
          });
          // Buchungsbestätigung per E-Mail (still im Hintergrund)
          sendBookingConfirmation({ data: { bookingId } }).catch((e) =>
            console.warn("Buchungsbestätigung konnte nicht gesendet werden:", e),
          );
          // Admin-E-Mail + Admin-Push laufen serverseitig in sendAdminBookingNotification
          sendAdminBookingNotification({ data: { bookingId } }).catch((e) =>
            console.warn("Admin-Mail/Push konnte nicht gesendet werden:", e),
          );
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
              Deine Buchung wird vorbereitet, einen Moment bitte...
            </p>
          </>
        )}
      </div>
    </main>
  );
}