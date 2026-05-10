import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PreDriveFlow } from "@/components/PreDriveFlow";
import { ReturnFlow } from "@/components/ReturnFlow";
import { ActiveTripDashboard } from "@/components/ActiveTripDashboard";
import { Loader2, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trip/$bookingId")({
  component: TripPage,
});

type Phase = "pre" | "active" | "return" | "done";

interface Booking {
  id: string;
  plan_id: string;
  plan_label: string;
  start_date: string;
  start_hour: number;
  pickup_code: string;
  vehicle_name: string;
  vehicle_plate: string;
  start_km: number | null;
}

function TripPage() {
  const { bookingId } = Route.useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [phase, setPhase] = useState<Phase>("pre");
  const [loading, setLoading] = useState(true);
  const [startKm, setStartKm] = useState<number>(42850);

  useEffect(() => {
    const load = async () => {
      // Demo-Buchung ohne Auth
      if (bookingId.startsWith("demo-")) {
        const raw = localStorage.getItem(`mt_demo_${bookingId}`);
        if (raw) {
          const d = JSON.parse(raw);
          setBooking({
            id: bookingId,
            plan_id: d.planId,
            plan_label: d.planLabel,
            start_date: d.startDate,
            start_hour: d.startHour,
            pickup_code: d.pickup_code,
            vehicle_name: "Fiat Ducato L4H2",
            vehicle_plate: "B-MT 1234",
            start_km: 42850,
          });
        }
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();
      if (data) {
        setBooking(data as Booking);
        if (data.start_km) setStartKm(data.start_km);
      }
      setLoading(false);
    };
    load();
  }, [bookingId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Buchung nicht gefunden</h1>
          <Link to="/" className="underline">Zurück zur Startseite</Link>
        </div>
      </main>
    );
  }

  const startDate = new Date(booking.start_date);

  return (
    <>
      {phase === "pre" && (
        <main className="min-h-screen bg-background py-12 px-4">
          <PreDriveFlow
            bookingId={booking.id}
            pickupCode={booking.pickup_code}
            onComplete={() => setPhase("active")}
          />
        </main>
      )}

      {phase === "active" && (
        <ActiveTripDashboard
          bookingId={booking.id}
          startDate={startDate}
          startHour={booking.start_hour}
          startKm={startKm}
          vehicleName={booking.vehicle_name}
          vehiclePlate={booking.vehicle_plate}
          planLabel={booking.plan_label}
          onReturn={() => setPhase("return")}
        />
      )}

      {phase === "return" && (
        <main className="min-h-screen bg-background py-12 px-4">
          <ReturnFlow
            bookingId={booking.id}
            onComplete={() => setPhase("done")}
          />
        </main>
      )}

      {phase === "done" && (
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-foreground" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Fahrt beendet</h1>
            <p className="text-muted-foreground mb-8">
              Vielen Dank! Deine Buchung ist abgeschlossen.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium hover:scale-[1.02] transition-all"
            >
              Zur Startseite
            </Link>
          </div>
        </main>
      )}
    </>
  );
}
