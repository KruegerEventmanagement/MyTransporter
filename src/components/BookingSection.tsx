import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, CreditCard, User, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { createBookingCheckout } from "@/lib/payments.functions";
import { createBookingHold, releaseBookingHold } from "@/lib/booking-holds.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";
import fiatDucato from "@/assets/fiat-ducato.jpg";
import { DocumentScanner } from "./DocumentScanner";
import { PreDriveFlow } from "./PreDriveFlow";
import { ActiveDriveScreen } from "./ActiveDriveScreen";
import { ReturnFlow } from "./ReturnFlow";
import { supabase } from "@/integrations/supabase/client";
import { getBusySlots, type BusySlot } from "@/lib/availability.functions";
import { computePlanReturn, getPlanById, getAvailablePlans, DEPOSIT_EUR } from "@/lib/booking-rules";
import { ADDONS, ADDON_NOTE, ADDON_TRUST, sumAddonsEur, buildAddonSnapshot } from "@/lib/addons";
import { AddonPackageCard } from "./AddonPackageCard";

const DEPOSIT = DEPOSIT_EUR;

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
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [startHour, setStartHour] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [regForm, setRegForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    accountType: "private" as "private" | "business",
    companyName: "",
    vatId: "",
  });
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
  const [vehicles, setVehicles] = useState<DbVehicle[]>([]);
  const [vehicleIdx, setVehicleIdx] = useState(0);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const addonsTotal = sumAddonsEur(selectedAddonIds);

  useEffect(() => {
    let alive = true;
    getBusySlots()
      .then((slots) => {
        if (alive) setBusySlots(slots);
      })
      .catch((e) => console.warn("Belegte Slots konnten nicht geladen werden:", e));
    return () => {
      alive = false;
    };
  }, []);

  const currentPlate = vehicles[vehicleIdx]?.plate ?? "";
  const slotsForVehicle = busySlots.filter(
    (s) => !currentPlate || !s.vehiclePlate || s.vehiclePlate === currentPlate,
  );

  // Convenience: range start/end + Nächtezahl
  // Wichtig: 1 Nacht = 1 Tag. Selber Tag (0 Nächte) = Tagesmiete (<24h).
  const rangeFrom = range?.from;
  const rangeTo = range?.to ?? range?.from;
  const nights = rangeFrom && rangeTo ? differenceInCalendarDays(rangeTo, rangeFrom) : -1;
  // Für UI-Anzeige: 0 Nächte → "Tagesmiete", sonst N Tage = N Nächte
  const rangeDays = nights; // semantisch = Nächte
  const date = rangeFrom; // bestehender Code unten verwendet `date` als Startdatum

  // Set belegter Tage (YYYY-MM-DD), basierend auf slotsForVehicle
  const busyDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of slotsForVehicle) {
      const bs = new Date(s.start);
      const be = new Date(s.end);
      const d = new Date(bs.getFullYear(), bs.getMonth(), bs.getDate());
      while (d.getTime() < be.getTime()) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        d.setDate(d.getDate() + 1);
      }
    }
    return set;
  }, [slotsForVehicle]);

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleRangeSelect = (next: { from?: Date; to?: Date } | undefined) => {
    if (!next?.from) {
      setRange(undefined);
      setStartHour(null);
      setSelectedPlanId(null);
      return;
    }
    // Wenn ein Range gewählt wurde, prüfen ob ein Tag drin belegt ist
    if (next.to) {
      const start = next.from < next.to ? next.from : next.to;
      const end = next.from < next.to ? next.to : next.from;
      const cursor = new Date(start);
      while (cursor.getTime() <= end.getTime()) {
        if (busyDateSet.has(dayKey(cursor))) {
          // Ungültig → nur Startdatum übernehmen
          setRange({ from: next.from, to: undefined });
          setStartHour(null);
          setSelectedPlanId(null);
          return;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      setRange({ from: start, to: end });
    } else {
      setRange({ from: next.from, to: undefined });
    }
    setStartHour(null);
    setSelectedPlanId(null);
  };

  // Prüft, ob [start, start+hours) sich mit einer belegten Periode überschneidet
  const overlapsBusy = (startMs: number, hours: number) => {
    const endMs = startMs + hours * 3600_000;
    return slotsForVehicle.some((s) => {
      const bs = new Date(s.start).getTime();
      const be = new Date(s.end).getTime();
      return startMs < be && endMs > bs;
    });
  };

  const isHourBusy = (d: Date, h: number) => {
    const start = new Date(d);
    start.setHours(h, 0, 0, 0);
    // Eine Startstunde ist belegt, wenn sie innerhalb einer fremden Buchung liegt
    return slotsForVehicle.some((s) => {
      const bs = new Date(s.start).getTime();
      const be = new Date(s.end).getTime();
      return start.getTime() >= bs && start.getTime() < be;
    });
  };

  const planDurationHoursForOverlap = (planId: string) => {
    if (!date || startHour === null) return 0;
    const start = new Date(date);
    start.setHours(startHour, 0, 0, 0);
    const end = computePlanReturn(planId, date, startHour);
    return (end.getTime() - start.getTime()) / 3600_000;
  };

  const isPlanBlocked = (planId: string) => {
    if (!date || startHour === null) return false;
    const start = new Date(date);
    start.setHours(startHour, 0, 0, 0);
    return overlapsBusy(start.getTime(), planDurationHoursForOverlap(planId));
  };

  useEffect(() => {
    let alive = true;
    supabase
      .from("vehicles")
      .select("id, name, plate, brand, model, fuel_type, max_weight_kg, empty_weight_kg, payload_kg, power_kw, seats, photo_urls, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (alive && data) setVehicles(data as DbVehicle[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const currentVehicle = vehicles[vehicleIdx];
  const displayVehicle = currentVehicle
    ? {
        name: currentVehicle.name || `${currentVehicle.brand ?? ""} ${currentVehicle.model ?? ""}`.trim() || "Fahrzeug",
        plate: currentVehicle.plate || "-",
        photo: currentVehicle.photo_urls?.[0] ?? fiatDucato,
        fuel: currentVehicle.fuel_type ?? VEHICLE.fuel,
        payload: currentVehicle.payload_kg ? `${currentVehicle.payload_kg.toLocaleString("de-DE")} kg` : VEHICLE.payload,
        seats: currentVehicle.seats,
        power: currentVehicle.power_kw,
      }
    : { name: "", plate: "", photo: fiatDucato, fuel: VEHICLE.fuel, payload: VEHICLE.payload, seats: null as number | null, power: null as number | null };
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

  // Subscribe to auth changes, wenn User per Magic Link / Bestätigung zurückkommt
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
            from?: string;
            to?: string;
            startHour?: number | null;
            selectedPlanId?: string | null;
          };
          if (draft.from) {
            setRange({
              from: new Date(draft.from),
              to: draft.to ? new Date(draft.to) : new Date(draft.from),
            });
          }
          if (typeof draft.startHour === "number") setStartHour(draft.startHour);
          if (typeof draft.selectedPlanId === "string") setSelectedPlanId(draft.selectedPlanId);
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
        setAuthUser({ id: session.user.id, email: session.user.email ?? undefined });
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
        setAuthUser(null);
        setProfileComplete(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setIsLoggedIn(true);
        setAuthUser({ id: data.session.user.id, email: data.session.user.email ?? undefined });
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
        from: rangeFrom?.toISOString(),
        to: rangeTo?.toISOString(),
        startHour,
        selectedPlanId,
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
          account_type: regForm.accountType,
          company_name: regForm.accountType === "business" ? regForm.companyName : "",
          vat_id: regForm.accountType === "business" ? regForm.vatId : "",
        },
      },
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    // Admin-Benachrichtigung über neue Registrierung (still im Hintergrund)
    import("@/lib/booking-emails.functions").then(({ sendAdminRegistrationNotification }) =>
      sendAdminRegistrationNotification({
        data: {
          email: regForm.email,
          firstName: regForm.firstName,
          lastName: regForm.lastName,
          phone: regForm.phone,
          accountType: regForm.accountType,
          companyName: regForm.accountType === "business" ? regForm.companyName : undefined,
          vatId: regForm.accountType === "business" ? regForm.vatId : undefined,
        },
      }).catch((e) => console.warn("Admin-Registrierungs-Mail fehlgeschlagen:", e)),
    );
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
      setAuthUser({ id: data.user.id, email: data.user.email ?? undefined });
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

  const canProceedStep0 = rangeFrom !== undefined && rangeTo !== undefined;
  const canProceedStep1 = startHour !== null && selectedPlanId !== null;

  // Tarife passend zur gewählten Nächtezahl + Startstunde
  const availablePlans = getAvailablePlans(nights, startHour);

  const selectedPlanEntry = selectedPlanId ? getPlanById(selectedPlanId) : null;

  // Return info for selected plan
  const getReturnInfo = () => {
    if (!selectedPlanEntry || startHour === null || !date) return null;
    const ret = computePlanReturn(selectedPlanEntry.id, date, startHour);
    const sameDay =
      ret.getDate() === date.getDate() &&
      ret.getMonth() === date.getMonth() &&
      ret.getFullYear() === date.getFullYear();
    const dayStr = sameDay
      ? "am selben Tag"
      : `am ${format(ret, "EEEE, d. MMMM", { locale: de })}`;
    const timeStr = format(ret, "HH:mm", { locale: de });
    if (selectedPlanEntry.durationHours < 24) {
      return { valid: true, msg: `Rückgabe ${dayStr} bis ${timeStr} Uhr` };
    }
    return { valid: true, msg: `Rückgabe ${dayStr} bis ${timeStr} Uhr` };
  };

  const total = selectedPlanEntry ? selectedPlanEntry.price + addonsTotal + DEPOSIT : null;

  const [paid, setPaid] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [startKm, setStartKm] = useState<number>(0);
  const [drivePhase, setDrivePhase] = useState<"pre" | "active" | "return" | "done" | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const startBookingCheckout = useServerFn(createBookingCheckout);
  const startBookingHold = useServerFn(createBookingHold);
  const dropBookingHold = useServerFn(releaseBookingHold);

  // ----- Verifizierungs-Gate + 15-Min-Reservierung -----
  const [docTypes, setDocTypes] = useState<Set<string>>(new Set());
  const verified =
    docTypes.has("id_front") && docTypes.has("id_back") &&
    docTypes.has("license_front") && docTypes.has("license_back");
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdNow, setHoldNow] = useState<number>(Date.now());

  const refreshDocs = async () => {
    if (!authUser?.id) return;
    const { data } = await supabase
      .from("user_documents")
      .select("doc_type")
      .eq("user_id", authUser.id);
    if (data) setDocTypes(new Set(data.map((d: { doc_type: string }) => d.doc_type)));
  };

  // Dokumente beim Login/Step-Wechsel laden
  useEffect(() => { refreshDocs(); }, [authUser?.id]);

  // Beim Betreten von Schritt 4 (Bezahlen/Verifizierung): Hold anlegen
  useEffect(() => {
    if (step !== 4) return;
    if (!authUser?.id || !selectedPlanEntry || !date || startHour === null) return;
    let cancelled = false;
    setHoldError(null);
    refreshDocs();
    startBookingHold({
      data: {
        vehicleId: currentVehicle?.id ?? null,
        vehiclePlate: displayVehicle.plate || null,
        planId: selectedPlanEntry.id,
        startDate: format(date, "yyyy-MM-dd"),
        startHour,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setHoldExpiresAt(new Date(res.expiresAt).getTime());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHoldError(e instanceof Error ? e.message : "Reservierung fehlgeschlagen");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, authUser?.id]);

  // Tick für Countdown
  useEffect(() => {
    if (step !== 4 || !holdExpiresAt) return;
    const id = setInterval(() => setHoldNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step, holdExpiresAt]);

  const holdSecondsLeft = holdExpiresAt
    ? Math.max(0, Math.floor((holdExpiresAt - holdNow) / 1000))
    : null;
  const holdExpired = holdSecondsLeft !== null && holdSecondsLeft === 0;

  // Bei Ablauf: Hold freigeben, zurück auf Zeit/Tarif
  useEffect(() => {
    if (!holdExpired || step !== 4 || paid || showCheckout) return;
    if (date && startHour !== null) {
      dropBookingHold({
        data: { startDate: format(date, "yyyy-MM-dd"), startHour },
      }).catch(() => {});
    }
    setHoldExpiresAt(null);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdExpired]);

  const stepTitles = registrationComplete
    ? ["Datum", "Uhrzeit & Tarif", "Fahrzeug & Zubehör", verified ? "Bezahlen" : "Verifizierung", "Fahrt"]
    : ["Datum", "Uhrzeit & Tarif", "Fahrzeug & Zubehör", "Registrierung", verified ? "Bezahlen" : "Verifizierung", "Fahrt"];
  // Wenn Registrierung übersprungen wird, mappen wir step 4/5 auf Stepper-Position 3/4
  const stepperIndex = registrationComplete && step >= 3 ? step - 1 : step;

  const planKey: string | null = selectedPlanEntry ? `rent_${selectedPlanEntry.id}` : null;

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
            <p className="text-center text-muted-foreground text-lg mb-8">Wähle deinen Zeitraum</p>

            <div className="flex flex-col items-center">
              <Calendar
                mode="range"
                selected={range as { from: Date | undefined; to: Date | undefined }}
                onSelect={handleRangeSelect}
                numberOfMonths={1}
                locale={de}
                disabled={(d) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (d < today) return true;
                  return busyDateSet.has(dayKey(d));
                }}
                className="rounded-3xl border border-border p-8 shadow-lg pointer-events-auto text-lg [--cell-size:3.5rem]"
              />

              {rangeFrom && !rangeTo && (
                <p className="mt-4 text-sm text-muted-foreground text-center">
                  Startdatum: <strong className="text-foreground">{format(rangeFrom, "PPP", { locale: de })}</strong> · Wähle jetzt das Enddatum (für Tagesmiete unter 24h: erneut auf denselben Tag klicken)
                </p>
              )}
              {rangeFrom && rangeTo && (
                <p className="mt-4 text-sm text-muted-foreground text-center">
                  Zeitraum: <strong className="text-foreground">{format(rangeFrom, "PPP", { locale: de })}</strong>
                  {nights >= 1 && (
                    <> bis <strong className="text-foreground">{format(rangeTo, "PPP", { locale: de })}</strong></>
                  )}
                  {" "}· {nights === 0
                    ? "Tagesmiete (3h/6h)"
                    : `${nights} ${nights === 1 ? "Tag" : "Tage"} (${nights} ${nights === 1 ? "Nacht" : "Nächte"})`}
                </p>
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

        {/* Step 1: Time & Tariff */}
        {step === 1 && (
          <div className="mt-12 max-w-xl mx-auto animate-fade-in-up">
            <p className="text-center text-muted-foreground text-lg mb-2">Wähle deine Startzeit</p>
            {rangeFrom && (
              <p className="text-center text-sm text-muted-foreground mb-6">
                am {format(rangeFrom, "PPPP", { locale: de })}
                {nights === 0 && <> · Tagesmiete</>}
                {nights >= 1 && <> · {nights} {nights === 1 ? "Tag" : "Tage"}</>}
              </p>
            )}

            {rangeFrom && (
              <div className="w-full max-w-md mx-auto">
                {(() => {
                  const now = new Date();
                  const d = rangeFrom;
                  const isToday =
                    d.getFullYear() === now.getFullYear() &&
                    d.getMonth() === now.getMonth() &&
                    d.getDate() === now.getDate();
                  const currentHour = now.getHours();
                  const canStartNow = isToday && currentHour >= 8 && currentHour <= 20;
                  const visibleHours = isToday
                    ? HOURS.filter((h) => h > currentHour && h <= 20)
                    : HOURS.filter((h) => h <= 20);
                  return (
                    <>
                      {canStartNow && (
                        <button
                          onClick={() => setStartHour(currentHour)}
                          disabled={isHourBusy(d, currentHour)}
                          className={`mb-3 w-full py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                            startHour === currentHour
                              ? "bg-accent text-accent-foreground shadow-md"
                              : "bg-foreground text-background hover:opacity-90"
                          } disabled:opacity-30 disabled:cursor-not-allowed disabled:line-through`}
                        >
                          Jetzt sofort starten ({String(currentHour).padStart(2, "0")}:
                          {String(now.getMinutes()).padStart(2, "0")} Uhr)
                        </button>
                      )}
                      {visibleHours.length > 0 ? (
                        <div className="grid grid-cols-5 gap-2">
                          {visibleHours.map((h) => {
                            const busy = isHourBusy(d, h);
                            return (
                              <button
                                key={h}
                                onClick={() => { setStartHour(h); setSelectedPlanId(null); }}
                                disabled={busy}
                                title={busy ? "Bereits gebucht" : undefined}
                                className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                                  startHour === h
                                    ? "bg-accent text-accent-foreground shadow-md"
                                    : busy
                                    ? "bg-secondary/40 text-muted-foreground line-through cursor-not-allowed"
                                    : "bg-secondary text-foreground hover:bg-accent/20"
                                }`}
                              >
                                {h}:00
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        !canStartNow && (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            Leider ist für heute nichts mehr verfügbar, bitte einen anderen Tag wählen.
                          </p>
                        )
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {startHour !== null && (
              <>
                <p className="text-center text-muted-foreground text-lg mt-10 mb-6">Wähle deinen Tarif</p>
                <div className="space-y-4">
                  {availablePlans.map((plan) => {
                const blocked = isPlanBlocked(plan.id);
                return (
                <button
                  key={plan.id}
                  onClick={() => !blocked && setSelectedPlanId(plan.id)}
                  disabled={blocked}
                  title={blocked ? "Zeitraum überschneidet sich mit einer bestehenden Buchung" : undefined}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all ${
                    selectedPlanId === plan.id
                      ? "border-accent bg-accent/5 shadow-md"
                      : blocked
                      ? "border-border opacity-40 cursor-not-allowed"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-lg font-medium text-foreground">{plan.label}</p>
                        {plan.highlightLabel && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-foreground text-background font-semibold">
                            {plan.highlightLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{plan.returnRule}</p>
                      {plan.freeKm > 0 && (
                        <p className="text-xs text-foreground/80 mt-1">{plan.freeKm.toLocaleString("de-DE")} km inklusive · danach {(plan.extraKmCents / 100).toFixed(2).replace(".", ",")} €/km</p>
                      )}
                      {blocked && (
                        <p className="text-xs text-destructive mt-1">In diesem Zeitraum bereits gebucht</p>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-foreground whitespace-nowrap">{plan.price} €</p>
                  </div>
                  {plan.days > 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ≈ {(plan.price / plan.days).toFixed(2).replace(".", ",")} € pro Tag
                    </p>
                  )}
                </button>
                );
              })}
              {availablePlans.length === 0 && (
                <div className="p-6 rounded-2xl border border-border bg-secondary text-center text-sm text-muted-foreground">
                  Für diese Auswahl bieten wir online keinen Standardtarif an. Bitte kontaktiere uns, wir machen dir ein individuelles Angebot.
                </div>
              )}
                </div>
                {nights === 1 && availablePlans.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground text-center">
                    Rückgabe am Folgetag zur gleichen Uhrzeit. Brauchst du länger? Wähle im Kalender mehr Tage.
                  </p>
                )}
              </>
            )}

            {/* Return time validation */}
            {selectedPlanEntry && getReturnInfo() && (
              <div className={`mt-4 p-4 rounded-xl ${getReturnInfo()!.valid ? "bg-secondary" : "bg-destructive/10 border border-destructive/30"}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <p className={`text-sm ${getReturnInfo()!.valid ? "text-muted-foreground" : "text-destructive"}`}>
                    {getReturnInfo()!.msg}
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
            <p className="text-center text-muted-foreground text-lg mb-2">Dein Fahrzeug</p>
            {vehicles.length > 1 && (
              <p className="text-center text-xs text-muted-foreground mb-6">
                {vehicleIdx + 1} / {vehicles.length}, wische oder nutze die Pfeile
              </p>
            )}

            <div className="relative">
              {vehicles.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setVehicleIdx((i) => (i - 1 + vehicles.length) % vehicles.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/90 border border-border shadow flex items-center justify-center hover:bg-background"
                    aria-label="Vorheriges Fahrzeug"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleIdx((i) => (i + 1) % vehicles.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background/90 border border-border shadow flex items-center justify-center hover:bg-background"
                    aria-label="Nächstes Fahrzeug"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
                <img
                  src={displayVehicle.photo}
                  alt={displayVehicle.name}
                  className="w-full h-64 object-cover"
                  width={1024}
                  height={576}
                  loading="lazy"
                />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-foreground">{displayVehicle.name}</h3>
                    <span className="px-4 py-1.5 rounded-full bg-secondary text-sm font-mono font-medium text-foreground">
                      {displayVehicle.plate}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Kraftstoff</p>
                      <p className="font-medium text-foreground">{displayVehicle.fuel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Nutzlast</p>
                      <p className="font-medium text-foreground">{displayVehicle.payload}</p>
                    </div>
                    {displayVehicle.power && (
                      <div>
                        <p className="text-xs text-muted-foreground">Leistung</p>
                        <p className="font-medium text-foreground">{displayVehicle.power} kW</p>
                      </div>
                    )}
                    {displayVehicle.seats && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sitzplätze</p>
                        <p className="font-medium text-foreground">{displayVehicle.seats}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {vehicles.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-4">
                  {vehicles.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setVehicleIdx(i)}
                      aria-label={`Fahrzeug ${i + 1}`}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === vehicleIdx ? "bg-foreground w-6" : "bg-border"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Optionale Zusatzpakete */}
            <div className="mt-12">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                  Praktische Zusatzpakete
                </h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
                  Damit dein Umzug einfacher, sicherer und stressfreier wird – optional zubuchbar.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {ADDONS.map((addon) => (
                  <AddonPackageCard
                    key={addon.id}
                    addon={addon}
                    selected={selectedAddonIds.includes(addon.id)}
                    onToggle={toggleAddon}
                  />
                ))}
              </div>
              <p className="mt-6 text-xs text-muted-foreground text-center">{ADDON_NOTE}</p>
              <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-4">
                <p className="text-xs text-foreground text-center">{ADDON_TRUST}</p>
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
                  {selectedPlanEntry &&
                    `inkl. ${selectedPlanEntry.price} € Miete${
                      addonsTotal > 0 ? ` + ${addonsTotal} € Zubehör` : ""
                    } + ${DEPOSIT} € Kaution`}
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
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setRegForm({ ...regForm, accountType: "private" })}
                          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${regForm.accountType === "private" ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"}`}
                        >
                          Privatperson
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegForm({ ...regForm, accountType: "business" })}
                          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${regForm.accountType === "business" ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"}`}
                        >
                          Firma
                        </button>
                      </div>
                      {regForm.accountType === "business" && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium text-foreground">Firmenname</label>
                            <input
                              type="text"
                              value={regForm.companyName}
                              onChange={(e) => setRegForm({ ...regForm, companyName: e.target.value })}
                              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                              placeholder="Mustermann GmbH"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-foreground">USt-IdNr. <span className="text-muted-foreground font-normal">(optional)</span></label>
                            <input
                              type="text"
                              value={regForm.vatId}
                              onChange={(e) => setRegForm({ ...regForm, vatId: e.target.value })}
                              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                              placeholder="DE123456789"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Die Rechnung wird auf die Firma ausgestellt. Vor- und Nachname dienen als Ansprechpartner.</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-foreground">{regForm.accountType === "business" ? "Vorname (Ansprechpartner)" : "Vorname"}</label>
                          <input
                            type="text"
                            value={regForm.firstName}
                            onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Max"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground">{regForm.accountType === "business" ? "Nachname (Ansprechpartner)" : "Nachname"}</label>
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
                          disabled={!regForm.firstName || !regForm.lastName || !regForm.email || !regForm.phone || !regPassword || !regPasswordConfirm || !docsScanned || authLoading || (regForm.accountType === "business" && !regForm.companyName)}
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
            <h3 className="text-2xl font-bold text-foreground">
              {verified ? "Bezahlung" : "Verifizierung"}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {verified
                ? "Schließe deine Buchung ab und bezahle sicher."
                : "Bitte scanne deinen Ausweis und Führerschein, um die Buchung abzuschließen."}
            </p>

            {/* Countdown der 15-Minuten-Reservierung */}
            {holdSecondsLeft !== null && !paid && (
              <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm text-foreground">
                Dein Zeitfenster ist für{" "}
                <span className="font-bold">
                  {String(Math.floor(holdSecondsLeft / 60)).padStart(2, "0")}:
                  {String(holdSecondsLeft % 60).padStart(2, "0")}
                </span>{" "}
                Minuten reserviert.
              </div>
            )}
            {holdError && (
              <div className="mt-4 rounded-2xl bg-secondary p-3 text-xs text-destructive">
                {holdError}
              </div>
            )}

            {/* Verifizierungs-Block — vor der Bezahlung */}
            {!verified && !paid && (
              <div className="mt-6 space-y-3 text-left">
                <DocumentScanner
                  documentType="id"
                  isComplete={docTypes.has("id_front") && docTypes.has("id_back")}
                  onComplete={refreshDocs}
                />
                <DocumentScanner
                  documentType="license"
                  isComplete={docTypes.has("license_front") && docTypes.has("license_back")}
                  onComplete={refreshDocs}
                />
              </div>
            )}

            {verified && total !== null && (
              <div className="mt-8 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Zu zahlen</p>
                  <p className="text-3xl font-bold">{total} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  {selectedPlanEntry &&
                    `${selectedPlanEntry.price} € Miete${
                      addonsTotal > 0 ? ` + ${addonsTotal} € Zubehör` : ""
                    } + ${DEPOSIT} € Kaution`}
                </p>
              </div>
            )}

            {verified && !showCheckout && !paid && planKey && (
              <button
                onClick={async () => {
                  // Pending Booking für /checkout/return persistieren
                  if (typeof window !== "undefined" && date && startHour !== null && selectedPlanEntry) {
                    localStorage.setItem(
                      "mt_pending_booking",
                      JSON.stringify({
                        planId: selectedPlanEntry.id,
                        planLabel: selectedPlanEntry.label,
                        planPrice: selectedPlanEntry.price,
                        startDate: format(date, "yyyy-MM-dd"),
                        startHour,
                        email: regForm.email,
                        firstName: regForm.firstName,
                        lastName: regForm.lastName,
                        phone: regForm.phone,
                        vehicleName: displayVehicle.name || undefined,
                        vehiclePlate: displayVehicle.plate || undefined,
                        addons: buildAddonSnapshot(selectedAddonIds),
                      })
                    );
                   }
                    setCheckoutError(null);
                    setCheckoutClientSecret(null);
                    setShowCheckout(true);
                   try {
                     const origin = window.location.origin;
                     const result = await startBookingCheckout({
                       data: {
                         plan: planKey,
                          customerEmail: regForm.email || authUser?.email || undefined,
                          userId: authUser?.id,
                         returnUrl: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                         environment: getStripeEnvironment(),
                          addonIds: selectedAddonIds,
                          vehiclePlate: displayVehicle.plate || null,
                          startDate: date ? format(date, "yyyy-MM-dd") : undefined,
                          startHour: startHour ?? undefined,
                       },
                     });
                     if ("error" in result) throw new Error(result.error);
                     setCheckoutClientSecret(result.clientSecret);
                   } catch (e) {
                     console.error(e);
                     setCheckoutError(e instanceof Error ? e.message : "Zahlung konnte nicht gestartet werden.");
                      setCheckoutClientSecret(null);
                   }
                }}
                className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Sicher bezahlen
              </button>
            )}

            {showCheckout && !paid && planKey && (
              <div className="mt-8 text-left">
                {checkoutError ? (
                  <div className="rounded-2xl border border-border bg-secondary p-6 text-center space-y-4">
                    <p className="font-medium text-foreground">Zahlung konnte nicht geladen werden.</p>
                    <p className="text-sm text-muted-foreground">{checkoutError}</p>
                    <button
                      type="button"
                      onClick={() => { setShowCheckout(false); setCheckoutError(null); setCheckoutClientSecret(null); }}
                      className="rounded-full bg-accent px-6 py-3 text-accent-foreground font-medium"
                    >
                      Erneut versuchen
                    </button>
                  </div>
                ) : checkoutClientSecret ? (
                  <div className="rounded-2xl border border-border bg-background p-2 sm:p-4 overflow-hidden">
                    <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret: checkoutClientSecret }}>
                      <EmbeddedCheckout />
                    </EmbeddedCheckoutProvider>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-secondary p-6 text-center text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Stripe-Zahlung wird geladen…
                  </div>
                )}
              </div>
            )}

            {!paid && (
              <div className="mt-8 flex justify-start">
                <button
                  onClick={() => { setShowCheckout(false); setCheckoutError(null); setCheckoutClientSecret(null); setStep(registrationComplete ? 2 : 3); }}
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
                vehicleName={displayVehicle.name}
                vehiclePlate={displayVehicle.plate}
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