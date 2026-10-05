import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar, Clock, Car, Key, Lock, ChevronLeft, Package } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { BrandHomeLink } from "@/components/BrandHomeLink";

interface ScheduledTripViewProps {
  startDate: Date;
  startHour: number;
  vehicleName: string;
  vehiclePlate: string;
  planLabel: string;
  unlockAt: Date;
  addons?: Array<{ id: string; label: string; price_cents: number }>;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0 Sek";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days} T ${hours} Std ${minutes} Min`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  if (minutes > 0) return `${minutes} Min ${seconds} Sek`;
  return `${seconds} Sek`;
}

export function ScheduledTripView({
  startDate,
  startHour,
  vehicleName,
  vehiclePlate,
  planLabel,
  unlockAt,
  addons,
}: ScheduledTripViewProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  const remaining = unlockAt.getTime() - now;

  return (
    <main className="min-h-screen bg-background pb-12 px-4">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur -mx-4 mb-6 border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <BrandHomeLink className="mr-1" imageClassName="h-7 w-auto" />
          <Link
            to="/profil"
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
            aria-label="Zurück zu meinen Buchungen"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Meine Buchungen
          </Link>
        </div>
      </header>
      <div className="max-w-2xl mx-auto pt-6">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
            <Lock className="w-9 h-9 text-foreground" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Deine Buchung ist bestätigt</h1>
          <p className="text-muted-foreground text-lg">
            Die Fahrt beginnt erst zur gebuchten Startzeit.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-secondary p-8 mb-6">
          <p className="text-sm uppercase tracking-wide text-muted-foreground mb-2">Schlüssel-Code wird freigeschaltet in</p>
          <p className="text-4xl sm:text-5xl font-bold tabular-nums">{formatRemaining(remaining)}</p>
          <p className="text-xs text-muted-foreground mt-3">
            (30 Minuten vor der Abholung)
          </p>
        </div>

        <div className="rounded-3xl border border-border p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 mt-0.5 text-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Abholung</p>
              <p className="font-medium">{format(start, "EEEE, d. MMMM yyyy", { locale: de })}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 mt-0.5 text-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Startzeit</p>
              <p className="font-medium">{String(startHour).padStart(2, "0")}:00 Uhr</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Car className="w-5 h-5 mt-0.5 text-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Fahrzeug</p>
              <p className="font-medium">{vehicleName} · {vehiclePlate}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 mt-0.5 text-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Tarif</p>
              <p className="font-medium">{planLabel}</p>
            </div>
          </div>
          {addons && addons.length > 0 && (
            <div className="flex items-start gap-3 pt-3 border-t border-border">
              <Package className="w-5 h-5 mt-0.5 text-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Gebuchtes Zubehör</p>
                <ul className="font-medium space-y-0.5">
                  {addons.map((a) => (
                    <li key={a.id}>{a.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl bg-secondary/60 p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">So geht's weiter</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>30 Min vor Abholung wird der Schlüssel-Code hier freigeschaltet.</li>
            <li>Du bekommst zusätzlich eine Erinnerung per E-Mail.</li>
            <li>Komme bitte pünktlich zur Übergabe.</li>
          </ul>
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm underline text-muted-foreground">
            Zur Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}