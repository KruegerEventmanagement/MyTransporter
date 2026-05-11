import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Car, ChevronLeft, ChevronRight, Clock, CreditCard, User, Check, Key, Eye, EyeOff } from "lucide-react";
import { createBookingCheckout } from "@/lib/payments.functions";
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

type DbVehicle = {
  id: string;
  name: string;
  plate: string;
  brand: string | null;
  model: string | null;
  fuel_type: string | null;
  max_weight_kg: number | null;
  empty_weight_kg: number | null;
  payload_kg: number | null;
  power_kw: number | null;
  seats: number | null;
  photo_urls: string[];
  is_active: boolean;
};

const AUTH_CONFIRM_URL = "https://www.mytransporter.org/auth/confirm";
const AUTH_BOOKING_DRAFT_KEY = "mt_auth_booking_draft";
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_LAST_SENT_KEY = "mt_resend_last_sent";

export function BookingSection() {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState<Date | undefined>();
  const [startHour, setStartHour] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [regForm, setRegForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState<string | null>(null);
  const [resendLastSent, setResendLastSent] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(RESEND_LAST_SENT_KEY);
    return v ? parseInt(v, 10) : null;
  });
  const [resendNow, setResendNow] = useState(Date.now());
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [docsScanned, setDocsScanned] = useState(false);
  const [licenseScanned, setLicenseScanned] = useState(false);
  const [idScanned, setIdScanned] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const registrationComplete = isLoggedIn || profileComplete;

  // Tick clock every second while a confirmation is pending so the cooldown updates live
  useEffect(() => {
    if (!signupEmailSent) return;
    const id = setInterval(() => setResendNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [signupEmailSent]);

  // Listener: Klick aufs Logo bringt User zurück zu Schritt 1 (Datum & Uhrzeit)
  useEffect(() => {
    const handler = () => setStep(0);
    window.addEventListener("mt:go-to-booking-start", handler);
    return () => window.removeEventListener("mt:go-to-booking-start", handler);
  }, []);

  // Subscribe to auth changes — wenn User per Magic Link / Bestätigung zurückkommt
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const returnedFromEmailConfirmation = searchParams.get("email_confirmed") === "1";

    if (returnedFromEmailConfirmation) {
      setShowLogin(false);
      setSignupEmailSent(null);
      try {
        const savedDraft = localStorage.getItem(AUTH_BOOKING_DRAFT_KEY);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft) as {
            date?: string;
            startHour?: number | null;
            selectedPlan?: number | null;
          };
          if (draft.date) setDate(new Date(draft.date));
          if (typeof draft.startHour === "number") setStartHour(draft.startHour);
          if (typeof draft.selectedPlan === "number") setSelectedPlan(draft.selectedPlan);
        }
      } catch {
        localStorage.removeItem(AUTH_BOOKING_DRAFT_KEY);
      }
      setStep(4);
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsLoggedIn(true);
        setProfileComplete(true);
        setSignupEmailSent(null);
        setShowLogin(false);
        setStep((currentStep) => (currentStep === 3 ? 4 : currentStep));
        if (session.user.email_confirmed_at || session.user.confirmed_at) {
          localStorage.removeItem(AUTH_BOOKING_DRAFT_KEY);
        }
      } else {
        // Logout → Registrierungsschritt wieder anzeigen
        setIsLoggedIn(false);
        setProfileComplete(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setIsLoggedIn(true);
        setProfileComplete(true);
        setShowLogin(false);
        setStep((currentStep) => (currentStep === 3 ? 4 : currentStep));
        if (data.session.user.email_confirmed_at || data.session.user.confirmed_at) {
          localStorage.removeItem(AUTH_BOOKING_DRAFT_KEY);
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (registrationComplete && step === 3) {
      setStep(4);
    }
  }, [registrationComplete, step]);

  const handleSignUp = async () => {
    setAuthError(null);
    if (regPassword !== regPasswordConfirm) {
      setAuthError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (regPassword.length < 6) {
      setAuthError("Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    setAuthLoading(true);
    localStorage.setItem(
      AUTH_BOOKING_DRAFT_KEY,
      JSON.stringify({
        date: date?.toISOString(),
        startHour,
        selectedPlan,
      }),
    );
    const { data, error } = await supabase.auth.signUp({
      email: regForm.email,
      password: regPassword,
      options: {
        emailRedirectTo: AUTH_CONFIRM_URL,
        data: {
          first_name: regForm.firstName,
          last_name: regForm.lastName,
          phone: regForm.phone,
        },
      },
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.user && !data.session) {
      // E-Mail-Bestätigung erforderlich
      setSignupEmailSent(regForm.email);
      setLoginForm({ email: regForm.email, password: "" });
      const now = Date.now();
      setResendLastSent(now);
      localStorage.setItem(RESEND_LAST_SENT_KEY, String(now));
    } else if (data.session) {
      // Auto-confirm aktiv
      setIsLoggedIn(true);
      setProfileComplete(true);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password,
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.user) {
      setIsLoggedIn(true);
      setProfileComplete(true);
      setShowLogin(false);
      setStep(4);
    }
  };

  const handleResendConfirmation = async () => {
    if (!signupEmailSent) return;
    setResendError(null);
    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: signupEmailSent,
      options: { emailRedirectTo: AUTH_CONFIRM_URL },
    });
    setResendLoading(false);
    if (error) {
      setResendError(error.message);
      return;
    }
    const now = Date.now();
    setResendLastSent(now);
    localStorage.setItem(RESEND_LAST_SENT_KEY, String(now));
  };

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

  const stepTitles = registrationComplete
    ? ["Datum & Uhrzeit", "Tarif wählen", "Fahrzeug", "Bezahlen", "Fahrt"]
    : ["Datum & Uhrzeit", "Tarif wählen", "Fahrzeug", "Registrierung", "Bezahlen", "Fahrt"];
  // Wenn Registrierung übersprungen wird, mappen wir step 4/5 auf Stepper-Position 3/4
  const stepperIndex = registrationComplete && step >= 3 ? step - 1 : step;

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
      {step === 4 && <PaymentTestModeBanner />}
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-center text-foreground animate-fade-in-up">
          Buche deinen Transporter
        </h1>

        {/* Step indicator */}
        <div className={`mt-8 grid w-full max-w-lg mx-auto ${registrationComplete ? "grid-cols-5" : "grid-cols-6"}`}>
          {stepTitles.map((title, i) => (
            <div key={title} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all flex-shrink-0 ${
                i <= stepperIndex ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <span className={`block text-[10px] sm:text-xs text-center leading-tight px-0.5 ${i <= stepperIndex ? "text-foreground" : "text-muted-foreground"}`}>
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
                disabled={(d) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return d < today;
                }}
                className="rounded-3xl border border-border p-8 shadow-lg pointer-events-auto text-lg [--cell-size:3.5rem]"
              />

              {date && (
                <div className="mt-8 w-full max-w-md">
                  <p className="text-sm font-medium text-foreground mb-3">
                    Startzeit am {format(date, "PPP", { locale: de })}
                  </p>
                  {(() => {
                    const now = new Date();
                    const isToday =
                      date.getFullYear() === now.getFullYear() &&
                      date.getMonth() === now.getMonth() &&
                      date.getDate() === now.getDate();
                    const currentHour = now.getHours();
                    const canStartNow = isToday && currentHour >= 8 && currentHour < 22;
                    const visibleHours = isToday
                      ? HOURS.filter((h) => h > currentHour)
                      : HOURS;
                    return (
                      <>
                        {canStartNow && (
                          <button
                            onClick={() => setStartHour(currentHour)}
                            className={`mb-3 w-full py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                              startHour === currentHour
                                ? "bg-accent text-accent-foreground shadow-md"
                                : "bg-foreground text-background hover:opacity-90"
                            }`}
                          >
                            ⚡ Jetzt sofort starten ({String(currentHour).padStart(2, "0")}:
                            {String(now.getMinutes()).padStart(2, "0")} Uhr)
                          </button>
                        )}
                        {visibleHours.length > 0 ? (
                          <div className="grid grid-cols-5 gap-2">
                            {visibleHours.map((h) => (
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
                        ) : (
                          !canStartNow && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              Heute keine Startzeit mehr verfügbar – bitte einen anderen Tag wählen.
                            </p>
                          )
                        )}
                      </>
                    );
                  })()}
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
                className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
              <button
                onClick={() => setStep(registrationComplete ? 4 : 3)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Buchen & bezahlen <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Registration / Login */}
        {step === 3 && (
          <div className="mt-12 max-w-lg mx-auto animate-fade-in-up">
            {!registrationComplete ? (
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
                      <div>
                        <label className="text-sm font-medium text-foreground">Passwort</label>
                        <div className="relative mt-1">
                          <input
                            type={showRegPassword ? "text" : "password"}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Mindestens 6 Zeichen"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showRegPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                          >
                            {showRegPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Passwort wiederholen</label>
                        <div className="relative mt-1">
                          <input
                            type={showRegPassword ? "text" : "password"}
                            value={regPasswordConfirm}
                            onChange={(e) => setRegPasswordConfirm(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Passwort erneut eingeben"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showRegPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                          >
                            {showRegPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
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
                      {/* Test-Hilfe: Dokumente überspringen */}
                      <button
                        type="button"
                        onClick={() => {
                          setLicenseScanned(true);
                          setIdScanned(true);
                          setDocsScanned(true);
                        }}
                        className="w-full text-xs text-muted-foreground underline hover:text-foreground transition-colors py-2"
                      >
                        🧪 Test-Modus: Dokumente als verifiziert markieren
                      </button>
                    </div>

                    {signupEmailSent ? (
                      <div className="mt-8 rounded-2xl border border-border bg-secondary p-6 text-center">
                        <p className="font-medium text-foreground mb-2">📧 Bestätigungs-E-Mail gesendet</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Wir haben dir eine E-Mail an <strong>{signupEmailSent}</strong> geschickt.
                          Bitte klicke auf den Link, um dein Konto zu bestätigen. Danach kannst du dich einloggen.
                        </p>
                        {resendLastSent && (
                          <p className="text-xs text-muted-foreground mb-3">
                            Zuletzt gesendet:{" "}
                            {new Date(resendLastSent).toLocaleString("de-DE", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>
                        )}
                        {(() => {
                          const remaining = resendLastSent
                            ? Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((resendNow - resendLastSent) / 1000))
                            : 0;
                          const disabled = resendLoading || remaining > 0;
                          return (
                            <>
                              <button
                                type="button"
                                onClick={handleResendConfirmation}
                                disabled={disabled}
                                className="w-full rounded-full border border-border bg-background py-3 text-foreground font-medium transition-all hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                              >
                                {resendLoading
                                  ? "Wird gesendet..."
                                  : remaining > 0
                                  ? `Erneut senden in ${remaining}s`
                                  : "Bestätigungsmail erneut senden"}
                              </button>
                              {resendError && (
                                <p className="text-xs text-destructive mb-3">{resendError}</p>
                              )}
                            </>
                          );
                        })()}
                        <button
                          onClick={() => { setShowLogin(true); setSignupEmailSent(null); }}
                          className="w-full rounded-full bg-accent py-3 text-accent-foreground font-medium"
                        >
                          Jetzt einloggen
                        </button>
                      </div>
                    ) : (
                      <>
                        {authError && (
                          <p className="mt-4 text-sm text-destructive text-center">{authError}</p>
                        )}
                        <button
                          disabled={!regForm.firstName || !regForm.lastName || !regForm.email || !regForm.phone || !regPassword || !regPasswordConfirm || !docsScanned || authLoading}
                          onClick={handleSignUp}
                          className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {authLoading ? "Wird erstellt..." : "Profil erstellen"}
                        </button>
                      </>
                    )}

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
                          value={loginForm.email}
                          onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                          placeholder="max@beispiel.de"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Passwort</label>
                        <div className="relative mt-1">
                          <input
                            type={showLoginPassword ? "text" : "password"}
                            value={loginForm.password}
                            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showLoginPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                          >
                            {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    {authError && (
                      <p className="mt-4 text-sm text-destructive text-center">{authError}</p>
                    )}
                    <button
                      onClick={handleLogin}
                      disabled={!loginForm.email || !loginForm.password || authLoading}
                      className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {authLoading ? "Wird geprüft..." : "Einloggen"}
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

            {!showCheckout && !paid && planKey && (
              <button
                onClick={async () => {
                  // Pending Booking für /checkout/return persistieren
                  if (typeof window !== "undefined" && date && startHour !== null && selectedPlan !== null) {
                    localStorage.setItem(
                      "mt_pending_booking",
                      JSON.stringify({
                        planId: PRICING[selectedPlan].id,
                        planLabel: PRICING[selectedPlan].label,
                        planPrice: PRICING[selectedPlan].price,
                        startDate: format(date, "yyyy-MM-dd"),
                        startHour,
                        email: regForm.email,
                        firstName: regForm.firstName,
                        lastName: regForm.lastName,
                        phone: regForm.phone,
                      })
                    );
                  }
                  setShowCheckout(true);
                  try {
                    const origin = window.location.origin;
                    const url = await createBookingCheckout({
                      data: {
                        plan: planKey,
                        customerEmail: regForm.email || undefined,
                        successUrl: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                        cancelUrl: `${origin}/?checkout=cancelled`,
                      },
                    });
                    // Aus dem Lovable-Preview-iframe ausbrechen, sonst blockt Stripe (X-Frame-Options).
                    if (window.top && window.top !== window.self) {
                      try {
                        window.top.location.href = url;
                      } catch {
                        window.open(url, "_blank", "noopener,noreferrer");
                      }
                    } else {
                      window.location.href = url;
                    }
                  } catch (e) {
                    console.error(e);
                    setShowCheckout(false);
                    alert("Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.");
                  }
                }}
                className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Sicher bezahlen
              </button>
            )}

            {showCheckout && !paid && planKey && (
              <div className="mt-8 text-left">
                <div className="rounded-2xl bg-secondary p-6 text-center text-muted-foreground">
                  Du wirst zu Stripe weitergeleitet...
                </div>
              </div>
            )}

            {!paid && (
              <div className="mt-8 flex justify-start">
                <button
                  onClick={() => { setShowCheckout(false); setStep(registrationComplete ? 2 : 3); }}
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