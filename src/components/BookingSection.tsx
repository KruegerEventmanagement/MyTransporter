import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Car, Camera, Clock, AlertTriangle } from "lucide-react";

const PRICING = [
  { hours: 6, price: 100, label: "6 Stunden" },
  { hours: 24, price: 150, label: "24 Stunden" },
];

const KM_PRICE = 0.9;
const DEPOSIT = 200;

export function BookingSection() {
  const [date, setDate] = useState<Date | undefined>();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  const total = selectedPlan !== null && selectedPlan < PRICING.length
    ? PRICING[selectedPlan].price + DEPOSIT
    : null;

  return (
    <section id="booking" className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold text-center text-foreground animate-fade-in-up">
          Buche deinen Transporter
        </h2>
        <p className="mt-4 text-center text-muted-foreground text-lg animate-fade-in-up animate-delay-200">
          Wähle dein Datum und deinen Zeitraum
        </p>

        <div className="mt-16 grid md:grid-cols-2 gap-12">
          {/* Calendar */}
          <div className="flex flex-col items-center animate-fade-in-up animate-delay-400">
            <h3 className="text-xl font-medium mb-6 text-foreground">Startdatum wählen</h3>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              locale={de}
              disabled={(d) => d < new Date()}
              className="rounded-2xl border border-border p-4 shadow-sm pointer-events-auto"
            />
            {date && (
              <p className="mt-4 text-muted-foreground">
                Gewählt: <span className="font-medium text-foreground">{format(date, "PPP", { locale: de })}</span>
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="flex flex-col animate-fade-in-up animate-delay-600">
            <h3 className="text-xl font-medium mb-6 text-foreground">Zeitraum & Preis</h3>
            <div className="space-y-4">
              {PRICING.map((plan, idx) => (
                <button
                  key={plan.hours}
                  onClick={() => setSelectedPlan(idx)}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all ${
                    selectedPlan === idx
                      ? "border-accent bg-accent/5 shadow-md"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-medium text-foreground">{plan.label}</p>
                      <p className="text-sm text-muted-foreground">Flexible Nutzung</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{plan.price} €</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Kilometer pricing info */}
            <div className="mt-6 p-5 rounded-2xl border-2 border-accent/30 bg-accent/5">
              <div className="flex items-center gap-3 mb-3">
                <Car className="w-5 h-5 text-accent" />
                <p className="text-lg font-medium text-foreground">+ Kilometerkosten</p>
              </div>
              <p className="text-2xl font-bold text-foreground mb-2">0,90 € <span className="text-sm font-normal text-muted-foreground">pro Kilometer</span></p>
              <p className="text-sm text-muted-foreground">
                Die Kilometer werden automatisch per Foto des Kilometerstands berechnet (Start & Ende).
              </p>
            </div>

            {/* Deposit info */}
            <div className="mt-6 p-4 rounded-xl bg-secondary">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Kaution (wird zurückerstattet)</p>
                <p className="font-medium text-foreground">{DEPOSIT} €</p>
              </div>
            </div>

            {/* Total */}
            {total !== null && (
              <div className="mt-6 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Grundbetrag</p>
                  <p className="text-3xl font-bold">{total} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  inkl. {selectedPlan !== null && selectedPlan < PRICING.length && PRICING[selectedPlan].price} € Miete + {DEPOSIT} € Kaution
                </p>
                <p className="text-sm opacity-80 mt-1">
                  + Kilometerkosten (0,90 €/km) werden beim Checkout berechnet
                </p>
              </div>
            )}

            {/* Book button */}
            <button
              disabled={!date || selectedPlan === null}
              className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              Jetzt buchen & bezahlen
            </button>
          </div>
        </div>

        {/* Checkout-Ablauf */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-foreground mb-10">So funktioniert der Checkout</h3>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-card">
              <Camera className="w-8 h-8 text-accent mb-4" />
              <h4 className="font-medium text-foreground mb-2">Kilometerstand fotografieren</h4>
              <p className="text-sm text-muted-foreground">
                Fotografiere den Kilometerstand vor Fahrtantritt und bei Abgabe. Unsere KI erkennt den Stand automatisch und berechnet die gefahrenen Kilometer.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-border bg-card">
              <Car className="w-8 h-8 text-accent mb-4" />
              <h4 className="font-medium text-foreground mb-2">Kilometerpreis berechnen</h4>
              <p className="text-sm text-muted-foreground">
                Die KI berechnet die Differenz und multipliziert mit 0,90 €/km. Erst nach Berechnung kannst du auschecken.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-border bg-card">
              <Clock className="w-8 h-8 text-accent mb-4" />
              <h4 className="font-medium text-foreground mb-2">Zeit läuft bis zum Checkout</h4>
              <p className="text-sm text-muted-foreground">
                Solange du nicht ausgecheckt hast, läuft die Mietzeit weiter. Nach 3 Stunden wirst du gefragt, ob du noch fährst.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-border bg-card">
              <AlertTriangle className="w-8 h-8 text-accent mb-4" />
              <h4 className="font-medium text-foreground mb-2">Mindestbetrag</h4>
              <p className="text-sm text-muted-foreground">
                Wenn du nach 3 Stunden nicht mehr fährst aber nicht ausgecheckt hast, wird eine Pauschale von mindestens 100 € berechnet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}