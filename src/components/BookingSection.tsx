import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Car, ChevronLeft, ChevronRight, Clock, Shield, Mail, Phone, CreditCard } from "lucide-react";
import fiatDucato from "@/assets/fiat-ducato.jpg";

const PRICING = [
  { id: "6h", hours: 6, price: 100, label: "6 Stunden", returnRule: "Rückgabe bis spätestens 22:00 Uhr" },
  { id: "24h", hours: 24, price: 150, label: "24 Stunden", returnRule: "Rückgabe zwischen 08:00 und 22:00 Uhr" },
  { id: "km", hours: 0, price: 0, label: "Nur Kilometer", returnRule: "Rückgabe zwischen 08:00 und 22:00 Uhr" },
];

const DEPOSIT = 200;
const KM_PRICE = 0.9;

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 - 22:00

const VEHICLE = {
  name: "Fiat Ducato L4H2",
  plate: "B-MT 1234",
  km: 42850,
  fuel: "Diesel",
  payload: "1.200 kg",
  length: "6,36 m",
};

export function BookingSection() {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState<Date | undefined>();
  const [startHour, setStartHour] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  const canProceedStep0 = date !== undefined && startHour !== null;
  const canProceedStep1 = selectedPlan !== null;

  // Validate return time for 6h plan
  const getReturnInfo = () => {
    if (selectedPlan === null || startHour === null) return null;
    const plan = PRICING[selectedPlan];
    if (plan.id === "6h") {
      const returnHour = startHour + 6;
      if (returnHour > 22) return { valid: false, msg: "Rückgabe wäre nach 22:00 Uhr – bitte frühere Startzeit wählen." };
      return { valid: true, msg: `Rückgabe bis ${returnHour}:00 Uhr` };
    }
    if (plan.id === "24h") {
      return { valid: true, msg: "Rückgabe am nächsten Tag zwischen 08:00 und 22:00 Uhr" };
    }
    return { valid: true, msg: "Rückgabe zwischen 08:00 und 22:00 Uhr" };
  };

  const total = selectedPlan !== null && PRICING[selectedPlan].price > 0
    ? PRICING[selectedPlan].price + DEPOSIT
    : selectedPlan !== null ? DEPOSIT : null;

  const stepTitles = ["Datum & Uhrzeit", "Tarif wählen", "Fahrzeug", "Check-in & Buchen"];

  return (
    <section id="booking" className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold text-center text-foreground animate-fade-in-up">
          Buche deinen Transporter
        </h1>

        {/* Step indicator */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {stepTitles.map((title, i) => (
            <div key={title} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i <= step ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <span className={`hidden md:inline text-sm ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                {title}
              </span>
              {i < stepTitles.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 0: Date & Time */}
        {step === 0 && (
          <div className="mt-12 animate-fade-in-up">
            <p className="text-center text-muted-foreground text-lg mb-8">Wähle dein Startdatum und die Uhrzeit</p>

            <div className="flex flex-col items-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                locale={de}
                disabled={(d) => d < new Date()}
                className="rounded-2xl border border-border p-6 shadow-sm pointer-events-auto text-lg [--cell-size:3rem]"
              />

              {date && (
                <div className="mt-8 w-full max-w-md">
                  <p className="text-sm font-medium text-foreground mb-3">
                    Startzeit am {format(date, "PPP", { locale: de })}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {HOURS.map((h) => (
                      <button
                        key={h}
                        onClick={() => setStartHour(h)}
                        className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                          startHour === h
                            ? "bg-accent text-accent-foreground shadow-md"
                            : "bg-secondary text-foreground hover:bg-accent/20"
                        }`}
                      >
                        {h}:00
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10 flex justify-center">
              <button
                disabled={!canProceedStep0}
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Weiter <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Tariff */}
        {step === 1 && (
          <div className="mt-12 max-w-xl mx-auto animate-fade-in-up">
            <p className="text-center text-muted-foreground text-lg mb-8">Wähle deinen Tarif</p>

            <div className="space-y-4">
              {PRICING.map((plan, idx) => (
                <button
                  key={plan.id}
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
                      <p className="text-sm text-muted-foreground">{plan.returnRule}</p>
                    </div>
                    {plan.price > 0 ? (
                      <p className="text-2xl font-bold text-foreground">{plan.price} €</p>
                    ) : (
                      <p className="text-2xl font-bold text-foreground">0,90 €<span className="text-sm font-normal">/km</span></p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Return time validation */}
            {selectedPlan !== null && getReturnInfo() && (
              <div className={`mt-4 p-4 rounded-xl ${getReturnInfo()!.valid ? "bg-secondary" : "bg-destructive/10 border border-destructive/30"}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <p className={`text-sm ${getReturnInfo()!.valid ? "text-muted-foreground" : "text-destructive"}`}>
                    {getReturnInfo()!.msg}
                  </p>
                </div>
              </div>
            )}

            {/* Kilometer extra info */}
            {selectedPlan === 2 && (
              <div className="mt-4 p-4 rounded-xl bg-accent/5 border border-accent/20">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-accent" />
                  <p className="text-sm text-muted-foreground">
                    Kilometer werden per Foto des Kilometerstands (Start & Ende) von unserer KI berechnet. Mindestbetrag: 100 €.
                  </p>
                </div>
              </div>
            )}

            {/* Deposit info */}
            <div className="mt-6 p-4 rounded-xl bg-secondary">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Kaution (wird zurückerstattet)</p>
                <p className="font-medium text-foreground">{DEPOSIT} €</p>
              </div>
            </div>

            <div className="mt-10 flex justify-between">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
              <button
                disabled={!canProceedStep1 || (getReturnInfo() !== null && !getReturnInfo()!.valid)}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Weiter <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle */}
        {step === 2 && (
          <div className="mt-12 max-w-2xl mx-auto animate-fade-in-up">
            <p className="text-center text-muted-foreground text-lg mb-8">Dein Fahrzeug</p>

            <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
              <img
                src={fiatDucato}
                alt="Fiat Ducato L4H2"
                className="w-full h-64 object-cover"
                width={1024}
                height={576}
                loading="lazy"
              />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-foreground">{VEHICLE.name}</h3>
                  <span className="px-4 py-1.5 rounded-full bg-secondary text-sm font-mono font-medium text-foreground">
                    {VEHICLE.plate}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Kilometerstand</p>
                    <p className="font-medium text-foreground">{VEHICLE.km.toLocaleString("de-DE")} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kraftstoff</p>
                    <p className="font-medium text-foreground">{VEHICLE.fuel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nutzlast</p>
                    <p className="font-medium text-foreground">{VEHICLE.payload}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Länge</p>
                    <p className="font-medium text-foreground">{VEHICLE.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            {total !== null && (
              <div className="mt-6 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Grundbetrag</p>
                  <p className="text-3xl font-bold">{total} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  {PRICING[selectedPlan!].price > 0
                    ? `inkl. ${PRICING[selectedPlan!].price} € Miete + ${DEPOSIT} € Kaution`
                    : `${DEPOSIT} € Kaution + 0,90 €/km (wird beim Checkout berechnet)`
                  }
                </p>
              </div>
            )}

            <div className="mt-10 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Buchen & bezahlen <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Check-in */}
        {step === 3 && (
          <div className="mt-12 max-w-lg mx-auto animate-fade-in-up">
            <p className="text-center text-muted-foreground text-lg mb-8">Bitte bestätige deine Identität</p>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl border border-border bg-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">E-Mail bestätigen</p>
                  <p className="text-sm text-muted-foreground">Verifiziere deine E-Mail-Adresse</p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-border" />
              </div>

              <div className="p-5 rounded-2xl border border-border bg-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Telefonnummer bestätigen</p>
                  <p className="text-sm text-muted-foreground">SMS-Verifizierung</p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-border" />
              </div>

              <div className="p-5 rounded-2xl border border-border bg-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Führerschein zeigen</p>
                  <p className="text-sm text-muted-foreground">Foto deines Führerscheins hochladen</p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-border" />
              </div>

              <div className="p-5 rounded-2xl border border-border bg-card flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Zahlung via Stripe</p>
                  <p className="text-sm text-muted-foreground">Sichere Bezahlung nach Verifizierung</p>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-border" />
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Mindestalter: 25 Jahre · Alle Schritte müssen abgeschlossen werden
            </p>

            <div className="mt-10 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium opacity-40 cursor-not-allowed"
              >
                Zur Zahlung
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}