import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Car, Wallet, Route as RouteIcon, Calendar, Hash, MapPin, X, Shield } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useServerFn } from "@tanstack/react-start";
import { cancelBookingWithRefund } from "@/lib/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/profil")({
  head: () => ({ meta: [{ title: "MyTransporter · Profil" }] }),
  component: ProfilePage,
});

interface Booking {
  id: string;
  vehicle_name: string;
  vehicle_plate: string;
  plan_label: string;
  plan_price: number;
  deposit: number;
  deposit_status: string;
  start_date: string;
  start_hour: number;
  start_km: number | null;
  end_km: number | null;
  pickup_code: string;
  status: string;
  created_at: string;
  remarks?: string | null;
  deposit_deducted_cents?: number | null;
  deposit_refund_id?: string | null;
}

interface Profile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });
    if (data) setBookings(data as Booking[]);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/" });
        return;
      }
      const [p, b] = await Promise.all([
        supabase.from("profiles").select("first_name, last_name, email, phone").eq("id", user.id).maybeSingle(),
        supabase.from("bookings").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
      ]);
      if (!mounted) return;
      if (p.data) setProfile(p.data as Profile);
      if (b.data) setBookings(b.data as Booking[]);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");
      if (mounted) setIsAdmin(!!roles && roles.length > 0);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const stats = useMemo(() => {
    const completedOrPaid = bookings.filter((b) => b.status !== "paid" || b.start_km !== null);
    const totalSpent = bookings.reduce((sum, b) => sum + Number(b.plan_price ?? 0), 0);
    const totalKm = bookings.reduce((sum, b) => {
      if (b.start_km !== null && b.end_km !== null) return sum + Math.max(0, b.end_km - b.start_km);
      return sum;
    }, 0);
    const active = bookings.find((b) => b.status === "active" || b.status === "returning");
    const vehicles = new Set(bookings.map((b) => b.vehicle_plate));
    const upcoming = bookings
      .filter((b) => b.status === "paid" && b.start_km === null)
      .sort((a, b) => {
        const da = new Date(`${a.start_date}T${String(a.start_hour).padStart(2, "0")}:00:00`).getTime();
        const db = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`).getTime();
        return da - db;
      });
    return {
      totalTrips: bookings.length,
      completed: completedOrPaid.length,
      totalSpent,
      totalKm,
      activeBooking: active,
      vehicleCount: vehicles.size,
      upcoming,
    };
  }, [bookings]);

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Mein Konto";

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Laden…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80"
            aria-label="Zurück"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">{displayName}</h1>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
          </div>
          {isAdmin && (
            <Link
              to="/admin"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 mt-6 space-y-6">
        {/* Statistiken */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<RouteIcon className="w-4 h-4" />} label="Fahrten" value={String(stats.totalTrips)} />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Ausgegeben" value={`${stats.totalSpent.toFixed(2)} €`} />
          <StatCard icon={<MapPin className="w-4 h-4" />} label="Kilometer" value={`${stats.totalKm} km`} />
          <StatCard icon={<Car className="w-4 h-4" />} label="Fahrzeuge" value={String(stats.vehicleCount)} />
        </section>

        {/* Aktive Buchung */}
        {stats.activeBooking && (
          <Link
            to="/trip/$bookingId"
            params={{ bookingId: stats.activeBooking.id }}
            className="block rounded-2xl bg-foreground text-background p-4"
          >
            <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Aktive Fahrt</p>
            <p className="font-bold text-lg">{stats.activeBooking.vehicle_name}</p>
            <p className="text-xs opacity-80 mt-0.5">
              {stats.activeBooking.vehicle_plate} · {stats.activeBooking.plan_label}
            </p>
            <p className="text-xs opacity-70 mt-2">Tippen, um zur Fahrt zu wechseln →</p>
          </Link>
        )}

        {/* Anstehende Fahrten, mit direkter Stornier-Möglichkeit */}
        {stats.upcoming.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Anstehende Fahrt{stats.upcoming.length > 1 ? "en" : ""}
            </h2>
            <ul className="space-y-2">
              {stats.upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} onCancelled={loadBookings} />
              ))}
            </ul>
          </section>
        )}

        {/* Buchungs-Historie */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
            Alle Fahrten
          </h2>
          {bookings.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">Du hast noch keine Buchungen.</p>
              <Link
                to="/"
                className="mt-4 inline-block rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium"
              >
                Jetzt buchen
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {bookings.map((b) => (
                <BookingRow key={b.id} booking={b} onCancelled={loadBookings} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function computeCancellationFee(b: Booking): { hours: number; fee: number; startsAt: Date } {
  const startsAt = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`);
  const diffMs = startsAt.getTime() - Date.now();
  const hours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
  // Kostenlos ab 13 h vor Abfahrt. Innerhalb von 12 h: 1 € (12 h vorher) bis 12 € (1 h vorher / weniger).
  let fee: number;
  if (hours >= 13) fee = 0;
  else if (hours <= 1) fee = 12;
  else fee = 13 - hours;
  return { hours, fee, startsAt };
}

function BookingRow({ booking: b, onCancelled }: { booking: Booking; onCancelled: () => void | Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancellable = b.status === "paid" && b.start_km === null;
  const { hours, fee, startsAt } = useMemo(() => computeCancellationFee(b), [b]);
  const cancelFn = useServerFn(cancelBookingWithRefund);

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelFn({ data: { bookingId: b.id, environment: getStripeEnvironment() } });
      setCancelling(false);
      setConfirming(false);
      await onCancelled();
    } catch (e) {
      setCancelling(false);
      setError(e instanceof Error ? e.message : "Stornierung fehlgeschlagen");
    }
  };

  const km = b.start_km !== null && b.end_km !== null ? Math.max(0, b.end_km - b.start_km) : null;
  const dateLabel = (() => {
    try {
      return format(new Date(b.start_date), "dd. MMM yyyy", { locale: de });
    } catch {
      return b.start_date;
    }
  })();

  return (
    <li className="rounded-2xl bg-card border border-border p-4">
      <Link
        to="/buchung/$bookingId"
        params={{ bookingId: b.id }}
        className="flex items-start justify-between gap-3 -m-1 p-1 rounded-xl hover:bg-secondary/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">{b.vehicle_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{b.vehicle_plate}</p>
        </div>
        <StatusBadge status={b.status} />
      </Link>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <InfoLine icon={<Hash className="w-3 h-3" />} label="Buchung">
          <span className="font-mono text-[11px]">{b.id.slice(0, 8).toUpperCase()}</span>
        </InfoLine>
        <InfoLine icon={<Calendar className="w-3 h-3" />} label="Datum">
          {dateLabel} · {String(b.start_hour).padStart(2, "0")}:00
        </InfoLine>
        <InfoLine icon={<Wallet className="w-3 h-3" />} label="Preis">
          {Number(b.plan_price).toFixed(2)} € <span className="text-muted-foreground">({b.plan_label})</span>
        </InfoLine>
        <InfoLine icon={<RouteIcon className="w-3 h-3" />} label="Kilometer">
          {km !== null ? `${km} km` : "-"}
        </InfoLine>
      </div>

      {b.deposit > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Kaution</span>
          <span className={b.deposit_status === "released" ? "text-foreground" : "text-muted-foreground"}>
            {Number(b.deposit).toFixed(2)} €
            {" · "}
            {b.deposit_status === "released" ? "Ausgezahlt" : "Einbehalten"}
          </span>
        </div>
      )}

      {b.status === "cancelled" && b.deposit_deducted_cents != null && (() => {
        const feeEuro = (b.deposit_deducted_cents ?? 0) / 100;
        const refundEuro = Math.max(0, Number(b.plan_price) - feeEuro) + Number(b.deposit);
        return (
          <Link
            to="/buchung/$bookingId"
            params={{ bookingId: b.id }}
            className="mt-3 block rounded-xl bg-secondary px-3 py-2.5 text-xs hover:bg-secondary/80"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Stornogebühr</span>
              <span className="font-bold text-foreground">{feeEuro.toFixed(2)} €</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted-foreground">Zurückerstattet</span>
              <span className="font-bold text-foreground">{refundEuro.toFixed(2)} €</span>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">Details ansehen →</p>
          </Link>
        );
      })()}

      {(b.status === "active" || b.status === "returning") && (
        <Link
          to="/trip/$bookingId"
          params={{ bookingId: b.id }}
          className="mt-3 block text-center rounded-full bg-foreground text-background py-2 text-xs font-bold"
        >
          Zur Fahrt
        </Link>
      )}

      {cancellable && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 w-full rounded-full border border-border bg-background py-2 text-xs font-bold text-foreground hover:bg-secondary flex items-center justify-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" /> Fahrt stornieren
        </button>
      )}

      {cancellable && confirming && (
        <div className="mt-3 rounded-2xl bg-secondary p-3 space-y-2">
          <p className="text-xs font-bold text-foreground">Stornierung bestätigen</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Abfahrt am {format(startsAt, "dd.MM.yyyy 'um' HH:mm", { locale: de })} Uhr ·{" "}
            <span className="text-foreground font-medium">{hours} Stunden</span> bis Abfahrt.
          </p>
          <p className="text-xs text-muted-foreground">
            Stornogebühr: <span className="text-foreground font-bold">{fee.toFixed(2)} €</span>{" "}
            {fee === 0
              ? "(kostenlos, mehr als 12 h vor Abfahrt)"
              : "(max. 12 €, 1 € bei 12 h, +1 € pro Stunde näher an Abfahrt)"}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setConfirming(false)}
              disabled={cancelling}
              className="flex-1 rounded-full bg-background border border-border py-2 text-xs font-bold disabled:opacity-50"
            >
              Doch nicht
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 rounded-full bg-foreground text-background py-2 text-xs font-bold disabled:opacity-50"
            >
              {cancelling ? "Storniere…" : "Stornieren"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function InfoLine({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-foreground truncate">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Bezahlt", cls: "bg-secondary text-foreground" },
    active: { label: "Unterwegs", cls: "bg-foreground text-background" },
    returning: { label: "Rückgabe", cls: "bg-secondary text-foreground border border-foreground" },
    completed: { label: "Abgeschlossen", cls: "bg-secondary text-muted-foreground" },
    cancelled: { label: "Storniert", cls: "bg-secondary text-muted-foreground line-through" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}