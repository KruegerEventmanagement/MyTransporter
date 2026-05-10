import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Car, ChevronLeft, ChevronRight, Clock, CreditCard, User, Check, Key } from "lucide-react";
import { StripeBookingCheckout } from "./StripeBookingCheckout";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";
import fiatDucato from "@/assets/fiat-ducato.jpg";
import { DocumentScanner } from "./DocumentScanner";
import { PreDriveFlow } from "./PreDriveFlow";
import { ActiveDriveScreen } from "./ActiveDriveScreen";
import { ReturnFlow } from "./ReturnFlow";
import { supabase } from "@/integrations/supabase/client";

const PRICING = [
  { id: "6h", hours: 6, price: 100, label: "6 Stunden", returnRule: "Rückgabe bis spätestens 22:00 Uhr" },
  { id: "24h", hours: 24, price: 150, label: "24 Stunden", returnRule: "Rückgabe zwischen 08:00 und 22:00 Uhr" },
  { id: "km", hours: 0, price: 0, label: "Nur Kilometer", returnRule: "Rückgabe zwischen 08:00 und 22:00 Uhr" },
];

const DEPOSIT = 200;
const KM_PRICE = 0.9;

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00 (letzte Buchung 20 Uhr)

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [regForm, setRegForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [docsScanned, setDocsScanned] = useState(false);
  const [licenseScanned, setLicenseScanned] = useState(false);
  const [idScanned, setIdScanned] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);

  const canProceedStep0 = date !== undefined && startHour !== null;
  const canProceedStep1 = selectedPlan !== null;

  // Filter available plans based on start hour
  const availablePlans = PRICING.filter((plan) => {
    if (startHour === null) return true;
    if (plan.id === "6h") return startHour + 6 <= 22;
    return true;
  });

  // Return info for selected plan
  const getReturnInfo = () => {
    if (selectedPlan === null || startHour === null) return null;
    const plan = PRICING[selectedPlan];
    if (plan.id === "6h") {
      const returnHour = startHour + 6;
      return { valid: true, msg: `Rückgabe bis ${returnHour}:00 Uhr am selben Tag` };
    }
    if (plan.id === "24h") {
      return { valid: true, msg: `Rückgabe am nächsten Tag bis ${startHour}:00 Uhr (zwischen 08:00–22:00)` };
    }
    return { valid: true, msg: "Rückgabe zwischen 08:00 und 22:00 Uhr" };
  };

  const total = selectedPlan !== null && PRICING[selectedPlan].price > 0
    ? PRICING[selectedPlan].price + DEPOSIT
    : selectedPlan !== null ? DEPOSIT : null;

  const [paid, setPaid] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [startKm, setStartKm] = useState<number>(0);
  const [drivePhase, setDrivePhase] = useState<"pre" | "active" | "return" | "done" | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();

  const stepTitles = ["Datum & Uhrzeit", "Tarif wählen", "Fahrzeug", "Registrierung", "Bezahlen", "Fahrt"];

  const planKey: "rent_6h" | "rent_24h" | "rent_km" | null =
    selectedPlan === null
      ? null
      : PRICING[selectedPlan].id === "6h"
      ? "rent_6h"
      : PRICING[selectedPlan].id === "24h"
      ? "rent_24h"
      : "rent_km";

  return (
    <section id="booking" className="py-6 px-3 sm:px-4 overflow-x-hidden">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-center text-foreground animate-fade-in-up">
          Buche deinen Transporter
        </h1>

        {/* Step indicator */}
        <div className="mt-8 grid grid-cols-6 w-full max-w-lg mx-auto">
          {stepTitles.map((title, i) => (
            <div key={title} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all flex-shrink-0 ${
                i <= step ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <span className={`block text-[10px] sm:text-xs text-center leading-tight px-0.5 ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                {title}
              </span>
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
                className="rounded-3xl border border-border p-8 shadow-lg pointer-events-auto text-lg [--cell-size:3.5rem]"
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
              {availablePlans.map((plan) => {
                const idx = PRICING.findIndex((p) => p.id === plan.id);
                return (
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
                );
              })}
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
                    Vorab werden pauschal 50 € berechnet. Fährst du weniger, wird dir die Differenz erstattet. Fährst du mehr, zahlst du den Restbetrag nach.
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

        {/* Step 3: Registration / Login */}
        {step === 3 && (
          <div className="mt-12 max-w-lg mx-auto animate-fade-in-up">
            {!profileComplete ? (
              <>
                {!showLogin ? (
                  <>
                    <p className="text-center text-muted-foreground text-lg mb-8">Erstelle dein Konto oder melde dich an</p>

                    {/* Registration form */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground">Vorname</label>
                          <input
                            type="text"
                            value={regForm.firstName}
                            onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Max"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground">Nachname</label>
                          <input
                            type="text"
                            value={regForm.lastName}
                            onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Mustermann"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">E-Mail</label>
                        <input
                          type="email"
                          value={regForm.email}
                          onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          placeholder="max@beispiel.de"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Telefonnummer</label>
                        <input
                          type="tel"
                          value={regForm.phone}
                          onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          placeholder="+49 170 1234567"
                        />
                      </div>
                    </div>

                    {/* Document scan section with camera + AI */}
                    <div className="mt-8 space-y-3">
                      <h4 className="font-medium text-foreground mb-4">Dokumente verifizieren</h4>
                      <p className="text-xs text-muted-foreground mb-3 bg-secondary px-3 py-2 rounded-lg">Nur für Fahrer ab 25 Jahren</p>
                      <DocumentScanner
                        documentType="license"
                        isComplete={licenseScanned}
                        onComplete={() => {
                          setLicenseScanned(true);
                          if (idScanned) setDocsScanned(true);
                        }}
                      />
                      <DocumentScanner
                        documentType="id"
                        isComplete={idScanned}
                        onComplete={() => {
                          setIdScanned(true);
                          if (licenseScanned) setDocsScanned(true);
                        }}
                      />
                    </div>

                    <button
                      disabled={!regForm.firstName || !regForm.lastName || !regForm.email || !regForm.phone || !docsScanned}
                      onClick={() => setProfileComplete(true)}
                      className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Profil erstellen
                    </button>

                    <button
                      onClick={() => setShowLogin(true)}
                      className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Bereits registriert? <span className="font-medium underline">Jetzt einloggen</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-center text-muted-foreground text-lg mb-8">Willkommen zurück</p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground">E-Mail</label>
                        <input
                          type="email"
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          placeholder="max@beispiel.de"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Passwort</label>
                        <input
                          type="password"
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setProfileComplete(true)}
                      className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
                    >
                      Einloggen
                    </button>
                    <button
                      onClick={() => setShowLogin(false)}
                      className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Noch kein Konto? <span className="font-medium underline">Jetzt registrieren</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-foreground" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Profil verifiziert</h3>
                  <p className="mt-2 text-muted-foreground">Dein Konto ist bereit. Du kannst jetzt bezahlen.</p>
                </div>
                <button
                  onClick={() => setStep(4)}
                  className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
                >
                  Weiter zur Zahlung <ChevronRight className="w-5 h-5 inline" />
                </button>
              </>
            )}

            <div className="mt-6 flex justify-start">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Payment */}
        {step === 4 && (
          <div className="mt-12 max-w-lg mx-auto animate-fade-in-up text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
              <CreditCard className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-2xl font-bold text-foreground">Bezahlung</h3>
            <p className="mt-2 text-muted-foreground">
              Schließe deine Buchung ab und bezahle sicher.
            </p>

            {total !== null && (
              <div className="mt-8 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Zu zahlen</p>
                  <p className="text-3xl font-bold">{total} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  {PRICING[selectedPlan!].price > 0
                    ? `${PRICING[selectedPlan!].price} € Miete + ${DEPOSIT} € Kaution`
                    : `${DEPOSIT} € Kaution · Kilometerkosten werden nach Fahrt berechnet`
                  }
                </p>
              </div>
            )}

            <button
              onClick={async () => {
                setPaid(true);
                // Generate pickup code
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                // Create booking in DB
                const { data: userData } = await supabase.auth.getUser();
                if (userData?.user) {
                  const { data: booking } = await supabase.from("bookings").insert({
                    user_id: userData.user.id,
                    plan_id: PRICING[selectedPlan!].id,
                    plan_label: PRICING[selectedPlan!].label,
                    plan_price: PRICING[selectedPlan!].price,
                    start_date: format(date!, "yyyy-MM-dd"),
                    start_hour: startHour!,
                    pickup_code: code,
                    status: "paid",
                  }).select().single();
                  if (booking) {
                    setBookingId(booking.id);
                    setPickupCode(code);
                  }
                } else {
                  // Demo mode without auth
                  setBookingId("demo-" + Date.now());
                  setPickupCode(code);
                }
                setStep(5);
                setDrivePhase("pre");
              }}
              className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
            >
              Jetzt bezahlen
            </button>

            {!paid && (
              <div className="mt-8 flex justify-start">
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
                >
                  <ChevronLeft className="w-5 h-5" /> Zurück
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Gute Fahrt */}
        {step === 5 && (
          <div className="mt-12">
            {drivePhase === "pre" && bookingId && pickupCode && (
              <PreDriveFlow
                bookingId={bookingId}
                pickupCode={pickupCode}
                onComplete={() => {
                  // Fetch start KM from DB or use local
                  setDrivePhase("active");
                  setStartKm(42850);
                }}
              />
            )}

            {drivePhase === "active" && bookingId && date && startHour !== null && (
              <ActiveDriveScreen
                bookingId={bookingId}
                startDate={date}
                startHour={startHour}
                startKm={startKm}
                vehicleName={VEHICLE.name}
                vehiclePlate={VEHICLE.plate}
                onReturn={() => setDrivePhase("return")}
              />
            )}

            {drivePhase === "return" && bookingId && (
              <ReturnFlow
                bookingId={bookingId}
                onComplete={(returnCode) => {
                  setDrivePhase("done");
                }}
              />
            )}

            {drivePhase === "done" && (
              <div className="max-w-lg mx-auto animate-fade-in-up text-center">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                  <Check className="w-10 h-10 text-foreground" />
                </div>
                <h3 className="text-3xl font-bold text-foreground mb-2">Fahrt beendet ✅</h3>
                <p className="text-muted-foreground text-lg mb-8">
                  Die Transaktion ist abgeschlossen. Vielen Dank für deine Buchung!
                </p>
                <div className="p-4 rounded-2xl bg-secondary text-sm text-muted-foreground">
                  <p>Deine Kaution wird nach Prüfung des Fahrzeugs zurückerstattet.</p>
                  <p className="mt-1">Bei Fragen: info@mytransporter.de</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}