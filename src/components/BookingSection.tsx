import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRICING = [
  { hours: 6, price: 100, label: "6 Stunden" },
  { hours: 24, price: 150, label: "24 Stunden" },
];

const DEPOSIT = 200;

export function BookingSection() {
  const [date, setDate] = useState<Date | undefined>();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  const total = selectedPlan !== null ? PRICING[selectedPlan].price + DEPOSIT : null;

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
                  <p className="text-lg">Gesamtbetrag</p>
                  <p className="text-3xl font-bold">{total} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  inkl. {selectedPlan !== null && PRICING[selectedPlan].price} € Miete + {DEPOSIT} € Kaution
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
      </div>
    </section>
  );
}