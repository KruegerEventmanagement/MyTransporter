import { ForgotPassword } from "@/components/ForgotPassword";
import { publicOrigin } from "@/lib/native/platform";
import { AddressFields } from "@/components/AddressFields";
import { EMPTY_ADDRESS, addressSignUpMetadata } from "@/lib/address";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, CreditCard, User, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { FuelInfoNote } from "./FuelInfoNote";
import { createBookingCheckout } from "@/lib/payments.functions";
import { KM_CATALOG_VERSION } from "@/lib/booking-rules";
import { previewCoupon, type CouponPreview } from "@/lib/birthday.functions";
import { ageOn, MIN_DRIVER_AGE } from "@/lib/birthday";
import { createBookingHold, releaseBookingHold } from "@/lib/booking-holds.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";
import { VehiclePicker, type PickerVehicle } from "./VehiclePicker";
import { isSpeedLimited, SPEED_LIMIT_TEXT } from "@/lib/vehicle-facts";

import { DocumentScanner } from "./DocumentScanner";
import { PreDriveFlow } from "./PreDriveFlow";
import { ActiveDriveScreen } from "./ActiveDriveScreen";
import { ReturnFlow } from "./ReturnFlow";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseAccessToken } from "@/lib/safe-auth-attacher";
import { trackCompleteRegistration, trackEvent } from "@/lib/analytics";
import { getBusySlots, type BusySlot } from "@/lib/availability.functions";
import { bookingWindowMsForDay } from "@/lib/booking-window";
import {
  slotsByPlate,
  isVehicleFree,
  nextFreeFrom,
  isDayBookable,
  anyPlateFreeForWindows,
} from "@/lib/availability-logic";
import {
  availableClassesForWindow,
  isSelectedPlanStillValid,
  isWindowBookable,
  lowestAvailablePlanPrice,
  pickVehicleForWindow,
  type VehicleLite,
} from "@/lib/plan-availability";

import {
  computePlanReturn,
  getPlanById,
  getAvailablePlans,
  planLabelWithClass,
  vehicleClassFromName,
  
  VEHICLE_CLASS_SHORT_LABEL,
  EARLIEST_START_HOUR,
  LATEST_RETURN_HOUR,
  L4H2_SURCHARGE_PER_DAY_EUR,
  L5H2_SURCHARGE_EUR,

  DEPOSIT_EUR,
  type VehicleClass,
} from "@/lib/booking-rules";
import { ADDONS, ADDON_NOTE, ADDON_TRUST, sumAddonsEur, buildAddonSnapshot, addonBaseId, resolveAddonSelection } from "@/lib/addons";
import { AddonPackageCard } from "./AddonPackageCard";
import { CustomKmCard } from "./CustomKmCard";
import { parseCustomKmInput, quoteCustomKm } from "@/lib/custom-km";
import { useSuppressAds } from "@/lib/ad-visibility";
import { useHideHouseAd } from "@/lib/house-ad-visibility";
import {
  PENDING_DOC_TYPES,
  listPendingDocumentTypes,
  savePendingDocument,
  uploadPendingDocuments,
  getPendingDocumentUrl,
  deletePendingDocument,
  type PendingDocType,
} from "@/lib/pending-documents";

const DEPOSIT = DEPOSIT_EUR;



const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00 (letzte Buchung 20 Uhr)



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
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
  cargo_volume_m3: number | null;
  pickup_location: string | null;
  pickup_address: string | null;
  trailer_load_braked_kg: number | null;
  tank_liters: number | null;
  range_km: number | null;
  first_registration: string | null;
  cargo_width_between_arches_cm: number | null;
  rear_door_width_cm: number | null;
  rear_door_height_cm: number | null;
  side_door_width_cm: number | null;
  side_door_height_cm: number | null;
  specs_status: string | null;
  specs_source: string | null;
};

/** cm → Meter mit einer Dezimalstelle, deutsch formatiert. */
const cmToM = (cm: number | null | undefined) =>
  typeof cm === "number" && cm > 0 ? `${(cm / 100).toFixed(2).replace(".", ",")} m` : null;

const AUTH_CONFIRM_URL = "https://www.mytransporter.org/auth/confirm";
const AUTH_BOOKING_DRAFT_KEY = "mt_auth_booking_draft";
const BOOKING_DRAFT_KEY = "mt_booking_draft";
const BOOKING_DRAFT_VERSION = 1;
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_LAST_SENT_KEY = "mt_resend_last_sent";
/** Auth-Aufrufe dürfen nie endlos hängen (iOS/Safari-Sperren, schlechtes Netz). */
const AUTH_TIMEOUT_MS = 20_000;
class AuthTimeoutError extends Error {
  constructor() {
    super("auth_timeout");
  }
}
function withAuthTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new AuthTimeoutError()), AUTH_TIMEOUT_MS),
    ),
  ]);
}


export function BookingSection() {
  const [step, setStep] = useState(0);
  const [liabilityAccepted, setLiabilityAccepted] = useState(false);
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [startHour, setStartHour] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [regAddress, setRegAddress] = useState(EMPTY_ADDRESS);
  const [regForm, setRegForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    
    accountType: "private" as "private" | "business",
    companyName: "",
    vatId: "",
  });
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState<CouponPreview | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
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
  const [profileComplete, setProfileComplete] = useState(false);
  const [vehicles, setVehicles] = useState<DbVehicle[]>([]);
  /** Ausdrücklich vom Kunden gewähltes Fahrzeug (Kennzeichen) – hat Vorrang. */
  const [explicitPlate, setExplicitPlate] = useState<string | null>(null);
  const [vehicleIdx, setVehicleIdx] = useState(0);
  const [restoreVehicle, setRestoreVehicle] = useState<{ id: string | null; plate: string | null } | null>(null);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  // Eigene 15-Minuten-Reservierung: darf die eigene Auswahl nicht blockieren.
  const [ownHold, setOwnHold] = useState<{ plate: string; start: number; end: number } | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  // Individuelles Kilometerpaket (optional): Rohtext bleibt erhalten, Prüfung streng.
  const [customKmEnabled, setCustomKmEnabled] = useState(false);
  const [customKmInput, setCustomKmInput] = useState("");
  const [pendingDocTypes, setPendingDocTypes] = useState<Set<string>>(new Set());
  const [pendingUploading, setPendingUploading] = useState(false);
  const [pendingUploadError, setPendingUploadError] = useState<string | null>(null);
  const [pendingVolatile, setPendingVolatile] = useState(false);


  const toggleAddon = (selectionId: string) => {
    const base = addonBaseId(selectionId);
    setSelectedAddonIds((prev) =>
      prev.some((x) => addonBaseId(x) === base)
        ? prev.filter((x) => addonBaseId(x) !== base)
        : [...prev, selectionId],
    );
  };
  const changeAddonSelection = (selectionId: string) => {
    const base = addonBaseId(selectionId);
    setSelectedAddonIds((prev) =>
      prev.map((x) => (addonBaseId(x) === base ? selectionId : x)),
    );
  };
  const addonsTotal = sumAddonsEur(selectedAddonIds);


  // Ladefehler müssen sichtbar sein: lieber "nicht prüfbar" als falsche Verfügbarkeit.
  const [busyError, setBusyError] = useState(false);
  const [busyLoading, setBusyLoading] = useState(true);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [vehiclesError, setVehiclesError] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  // Request-Reihenfolge: alte Antworten dürfen frische Daten nicht überschreiben.
  const busySeqRef = useRef(0);
  const vehiclesSeqRef = useRef(0);

  const refreshBusySlots = useCallback(() => {
    const seq = ++busySeqRef.current;
    setBusyLoading(true);
    getBusySlots()
      .then((slots) => {
        if (seq !== busySeqRef.current) return;
        setBusySlots(slots);
        setBusyError(false);
      })
      .catch((e) => {
        console.warn("Belegte Slots konnten nicht geladen werden:", e);
        if (seq === busySeqRef.current) setBusyError(true);
      })
      .finally(() => {
        if (seq === busySeqRef.current) setBusyLoading(false);
      });
  }, []);

  const refreshVehicles = useCallback(() => {
    const seq = ++vehiclesSeqRef.current;
    setVehiclesLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("vehicles")
          .select("id, name, plate, brand, model, fuel_type, max_weight_kg, empty_weight_kg, payload_kg, power_kw, seats, photo_urls, is_active, length_cm, width_cm, height_cm, cargo_length_cm, cargo_width_cm, cargo_height_cm, cargo_volume_m3, pickup_location, pickup_address, trailer_load_braked_kg, tank_liters, range_km, first_registration, cargo_width_between_arches_cm, rear_door_width_cm, rear_door_height_cm, side_door_width_cm, side_door_height_cm, specs_status, specs_source")
          .order("created_at", { ascending: true });
        if (seq !== vehiclesSeqRef.current) return;
        if (error || !data) {
          setVehiclesError(true);
          return;
        }
        // Freigegebene Fahrzeuge zuerst, gesperrte danach (sichtbar, aber nicht buchbar)
        const list = [...(data as DbVehicle[])].sort(
          (a, b) => Number(b.is_active) - Number(a.is_active),
        );
        setVehicles(list);
        setVehiclesError(false);
        setVehiclesLoaded(true);
      } catch (e) {
        console.warn("Fahrzeuge konnten nicht geladen werden:", e);
        if (seq === vehiclesSeqRef.current) setVehiclesError(true);
      } finally {
        if (seq === vehiclesSeqRef.current) setVehiclesLoading(false);
      }
    })();
  }, []);

  /** Verfügbarkeit erneut prüfen: immer BEIDE Quellen. */
  const retryAvailability = useCallback(() => {
    refreshBusySlots();
    refreshVehicles();
  }, [refreshBusySlots, refreshVehicles]);

  // Beim Einstieg und nach jedem Schritt neu laden, damit frische Holds/Buchungen greifen.
  // (Kein zusätzlicher Mount-Fetch – dieser Effekt läuft beim ersten Render mit step 0.)
  useEffect(() => {
    if (step <= 2) refreshBusySlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const currentPlate = vehicles[vehicleIdx]?.plate ?? "";
  const visibleBusySlots = useMemo(() => {
    if (!ownHold) return busySlots;
    const norm = (p: string) => p.replace(/\s+/g, "").toUpperCase();
    return busySlots.filter((s) => {
      if (norm(s.vehiclePlate ?? "") !== norm(ownHold.plate)) return true;
      const start = new Date(s.start).getTime();
      const end = new Date(s.end).getTime();
      return !(Math.abs(start - ownHold.start) < 60_000 && Math.abs(end - ownHold.end) < 60_000);
    });
  }, [busySlots, ownHold]);
  const busyMap = useMemo(() => slotsByPlate(visibleBusySlots), [visibleBusySlots]);
  

  // Convenience: range start/end + Nächtezahl
  // Wichtig: 1 Nacht = 1 Tag. Selber Tag (0 Nächte) = Tagesmiete (<24h).
  const rangeFrom = range?.from;
  const rangeTo = range?.to ?? range?.from;
  const nights = rangeFrom && rangeTo ? differenceInCalendarDays(rangeTo, rangeFrom) : -1;
  // Für UI-Anzeige: 0 Nächte → "Tagesmiete", sonst N Tage = N Nächte
  const rangeDays = nights; // semantisch = Nächte
  const date = rangeFrom; // bestehender Code unten verwendet `date` als Startdatum

  const handleRangeSelect = (next: { from?: Date; to?: Date } | undefined) => {
    if (!next?.from) {
      setRange(undefined);
      setStartHour(null);
      setSelectedPlanId(null);
      return;
    }
    if (next.to) {
      const start = next.from < next.to ? next.from : next.to;
      const end = next.from < next.to ? next.to : next.from;
      setRange({ from: start, to: end });
    } else {
      setRange({ from: next.from, to: undefined });
    }
    setStartHour(null);
    setSelectedPlanId(null);
  };

  // Zeitfenster der aktuellen Auswahl (für Fahrzeug-Verfügbarkeit)
  const selectionWindow = useMemo(() => {
    if (!date || startHour === null || !selectedPlanId) return null;
    return bookingWindowMsForDay(selectedPlanId, date, startHour);
  }, [date, startHour, selectedPlanId]);

  /** Noch nicht freigegebene Fahrzeuge sind sichtbar, aber nie buchbar. */
  const isPlateBookableVehicle = (plate: string) => {
    const norm = (p: string) => p.replace(/\s+/g, "").toUpperCase();
    const v = vehicles.find((x) => norm(x.plate ?? "") === norm(plate));
    return v ? v.is_active : true;
  };

  const isPlateAvailable = (plate: string) => {
    if (!isPlateBookableVehicle(plate)) return false;
    if (!selectionWindow) return true;
    return isVehicleFree(busyMap, plate, selectionWindow.start, selectionWindow.end);
  };

  const plateFreeAgainAt = (plate: string) => {
    if (!selectionWindow) return null;
    return nextFreeFrom(busyMap, plate, selectionWindow.start, selectionWindow.end);
  };

  const currentVehicleUnavailable = currentPlate ? !isPlateAvailable(currentPlate) : false;





  useEffect(() => {
    refreshVehicles();
  }, [refreshVehicles]);

  const currentVehicle = vehicles[vehicleIdx];
  const displayVehicle = currentVehicle
    ? {
        name: currentVehicle.name || `${currentVehicle.brand ?? ""} ${currentVehicle.model ?? ""}`.trim() || "Fahrzeug",
        plate: currentVehicle.plate || "-",
        seats: currentVehicle.seats,
        power: currentVehicle.power_kw,
        totalLength: cmToM(currentVehicle.length_cm),
        totalWidth: cmToM(currentVehicle.width_cm),
        totalHeight: cmToM(currentVehicle.height_cm),
        cargoLength: cmToM(currentVehicle.cargo_length_cm),
        cargoWidth: cmToM(currentVehicle.cargo_width_cm),
        cargoHeight: cmToM(currentVehicle.cargo_height_cm),
        cargoVolume: currentVehicle.cargo_volume_m3
          ? `${String(currentVehicle.cargo_volume_m3).replace(".", ",")} m³`
          : null,
        pickupLocation: currentVehicle.pickup_location,
        pickupAddress: currentVehicle.pickup_address,
      }
    : {
        name: "", plate: "",
        seats: null as number | null, power: null as number | null,
        totalLength: null as string | null, totalWidth: null as string | null, totalHeight: null as string | null,
        cargoLength: null as string | null, cargoWidth: null as string | null, cargoHeight: null as string | null,
        cargoVolume: null as string | null,
        pickupLocation: null as string | null, pickupAddress: null as string | null,
      };

  // Fahrzeugklasse des aktuell gewählten Transporters – steuert den Preis
  const vehicleClass: VehicleClass = vehicleClassFromName(
    currentVehicle?.name,
    currentVehicle?.model,
    currentVehicle?.plate,
  );
  const classOfVehicle = (v: DbVehicle): VehicleClass =>
    vehicleClassFromName(v.name, v.model, v.plate);
  /** Nur freigegebene Fahrzeuge zählen für Preisklassen und Verfügbarkeit. */
  const bookableVehicles = useMemo(() => vehicles.filter((v) => v.is_active), [vehicles]);
  const availableClasses = Array.from(new Set(bookableVehicles.map(classOfVehicle)));

  // ---- Verfügbarkeit im gesamten Auswahlprozess ----
  const activePlates = useMemo(
    () => bookableVehicles.map((v) => v.plate ?? "").filter(Boolean),
    [bookableVehicles],
  );
  /**
   * Flotte für die Verfügbarkeitsprüfung: immer ALLE freigegebenen Fahrzeuge,
   * unabhängig von einer (noch nicht getroffenen) Klassenwahl.
   */
  const fleetLite: VehicleLite[] = useMemo(
    () =>
      vehicles
        .map((v) => ({
          plate: v.plate ?? "",
          isActive: v.is_active,
          vehicleClass: vehicleClassFromName(v.name, v.model, v.plate),
        }))
        .filter((v) => v.plate),
    [vehicles],
  );

  /** Läuft gerade eine (erneute) Prüfung? */
  const availabilityLoading = busyLoading || vehiclesLoading;
  const availabilityError = busyError || vehiclesError;
  /** Vollständig und fehlerfrei geladen – nur dann sind Aussagen belastbar. */
  const availabilityReady = !availabilityLoading && !availabilityError && vehiclesLoaded;
  /** Verfügbarkeit ist nicht prüfbar → fail closed, keine falsche Zusage. */
  const availabilityUnknown = !availabilityReady;

  /** Kalendertag: nur sperren, wenn für KEIN Fahrzeug irgendein Fenster frei ist. */
  const isDayUnavailable = (d: Date) => {
    if (activePlates.length === 0) return false;
    return !isDayBookable(busyMap, activePlates, d, {
      earliestHour: EARLIEST_START_HOUR,
      latestReturnHour: LATEST_RETURN_HOUR,
      minDurationHours: 3,
    });
  };

  const windowFor = (planId: string, hour: number) => {
    if (!date) return null;
    return bookingWindowMsForDay(planId, date, hour);
  };

  /** Startstunde: sperren, wenn zu dieser Zeit KEIN Fahrzeug einen kompletten Tarif frei hat. */
  const isHourUnavailable = (hour: number) => {
    if (!date || activePlates.length === 0) return false;
    const wins = getAvailablePlans(nights, hour)
      .map((p) => windowFor(p.id, hour))
      .filter((w): w is { start: number; end: number } => w !== null);
    if (wins.length === 0) return true;
    // Jeweils ein einzelnes Fahrzeug muss das GANZE Fenster frei haben.
    return !wins.some((w) => isWindowBookable(busyMap, fleetLite, w));
  };

  /** Fahrzeuge, die im gewählten Tarif-Zeitraum wirklich komplett frei sind. */
  const classesForWindow = (w: { start: number; end: number } | null) =>
    w ? availableClassesForWindow(busyMap, fleetLite, w) : [];

  // Fahrzeug passend zum Zeitraum wählen: günstigste verfügbare Klasse,
  // ausdrückliche gültige Kundenauswahl hat Vorrang.
  useEffect(() => {
    // Nur in der Auswahlphase umschalten – ab der Verifizierung/Bezahlung
    // muss das gewählte Fahrzeug (und dessen Reservierung) stabil bleiben.
    if (step > 2) return;
    // Solange die Verfügbarkeit nicht sauber geladen ist: nicht umschalten.
    if (!availabilityReady) return;
    if (!selectionWindow || vehicles.length === 0) return;
    const cur = vehicles[vehicleIdx];
    // Noch nicht freigegebene Fahrzeuge darf man ansehen – nicht automatisch wegspringen
    if (cur && !cur.is_active) return;
    const plate = pickVehicleForWindow(busyMap, fleetLite, selectionWindow, {
      preferredPlate: explicitPlate,
    });
    if (!plate) return;
    const next = vehicles.findIndex((v) => (v.plate ?? "") === plate);
    if (next >= 0 && next !== vehicleIdx) setVehicleIdx(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, availabilityReady, selectionWindow, busyMap, vehicles, vehicleIdx, fleetLite, explicitPlate]);

  /** Ausdrückliche Fahrzeugwahl des Kunden (bleibt erhalten, solange sie gültig ist). */
  const chooseVehicle = (i: number) => {
    setVehicleIdx(i);
    setExplicitPlate(vehicles[i]?.plate ?? null);
  };

  // Nach Registrierung/Rückkehr: gespeichertes Fahrzeug wiederherstellen (nicht auf Index 0 fallen).
  useEffect(() => {
    if (!restoreVehicle || vehicles.length === 0) return;
    const norm = (p: string) => p.replace(/\s+/g, "").toUpperCase();
    const i = vehicles.findIndex(
      (v) => (restoreVehicle.id && v.id === restoreVehicle.id) ||
        (!!restoreVehicle.plate && norm(v.plate ?? "") === norm(restoreVehicle.plate)),
    );
    if (i >= 0) {
      setVehicleIdx(i);
      setExplicitPlate(vehicles[i]?.plate ?? null);
    }
    setRestoreVehicle(null);
  }, [restoreVehicle, vehicles]);

  const pickerVehicles: PickerVehicle[] = useMemo(
    () =>
      vehicles.map((v) => ({
        ...v,
        plate: v.plate ?? "",
        classLabel: VEHICLE_CLASS_SHORT_LABEL[vehicleClassFromName(v.name, v.model, v.plate)],
      })),
    [vehicles],
  );

  /**
   * Tarif: sperren, wenn KEIN freigegebenes Fahrzeug den kompletten Zeitraum
   * frei hat. Keine Einschränkung auf eine Fahrzeugklasse.
   */
  const isPlanUnavailable = (planId: string) => {
    if (!date || startHour === null) return false;
    if (availabilityUnknown) return true;
    if (fleetLite.length === 0) return true;
    const w = windowFor(planId, startHour);
    if (!w) return false;
    return !isWindowBookable(busyMap, fleetLite, w);
  };

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
            vehicleId?: string | null;
            vehiclePlate?: string | null;
            addonIds?: unknown;
            customKmEnabled?: unknown;
            customKmInput?: unknown;
          };
          if (draft.from) {
            setRange({
              from: new Date(draft.from),
              to: draft.to ? new Date(draft.to) : new Date(draft.from),
            });
          }
          if (typeof draft.startHour === "number") setStartHour(draft.startHour);
          if (typeof draft.selectedPlanId === "string") setSelectedPlanId(draft.selectedPlanId);
          if (Array.isArray(draft.addonIds)) setSelectedAddonIds(draft.addonIds.filter((x): x is string => typeof x === "string").slice(0, 5));
          if (draft.customKmEnabled === true) setCustomKmEnabled(true);
          if (typeof draft.customKmInput === "string") setCustomKmInput(draft.customKmInput.slice(0, 12));
          if (typeof draft.vehicleId === "string" || typeof draft.vehiclePlate === "string") {
            setRestoreVehicle({ id: draft.vehicleId ?? null, plate: draft.vehiclePlate ?? null });
            if (draft.vehiclePlate) setExplicitPlate(draft.vehiclePlate);
          }
        }
      } catch {
        localStorage.removeItem(AUTH_BOOKING_DRAFT_KEY);
      }
      setStep(5);
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsLoggedIn(true);
        setAuthUser({ id: session.user.id, email: session.user.email ?? undefined });
        setProfileComplete(true);
        setSignupEmailSent(null);
        setShowLogin(false);
        setStep((currentStep) => (currentStep === 4 ? 5 : currentStep));
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
        setStep((currentStep) => (currentStep === 4 ? 5 : currentStep));
        if (data.session.user.email_confirmed_at || data.session.user.confirmed_at) {
          localStorage.removeItem(AUTH_BOOKING_DRAFT_KEY);
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Versionierter Buchungsentwurf (nur Auswahl – keine Ausweis-, Passwort- oder
  // Zahlungsdaten) für gewöhnliches Neuladen. Einmal beim Einstieg wiederherstellen,
  // erst danach automatisch speichern. Verfügbarkeit/Hold werden danach frisch geprüft.
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    try {
      const fromEmail = new URLSearchParams(window.location.search).get("email_confirmed") === "1";
      const raw = fromEmail ? null : sessionStorage.getItem(BOOKING_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = typeof d.from === "string" ? new Date(d.from) : null;
        const fresh = d.v === BOOKING_DRAFT_VERSION && typeof d.savedAt === "number" && Date.now() - d.savedAt < 24 * 3600_000;
        if (!fresh || !from || isNaN(from.getTime()) || from < today) {
          sessionStorage.removeItem(BOOKING_DRAFT_KEY);
        } else {
          const to = typeof d.to === "string" ? new Date(d.to) : from;
          setRange({ from, to: isNaN(to.getTime()) ? from : to });
          if (typeof d.startHour === "number") setStartHour(d.startHour);
          if (typeof d.selectedPlanId === "string") setSelectedPlanId(d.selectedPlanId);
          if (Array.isArray(d.addonIds)) setSelectedAddonIds(d.addonIds.filter((x): x is string => typeof x === "string").slice(0, 5));
          if (d.customKmEnabled === true) setCustomKmEnabled(true);
          if (typeof d.customKmInput === "string") setCustomKmInput(d.customKmInput.slice(0, 12));
          if (typeof d.vehicleId === "string" || typeof d.vehiclePlate === "string") {
            setRestoreVehicle({ id: (d.vehicleId as string) ?? null, plate: (d.vehiclePlate as string) ?? null });
            if (typeof d.vehiclePlate === "string") setExplicitPlate(d.vehiclePlate);
          }
          // Höchstens bis „Fahrzeug & Zubehör“ – Reservierung entsteht erst später neu.
          if (typeof d.step === "number") setStep(d.step >= 2 ? 2 : d.step >= 1 ? 1 : 0);
        }
      }
    } catch {
      try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); } catch { /* Speicher nicht verfügbar */ }
    }
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (registrationComplete && step === 4 && !pendingUploading) {
      setStep(5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationComplete, step, pendingUploading]);

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
    const regAge = regForm.birthDate ? ageOn(regForm.birthDate) : null;
    if (regAge === null || regAge < MIN_DRIVER_AGE) {
      setAuthError(`Für eine Buchung musst du mindestens ${MIN_DRIVER_AGE} Jahre alt sein.`);
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
        vehicleId: currentVehicle?.id ?? null,
        vehiclePlate: currentVehicle?.plate ?? null,
        addonIds: selectedAddonIds,
        customKmEnabled,
        customKmInput,
      }),
    );
    type SignUpResult = Awaited<ReturnType<typeof supabase.auth.signUp>>;
    let result: SignUpResult;
    try {
      result = await withAuthTimeout<SignUpResult>(
        supabase.auth.signUp({
          email: regForm.email,
          password: regPassword,
          options: {
            emailRedirectTo: AUTH_CONFIRM_URL,
            data: {
              first_name: regForm.firstName,
              last_name: regForm.lastName,
              phone: regForm.phone,
              birth_date: regForm.birthDate,
              
              account_type: regForm.accountType,
              company_name: regForm.accountType === "business" ? regForm.companyName : "",
              vat_id: regForm.accountType === "business" ? regForm.vatId : "",
              ...addressSignUpMetadata(regAddress),
            },
          },
        }),
      );
    } catch (e) {
      // Zeitgrenze erreicht: prüfen, ob das Konto trotzdem schon aktiv ist.
      const { data: sessionData } = await supabase.auth
        .getSession()
        .catch(() => ({ data: { session: null } }));
      const existing = sessionData?.session ?? null;
      setAuthLoading(false);
      if (existing?.user) {
        setIsLoggedIn(true);
        setProfileComplete(true);
        setAuthUser({ id: existing.user.id, email: existing.user.email ?? undefined });
        setShowLogin(false);
        setStep(5);
        return;
      }
      console.error("Registrierung fehlgeschlagen:", e);
      setAuthError(
        e instanceof AuthTimeoutError
          ? "Die Registrierung hat zu lange gedauert. Bitte prüfe deine Internetverbindung und versuche es erneut – falls dein Konto schon angelegt wurde, melde dich einfach an."
          : "Die Registrierung hat nicht funktioniert. Bitte versuche es erneut.",
      );
      return;
    }
    const { data, error } = result;

    if (error) {
      setAuthLoading(false);
      const msg = /already registered|already been registered|User already/i.test(error.message)
        ? "Diese E-Mail ist bereits registriert. Bitte melde dich mit deinem Passwort an."
        : error.message;
      setAuthError(msg);
      if (/already/i.test(error.message)) {
        setShowLogin(true);
        setLoginForm({ email: regForm.email, password: "" });
      }
      return;
    }
    const alreadyRegistered =
      !data.session && Array.isArray(data.user?.identities) && data.user!.identities!.length === 0;
    // Konto serverseitig angelegt → CompleteRegistration (einmalig pro User-ID).
    if (data.user?.id && !alreadyRegistered) trackCompleteRegistration(data.user.id);
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
    let session = data.session ?? null;
    if (!session) {
      // Kein Session-Objekt → direkt anmelden (Auto-Bestätigung aktiv).
      // Kurzer Retry, falls das Konto serverseitig noch nicht bereit ist.
      for (let attempt = 0; attempt < 3 && !session; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 900));
        try {
          const { data: signInData, error: signInError } = await withAuthTimeout(
            supabase.auth.signInWithPassword({
              email: regForm.email,
              password: regPassword,
            }),
          );
          if (signInData?.session) {
            session = signInData.session;
            break;
          }
          if (signInError && /Email not confirmed/i.test(signInError.message)) break;
        } catch (e) {
          console.warn("Automatische Anmeldung fehlgeschlagen:", e);
          break;
        }
      }

    }
    setAuthLoading(false);
    if (!session) {
      if (alreadyRegistered) {
        setAuthError(
          "Für diese E-Mail existiert schon ein Konto. Bitte melde dich mit deinem Passwort an.",
        );
      } else {
        setAuthError(
          "Dein Konto wurde erstellt, die automatische Anmeldung hat aber nicht funktioniert. Bitte melde dich einmal an – danach geht es direkt zur Zahlung weiter.",
        );
      }
      setShowLogin(true);
      setLoginForm({ email: regForm.email, password: "" });
      return;
    }
    setIsLoggedIn(true);
    setProfileComplete(true);
    setAuthUser({ id: session.user.id, email: session.user.email ?? undefined });
    setSignupEmailSent(null);
    setShowLogin(false);
    // Willkommens-E-Mail (still im Hintergrund)
    import("@/lib/booking-emails.functions").then(({ sendWelcomeEmail }) =>
      sendWelcomeEmail({
        data: {
          email: regForm.email,
          firstName: regForm.firstName,
        },
      }).catch((e: unknown) => console.warn("Willkommens-Mail fehlgeschlagen:", e)),
    );
  };

  const handleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { data, error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: loginForm.email,
          password: loginForm.password,
        }),
      );
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
        setStep(5);
      }
    } catch (e) {
      setAuthLoading(false);
      console.error("Anmeldung fehlgeschlagen:", e);
      setAuthError(
        "Die Anmeldung hat zu lange gedauert. Bitte prüfe deine Internetverbindung und versuche es erneut.",
      );
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
  /** Fahrzeug, das für die aktuelle Auswahl wirklich frei ist (null = keins). */
  const selectableVehiclePlate = selectionWindow
    ? pickVehicleForWindow(busyMap, fleetLite, selectionWindow, { preferredPlate: explicitPlate })
    : null;
  // Fail closed: ohne geladene Verfügbarkeit und ohne wirklich freies Fahrzeug kein „Weiter“.
  const canProceedStep1 =
    startHour !== null &&
    selectedPlanId !== null &&
    !availabilityUnknown &&
    !isPlanUnavailable(selectedPlanId) &&
    selectableVehiclePlate !== null;

  // Schritt 2 → Bezahlen: nur mit sauber geladener Verfügbarkeit und einem
  // vorhandenen, freigegebenen, im Zeitraum wirklich freien Fahrzeug.
  const canProceedStep2 =
    availabilityReady &&
    Boolean(currentVehicle?.is_active) &&
    Boolean(currentPlate) &&
    !currentVehicleUnavailable;


  // Veraltete Verfügbarkeit / Rücksprung: nicht mehr freien Tarif abwählen.
  // Wichtig: nur abwählen, wenn FRISCHE, fehlerfreie Daten die Auswahl widerlegen –
  // ein laufender oder fehlgeschlagener Refresh darf eine gültige Wahl nicht löschen.
  useEffect(() => {
    if (step > 1 || !selectedPlanId) return;
    if (!availabilityReady) return;
    const w = startHour === null ? null : windowFor(selectedPlanId, startHour);
    if (!isSelectedPlanStillValid(busyMap, fleetLite, w)) {
      setSelectedPlanId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedPlanId, busyMap, fleetLite, date, startHour, availabilityReady]);

  // Tarife passend zur gewählten Nächtezahl + Startstunde + Fahrzeugklasse
  const availablePlans = getAvailablePlans(nights, startHour, vehicleClass);

  const selectedPlanEntry = selectedPlanId ? getPlanById(selectedPlanId, vehicleClass) : null;

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

  // Kilometerpaket: gleiche reine Funktion wie der Server (Server rechnet erneut).
  // Leeres Feld = kein Paket (bisheriger Tarif), kein Fehler.
  const customKmParsed = customKmEnabled && customKmInput.trim() !== "" ? parseCustomKmInput(customKmInput) : null;
  const customKmError =
    !customKmEnabled || customKmInput.trim() === ""
      ? null
      : selectedPlanId === "km"
        ? "Beim reinen Kilometer-Tarif ist kein Kilometerpaket nötig. Bitte deaktivieren."
        : customKmParsed && !customKmParsed.ok
          ? customKmParsed.error
          : null;
  const customKmQuote =
    customKmEnabled && !customKmError && customKmParsed?.ok && selectedPlanId
      ? quoteCustomKm(selectedPlanId, vehicleClass, customKmParsed.value)
      : null;
  const kmPackageEur = customKmQuote ? customKmQuote.surchargeCents / 100 : 0;
  const rentWithKmEur = selectedPlanEntry ? Math.round((selectedPlanEntry.price + kmPackageEur) * 100) / 100 : 0;
  const total = selectedPlanEntry ? Math.round((selectedPlanEntry.price + kmPackageEur + addonsTotal + DEPOSIT) * 100) / 100 : null;
  const fmtEur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  const contractKmShown = customKmQuote ? customKmQuote.contractKm : selectedPlanEntry?.freeKm ?? 0;
  const contractRateCents = customKmQuote ? customKmQuote.rateCents : selectedPlanEntry?.extraKmCents ?? 0;


  const [paid, setPaid] = useState(false);

  // Entwurf nach Änderungen speichern (erst nach der Wiederherstellung).
  useEffect(() => {
    if (!draftRestored || paid) return;
    try {
      if (!rangeFrom) { sessionStorage.removeItem(BOOKING_DRAFT_KEY); return; }
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({
        v: BOOKING_DRAFT_VERSION, savedAt: Date.now(), step: Math.min(step, 2),
        from: rangeFrom.toISOString(), to: rangeTo?.toISOString(), startHour, selectedPlanId,
        vehicleId: currentVehicle?.id ?? null, vehiclePlate: currentVehicle?.plate ?? null,
        addonIds: selectedAddonIds, customKmEnabled, customKmInput,
      }));
    } catch { /* Speicher voll/gesperrt – Buchung funktioniert weiter */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRestored, paid, step, rangeFrom?.getTime(), rangeTo?.getTime(), startHour, selectedPlanId, currentVehicle?.id, selectedAddonIds, customKmEnabled, customKmInput]);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [startKm, setStartKm] = useState<number>(0);
  const [drivePhase, setDrivePhase] = useState<"pre" | "active" | "return" | "done" | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const startBookingCheckout = useServerFn(createBookingCheckout);
  const checkCouponCode = useServerFn(previewCoupon);
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

  /** doc_type -> photo_url of the account's stored scans (for previews/replacement). */
  const [docPaths, setDocPaths] = useState<Record<string, string>>({});
  const [docPreviews, setDocPreviews] = useState<Record<string, string>>({});

  const refreshDocs = async () => {
    if (!authUser?.id) return;
    const { data } = await supabase
      .from("user_documents")
      .select("doc_type, photo_url")
      .eq("user_id", authUser.id)
      .is("deleted_by_user_at", null)
      .order("created_at", { ascending: false });
    if (data) {
      setDocTypes(new Set(data.map((d: { doc_type: string }) => d.doc_type)));
      const paths: Record<string, string> = {};
      for (const row of data as { doc_type: string; photo_url: string | null }[]) {
        if (row.photo_url && !paths[row.doc_type]) paths[row.doc_type] = row.photo_url;
      }
      setDocPaths(paths);
    }
  };

  // Dokumente beim Login/Step-Wechsel laden
  useEffect(() => { refreshDocs(); }, [authUser?.id]);

  // Zwischengespeicherte Scans (ohne Konto) laden
  useEffect(() => {
    listPendingDocumentTypes().then(setPendingDocTypes).catch(() => {});
  }, []);

  const guestDocsComplete = PENDING_DOC_TYPES.every((t) => pendingDocTypes.has(t));
  const docsReady = authUser?.id ? verified : guestDocsComplete;

  // Kleine Vorschaubilder der vier Felder aufbauen (Konto: signierte URL, Gast: lokal)
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const docType of PENDING_DOC_TYPES) {
        if (authUser?.id) {
          const path = docPaths[docType];
          if (!path) continue;
          const { data } = await supabase.storage
            .from("user-documents")
            .createSignedUrl(path, 60 * 30);
          if (data?.signedUrl) next[docType] = data.signedUrl;
        } else if (pendingDocTypes.has(docType)) {
          const url = await getPendingDocumentUrl(docType);
          if (url) {
            next[docType] = url;
            created.push(url);
          }
        }
      }
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setDocPreviews(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, docPaths, pendingDocTypes]);

  const handlePendingCapture = async (docType: PendingDocType, blob: Blob) => {
    const level = await savePendingDocument(docType, blob);
    if (level === "memory") setPendingVolatile(true);
    setPendingDocTypes((prev) => new Set(prev).add(docType));
  };

  /** Entfernt genau eine Seite, damit sie neu aufgenommen werden kann. */
  const resetDocSide = async (docType: PendingDocType) => {
    if (authUser?.id) {
      await supabase
        .from("user_documents")
        .update({ deleted_by_user_at: new Date().toISOString() })
        .eq("user_id", authUser.id)
        .eq("doc_type", docType)
        .is("deleted_by_user_at", null);
      await refreshDocs();
    } else {
      await deletePendingDocument(docType);
      setPendingDocTypes(await listPendingDocumentTypes());
    }
  };

  /** Die vier Einzelfelder (Ausweis vorne/hinten, Führerschein vorne/hinten). */
  const renderDocFields = () => (
    <div className="space-y-3">
      {PENDING_DOC_TYPES.map((docType) => (
        <DocumentScanner
          key={docType}
          docType={docType}
          mode={authUser?.id ? "upload" : "pending"}
          onCapture={handlePendingCapture}
          isComplete={authUser?.id ? docTypes.has(docType) : pendingDocTypes.has(docType)}
          previewUrl={docPreviews[docType] ?? null}
          onReset={() => resetDocSide(docType)}
          onComplete={refreshDocs}
        />
      ))}
    </div>
  );



  const flushPendingDocuments = async (userId: string) => {
    setPendingUploadError(null);
    setPendingUploading(true);
    try {
      await uploadPendingDocuments(userId);
      setPendingDocTypes(await listPendingDocumentTypes());
      await refreshDocs();
    } catch (e) {
      console.error("Dokument-Upload fehlgeschlagen:", e);
      setPendingUploadError(
        e instanceof Error ? e.message : "Dokumente konnten nicht hochgeladen werden.",
      );
    } finally {
      setPendingUploading(false);
    }
  };

  // Sobald ein Konto existiert: zwischengespeicherte Scans übertragen
  useEffect(() => {
    const userId = authUser?.id;
    if (!userId) return;
    listPendingDocumentTypes()
      .then((types) => {
        if (types.size > 0) return flushPendingDocuments(userId);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  // Beim Betreten des Bezahlschritts: Hold anlegen
  useEffect(() => {
    if (step !== 5) return;
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
        if (selectionWindow && displayVehicle.plate) {
          setOwnHold({
            plate: displayVehicle.plate,
            start: selectionWindow.start,
            end: selectionWindow.end,
          });
        }
        refreshBusySlots();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHoldError(e instanceof Error ? e.message : "Reservierung fehlgeschlagen");
        refreshBusySlots();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, authUser?.id]);

  // Tick für Countdown
  useEffect(() => {
    if (step !== 5 || !holdExpiresAt) return;
    const id = setInterval(() => setHoldNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step, holdExpiresAt]);

  const holdSecondsLeft = holdExpiresAt
    ? Math.max(0, Math.floor((holdExpiresAt - holdNow) / 1000))
    : null;
  const holdExpired = holdSecondsLeft !== null && holdSecondsLeft === 0;

  // Bei Ablauf: Hold freigeben, zurück auf Zeit/Tarif
  useEffect(() => {
    if (!holdExpired || step !== 5 || paid || showCheckout) return;
    if (date && startHour !== null) {
      dropBookingHold({
        data: { startDate: format(date, "yyyy-MM-dd"), startHour },
      }).catch(() => {});
    }
    setHoldExpiresAt(null);
    setOwnHold(null);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdExpired]);

  // Werbeflächen während Verifizierung, Registrierung, Zahlung, Bestätigung
  // und aktiver Fahrt vollständig ausblenden (Google-Richtlinien).
  useSuppressAds(step >= 1 || showCheckout || paid || drivePhase !== null);
  useHideHouseAd(step >= 1 || showCheckout || paid || drivePhase !== null);

  const stepTitles = registrationComplete
    ? ["Datum", "Uhrzeit & Tarif", "Fahrzeug & Zubehör", "Verifizierung", "Bezahlen", "Fahrt"]
    : ["Datum", "Uhrzeit & Tarif", "Fahrzeug & Zubehör", "Verifizierung", "Registrierung", "Bezahlen", "Fahrt"];
  // Wenn die Registrierung (Schritt 4) übersprungen wird, rutschen 5/6 im Stepper hoch
  const stepperIndex = registrationComplete && step >= 5 ? step - 1 : step;

  const planKey: string | null = selectedPlanEntry ? `rent_${selectedPlanEntry.id}` : null;

  return (
    <section id="booking" className="py-6 px-3 sm:px-4 overflow-x-hidden">
      {step === 5 && <PaymentTestModeBanner />}
      <div className="max-w-4xl mx-auto w-full">
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-center text-foreground animate-fade-in-up">
          Buche deinen Transporter
        </h2>

        {/* Step indicator */}
        <div
          className="mt-8 grid w-full max-w-2xl mx-auto gap-x-1"
          style={{ gridTemplateColumns: `repeat(${stepTitles.length}, minmax(0, 1fr))` }}
        >
          {stepTitles.map((title, i) => (
            <div key={title} className="flex min-w-0 flex-col items-center gap-1">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all flex-shrink-0 ${
                i <= stepperIndex ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <span className={`hidden sm:block w-full break-words hyphens-auto text-xs text-center leading-tight px-0.5 ${i <= stepperIndex ? "text-foreground" : "text-muted-foreground"}`}>
                {title}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-foreground sm:hidden" aria-live="polite">
          Schritt {Math.min(stepperIndex, stepTitles.length - 1) + 1} von {stepTitles.length}:{" "}
          <span className="font-medium">{stepTitles[Math.min(stepperIndex, stepTitles.length - 1)]}</span>
        </p>

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
                  return isDayUnavailable(d);
                }}
                className="rounded-3xl border border-border p-3 sm:p-8 shadow-lg pointer-events-auto text-base sm:text-lg [--cell-size:2.5rem] min-[360px]:[--cell-size:2.75rem] min-[390px]:[--cell-size:3rem] sm:[--cell-size:3.5rem]"
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


            <div className="mt-6 flex justify-center">
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
                          className={`mb-3 w-full py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                            startHour === currentHour
                              ? "bg-accent text-accent-foreground shadow-md"
                              : "bg-foreground text-background hover:opacity-90"
                          }`}
                        >
                          Jetzt sofort starten ({String(currentHour).padStart(2, "0")}:
                          {String(now.getMinutes()).padStart(2, "0")} Uhr)
                        </button>
                      )}
                      {visibleHours.length > 0 ? (
                        <div className="grid grid-cols-5 gap-2">
                          {visibleHours.map((h) => {
                            const hourBlocked = isHourUnavailable(h);
                            return (
                            <button
                              key={h}
                              disabled={hourBlocked}
                              title={hourBlocked ? "Zu dieser Zeit ist kein Transporter verfügbar" : undefined}
                              onClick={() => { setStartHour(h); setSelectedPlanId(null); }}
                              className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                                startHour === h
                                  ? "bg-accent text-accent-foreground shadow-md"
                                  : "bg-secondary text-foreground hover:bg-accent/20"
                              } disabled:opacity-40 disabled:cursor-not-allowed disabled:line-through disabled:hover:bg-secondary`}
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
                <p className="text-center text-muted-foreground text-lg mt-10 mb-2">Wähle deinen Tarif</p>
                {availableClasses.length > 1 && (
                  <p className="text-center text-xs text-muted-foreground mb-6">
                    Preise ab kurzem Transporter. Der lange Transporter mit Hochdach kostet{" "}
                    {L4H2_SURCHARGE_PER_DAY_EUR} € pro Miettag mehr, der extra lange Crafter noch
                    einmal rund {L5H2_SURCHARGE_EUR} € mehr – deinen Endpreis siehst du im nächsten
                    Schritt bei der Fahrzeugauswahl.
                  </p>
                )}

                <div className="space-y-4">
                  {availablePlans.map((plan) => {
                const planBlocked = isPlanUnavailable(plan.id);
                // Nur Klassen, für die in genau diesem Zeitraum ein Fahrzeug frei ist
                const planClasses =
                  startHour === null ? [] : classesForWindow(windowFor(plan.id, startHour));
                const planFromPrice = lowestAvailablePlanPrice(plan, planClasses) ?? plan.basePrice;
                return (
                <button
                  key={plan.id}
                  disabled={planBlocked}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all ${
                    selectedPlanId === plan.id
                      ? "border-accent bg-accent/5 shadow-md"
                      : "border-border hover:border-accent/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {planBlocked && availabilityLoading && (
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Verfügbarkeit wird geprüft…
                    </p>
                  )}
                  {planBlocked && !availabilityLoading && (
                    <p className="mb-2 text-xs font-semibold text-destructive">
                      {availabilityError || !vehiclesLoaded
                        ? "Verfügbarkeit konnte nicht geladen werden"
                        : "Für diesen Zeitraum ist kein Transporter verfügbar"}
                    </p>
                  )}
                  {!planBlocked && planClasses.length > 0 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Verfügbar:{" "}
                      {planClasses.map((c) => VEHICLE_CLASS_SHORT_LABEL[c]).join(" · ")}
                    </p>
                  )}

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
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground whitespace-nowrap">
                        {planClasses.length > 1 ? "ab " : ""}{planFromPrice} €
                      </p>
                      {planClasses.length > 1 && (
                        <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {planClasses.includes("l4h2") && `langer Transporter ${plan.priceL4h2} €`}
                          {planClasses.includes("l4h2") && planClasses.includes("l5h2") && " · "}
                          {planClasses.includes("l5h2") && `Crafter ${plan.priceL5h2} €`}
                        </p>
                      )}

                    </div>
                  </div>

                </button>
                );
              })}
              {availabilityLoading && (
                <div className="p-6 rounded-2xl border border-border bg-secondary text-center text-sm text-muted-foreground">
                  Verfügbarkeit wird geprüft…
                </div>
              )}
              {!availabilityLoading && (availabilityError || !vehiclesLoaded) && (
                <div className="p-6 rounded-2xl border border-border bg-secondary text-center text-sm text-muted-foreground">
                  <p className="mb-3 text-foreground">
                    Die Verfügbarkeit konnte gerade nicht geladen werden. Bitte versuche es erneut.
                  </p>
                  <button
                    type="button"
                    onClick={retryAvailability}
                    className="min-h-[44px] px-5 rounded-full bg-foreground text-background text-sm font-medium"
                  >
                    Erneut versuchen
                  </button>
                </div>
              )}
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

            {/* Kraftstoff- & Freikilometer-Hinweis (rein informativ) */}
            {selectedPlanEntry && (
              <FuelInfoNote freeKm={contractKmShown} />
            )}

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
            <section className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0">
              <h3 className="text-lg font-semibold text-foreground">Transporter wählen</h3>
              {pickerVehicles.length > 0 && (
                <div className="mt-3">
                  <VehiclePicker
                    vehicles={pickerVehicles}
                    selectedIndex={vehicleIdx}
                    onSelect={chooseVehicle}
                    statusFor={(pv) => {
                      const v = vehicles.find((x) => x.id === pv.id);
                      if (!v) return undefined;
                      if (!v.is_active) return { label: "nicht verfügbar", dimmed: true };
                      if (!isPlateAvailable(v.plate ?? "")) return { label: "belegt", disabled: true };
                      return { label: "verfügbar" };
                    }}
                  >
                  {currentVehicle && !currentVehicle.is_active && (
                    <div className="mt-4 rounded-xl border border-border bg-secondary p-3 text-sm">
                      <p className="font-semibold text-foreground">Aktuell nicht verfügbar</p>
                      <p className="text-muted-foreground mt-1">
                        Dieser Transporter ist noch nicht freigegeben und kann derzeit nicht gebucht
                        werden.
                      </p>
                    </div>
                  )}
                  {currentVehicleUnavailable && currentVehicle?.is_active && (
                    <div className="mt-4 rounded-xl border border-border bg-secondary p-3 text-sm">
                      <p className="font-semibold text-foreground">
                        {selectionWindow
                          ? `Dieser Transporter ist am ${format(new Date(selectionWindow.start), "dd.MM.yyyy", { locale: de })} von ${format(new Date(selectionWindow.start), "HH:mm")} bis ${format(new Date(selectionWindow.end), "HH:mm")} Uhr nicht verfügbar.`
                          : "In diesem Zeitraum nicht verfügbar"}
                      </p>
                      {(() => {
                        const freeAt = plateFreeAgainAt(currentPlate);
                        return freeAt ? (
                          <p className="text-muted-foreground">
                            Wieder verfügbar ab {format(new Date(freeAt), "dd.MM.yyyy, HH:mm", { locale: de })} Uhr
                          </p>
                        ) : null;
                      })()}
                      <p className="text-muted-foreground mt-1">
                        Bitte ein anderes Fahrzeug wählen oder eine andere Uhrzeit bzw. ein anderes Datum auswählen.
                      </p>
                    </div>
                  )}
                  {selectedPlanEntry && (
                    <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{selectedPlanEntry.shortLabel} · {VEHICLE_CLASS_SHORT_LABEL[vehicleClass]}</span>
                        <span className="font-semibold text-foreground whitespace-nowrap" data-testid="plan-rent-line">{fmtEur(rentWithKmEur)} € Miete{kmPackageEur > 0 ? " inkl. Kilometerpaket" : ""}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contractKmShown.toLocaleString("de-DE")} km inklusive · Mehrkilometer bei Rückgabe {(contractRateCents / 100).toFixed(2).replace(".", ",")} €/km · Kaution {DEPOSIT} € separat
                      </p>
                    </div>
                  )}
                  </VehiclePicker>
                </div>
              )}
            </section>

            {/* Optionale Zusatzpakete */}
            <div className="mt-12">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                  Pakete
                </h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
                  Damit dein Umzug einfacher, sicherer und stressfreier wird – optional zubuchbar.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 max-w-3xl mx-auto">
                {ADDONS.map((addon) => {
                  const chosen = selectedAddonIds.find((x) => addonBaseId(x) === addon.id);
                  const sel = chosen ? resolveAddonSelection(chosen) : null;
                  return (
                    <AddonPackageCard
                      key={addon.id}
                      addon={addon}
                      selected={!!chosen}
                      hours={sel?.hours ?? undefined}
                      onToggle={toggleAddon}
                      onHoursChange={changeAddonSelection}
                    />
                  );
                })}
              </div>

              <p className="mt-6 text-xs text-muted-foreground text-center">{ADDON_NOTE}</p>
              <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-4">
                <p className="text-xs text-foreground text-center">{ADDON_TRUST}</p>
              </div>
              <CustomKmCard
                enabled={customKmEnabled}
                onEnabledChange={(v) => setCustomKmEnabled(v)}
                value={customKmInput}
                onValueChange={setCustomKmInput}
                error={customKmError}
                quote={customKmQuote}
                includedKm={selectedPlanEntry?.freeKm ?? null}
                includedRateCents={selectedPlanEntry?.extraKmCents ?? null}
                addonsCents={Math.round(addonsTotal * 100)}
                depositEur={DEPOSIT}
              />
            </div>

            {/* Summary */}
            {total !== null && (
              <div className="mt-6 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Gesamt</p>
                  <p className="text-3xl font-bold">{fmtEur(total)} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  {selectedPlanEntry &&
                    `${selectedPlanEntry.price} € Miete${
                      kmPackageEur > 0 ? ` + ${fmtEur(kmPackageEur)} € Kilometerpaket` : ""
                    }${
                      addonsTotal > 0 ? ` + ${addonsTotal} € Zubehör` : ""
                    } + ${DEPOSIT} € Kaution (separat, wird erstattet)`}
                </p>
                {selectedPlanEntry && (
                  <p className="text-xs opacity-80 mt-1">
                    {displayVehicle.name} · {displayVehicle.plate} · {contractKmShown.toLocaleString("de-DE")} km inklusive, danach {(contractRateCents / 100).toFixed(2).replace(".", ",")} €/km bei Rückgabe
                  </p>
                )}
                {isSpeedLimited(currentVehicle) && (
                  <p className="text-xs mt-2 font-medium">{SPEED_LIMIT_TEXT}</p>
                )}
                {selectedPlanEntry && selectedPlanEntry.vehicleClass === "l4h2" && (
                  <p className="text-xs opacity-80 mt-2">
                    Endpreis für den langen Transporter mit Hochdach (+{L4H2_SURCHARGE_PER_DAY_EUR} €
                    pro Miettag). Kurzer Transporter: {selectedPlanEntry.basePrice} € Miete.
                  </p>
                )}
                {selectedPlanEntry && selectedPlanEntry.vehicleClass === "l5h2" && (
                  <p className="text-xs opacity-80 mt-2">
                    Endpreis für den extra langen Crafter. Kurzer Transporter:{" "}
                    {selectedPlanEntry.basePrice} € · langer Transporter{" "}
                    {selectedPlanEntry.priceL4h2} € Miete.
                  </p>
                )}

              </div>
            )}

            {availabilityLoading && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Verfügbarkeit wird geprüft…
              </p>
            )}
            {!availabilityLoading && (availabilityError || !vehiclesLoaded) && (
              <div className="mt-6 rounded-xl border border-border bg-secondary p-4 text-center text-sm text-muted-foreground">
                <p className="mb-3 text-foreground">
                  Die Verfügbarkeit konnte gerade nicht geladen werden. Bitte versuche es erneut.
                </p>
                <button
                  type="button"
                  onClick={retryAvailability}
                  className="min-h-[44px] px-5 rounded-full bg-foreground text-background text-sm font-medium"
                >
                  Erneut versuchen
                </button>
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
                onClick={() => setStep(registrationComplete && docsReady ? 5 : 3)}
                disabled={!canProceedStep2 || !!customKmError}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Buchen & bezahlen <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Verifizierung — Ausweis & Führerschein scannen (auch ohne Konto) */}
        {step === 3 && (
          <div className="mt-12 max-w-lg mx-auto animate-fade-in-up">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground">Verifizierung</h3>
              <p className="mt-2 text-muted-foreground">
                Vier Fotos: Ausweis vorne und hinten, Führerschein vorne und hinten. Jedes Feld
                kannst du jederzeit antippen und neu aufnehmen.
              </p>
            </div>

            <div className="mt-8">{renderDocFields()}</div>


            {!authUser?.id && (
              <div className="mt-6 rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                {pendingVolatile
                  ? "Deine Aufnahmen liegen nur in diesem Browser-Fenster – bitte schließe die Buchung jetzt hier ab, dann werden sie nach der Registrierung automatisch deinem Konto zugeordnet."
                  : "Deine Aufnahmen bleiben auf diesem Gerät gespeichert und werden direkt nach der Registrierung automatisch deinem Konto zugeordnet."}
              </div>
            )}


            <div className="mt-8 flex justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
              <button
                disabled={!docsReady}
                onClick={() => setStep(registrationComplete ? 5 : 4)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Weiter <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Registration / Login */}
        {step === 4 && (
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
                        <label className="text-sm font-medium text-foreground">Geburtsdatum</label>
                        <input
                          type="date"
                          value={regForm.birthDate}
                          onChange={(e) => setRegForm({ ...regForm, birthDate: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mindestalter für eine Buchung: {MIN_DRIVER_AGE} Jahre.
                        </p>
                      </div>
                      <AddressFields
                        idPrefix="booking-reg"
                        value={regAddress}
                        onChange={setRegAddress}
                        inputClassName="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
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

                    <div className="mt-8 rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
                      Deine gescannten Dokumente sind schon hinterlegt. Nach dem Registrieren bist du
                      sofort eingeloggt und wirst direkt zur Zahlung weitergeleitet.
                    </div>

                    {authError && (
                      <p className="mt-4 text-sm text-destructive text-center">{authError}</p>
                    )}
                    <button
                      disabled={!regForm.firstName || !regForm.lastName || !regForm.email || !regForm.phone || !regForm.birthDate || !regPassword || !regPasswordConfirm || authLoading || (regForm.accountType === "business" && !regForm.companyName)}
                      onClick={handleSignUp}
                      className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {authLoading ? "Konto wird erstellt..." : "Registrieren & weiter zur Zahlung"}
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
                    <div className="mt-3 text-right">
                      <ForgotPassword initialEmail={loginForm.email} />
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
                  onClick={() => setStep(5)}
                  className="mt-8 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
                >
                  Weiter zur Zahlung <ChevronRight className="w-5 h-5 inline" />
                </button>
              </>
            )}

            {pendingUploading && (
              <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm text-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Deine Dokumente werden übertragen…
              </div>
            )}
            {pendingUploadError && (
              <div className="mt-6 rounded-2xl border border-border bg-secondary p-4 text-sm text-center space-y-3">
                <p className="text-destructive">{pendingUploadError}</p>
                <button
                  type="button"
                  onClick={() => authUser?.id && flushPendingDocuments(authUser.id)}
                  className="rounded-full bg-accent px-6 py-2.5 text-accent-foreground font-medium"
                >
                  Erneut versuchen
                </button>
              </div>
            )}

            <div className="mt-6 flex justify-start">
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Payment */}
        {step === 5 && (
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
              <div className="mt-6 text-left">{renderDocFields()}</div>

            )}

            {verified && total !== null && (
              <div className="mt-8 p-6 rounded-2xl bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <p className="text-lg">Zu zahlen</p>
                  <p className="text-3xl font-bold">{fmtEur(total)} €</p>
                </div>
                <p className="text-sm opacity-80 mt-1">
                  {selectedPlanEntry &&
                    `${selectedPlanEntry.price} € Miete${
                      kmPackageEur > 0 ? ` + ${fmtEur(kmPackageEur)} € Kilometerpaket (${contractKmShown.toLocaleString("de-DE")} km gesamt)` : ""
                    }${
                      addonsTotal > 0 ? ` + ${addonsTotal} € Zubehör` : ""
                    } + ${DEPOSIT} € Kaution`}
                </p>
                <p className="text-xs opacity-80 mt-1">
                  {displayVehicle.name} · {displayVehicle.plate}
                </p>
                {isSpeedLimited(currentVehicle) && (
                  <p className="text-xs mt-2 font-medium">{SPEED_LIMIT_TEXT}</p>
                )}
              </div>
            )}

            {verified && !showCheckout && !paid && planKey && (
              <>
                <label className="mt-8 flex items-start gap-3 text-left rounded-2xl border border-border bg-secondary p-4 cursor-pointer">
                  <Checkbox
                    checked={liabilityAccepted}
                    onCheckedChange={(v) => setLiabilityAccepted(v === true)}
                    className="mt-1"
                  />
                  <span className="text-sm text-foreground">
                  <span className="font-bold block mb-1">Versicherung / Haftung erklärt und verstanden</span>
                    <span className="text-muted-foreground">
                      Im Schadenfall trägt der Mieter bis zu 1.000,00 Euro maximale Selbstbeteiligung. Ist der Schaden geringer, trägt er nur diesen Schaden. Notwendige, tatsächlich angefallene Nebenkosten, z. B. Gutachterkosten, Abschleppkosten, Bergungskosten, Standkosten oder behördliche Gebühren, kommen zusätzlich hinzu.
                    </span>
                  </span>
                </label>
              <FuelInfoNote freeKm={selectedPlanEntry ? contractKmShown : undefined} className="mt-4" />

              {/* Gutscheincode (z. B. Geburtstagsvorteil) – Prüfung erfolgt serverseitig */}
              <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                <label htmlFor="coupon-code" className="text-sm font-medium text-foreground">
                  Gutscheincode
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="coupon-code"
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponInfo(null);
                    }}
                    placeholder="z. B. MTBDAY-XXXXXXXX"
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="button"
                    disabled={!couponCode.trim() || couponChecking}
                    onClick={async () => {
                      setCouponChecking(true);
                      try {
                        const res = await checkCouponCode({ data: { couponCode } });
                        setCouponInfo(res);
                      } catch {
                        setCouponInfo({ valid: false, reason: "Prüfung nicht möglich. Bitte erneut versuchen." });
                      } finally {
                        setCouponChecking(false);
                      }
                    }}
                    className="rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-40"
                  >
                    {couponChecking ? "Prüfen…" : "Prüfen"}
                  </button>
                </div>
                {couponInfo && (
                  <p className={`mt-2 text-sm ${couponInfo.valid ? "text-foreground" : "text-destructive"}`}>
                    {couponInfo.valid
                      ? `${couponInfo.discountPercent} % Rabatt auf den Mietpreis werden beim Bezahlen abgezogen.`
                      : couponInfo.reason}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Der Rabatt gilt nur auf den Mietpreis, nicht auf Kaution oder Zusatzleistungen.
                  Nicht mit anderen Rabatten kombinierbar.
                </p>
              </div>

              {customKmError && (
                <p className="mt-4 text-sm font-medium text-foreground" role="alert">Kilometerpaket: {customKmError}</p>
              )}
              <button
                disabled={!liabilityAccepted || !!customKmError}
                onClick={async () => {
                  // Zahlung gestartet: Entwurf verwerfen (kein späteres Reaktivieren eines kostenpflichtigen Pakets)
                  try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); } catch { /* ignorieren */ }
                  // Pending Booking für /checkout/return persistieren
                  if (typeof window !== "undefined" && date && startHour !== null && selectedPlanEntry) {
                    localStorage.setItem(
                      "mt_pending_booking",
                      JSON.stringify({
                        planId: selectedPlanEntry.id,
                        planLabel: planLabelWithClass(selectedPlanEntry),
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
                     // Anmeldung muss aktiv sein, sonst antwortet der Server mit
                     // "Unauthorized" – direkt nach der Registrierung kann die
                     // Sitzung noch einen Moment brauchen.
                     let token = await getSupabaseAccessToken();
                     if (!token) {
                       await new Promise((r) => setTimeout(r, 1200));
                       token = await getSupabaseAccessToken();
                     }
                     if (!token) {
                       throw new Error(
                         "Deine Anmeldung wird noch abgeschlossen. Bitte tippe in wenigen Sekunden erneut auf „Sicher bezahlen“."
                       );
                     }
                     const origin = publicOrigin();
                     const result = await startBookingCheckout({
                       data: {
                         plan: planKey,
                          customerEmail: regForm.email || authUser?.email || undefined,
                          userId: authUser?.id,
                         returnUrl: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                         environment: getStripeEnvironment(),
                          addonIds: selectedAddonIds,
                          vehiclePlate: displayVehicle.plate || null,
                          vehicleName: displayVehicle.name || null,
                          vehicleClass,
                          startDate: date ? format(date, "yyyy-MM-dd") : undefined,
                          startHour: startHour ?? undefined,
                          couponCode: couponInfo?.valid ? couponCode.trim() : undefined,
                          kmCatalog: KM_CATALOG_VERSION,
                          customKm: customKmQuote && customKmQuote.surchargeCents > 0 ? customKmQuote.desiredKm : null,
                       },
                     });
                      if ("error" in result) throw new Error(result.error);
                      setCheckoutClientSecret(result.clientSecret);
                      // Checkout wurde erfolgreich gestartet, Zahlung noch NICHT final
                      // → InitiateCheckout (kein Purchase). Wert ohne Kaution.
                      trackEvent({
                        name: "checkout_start",
                        valueEur: selectedPlanEntry ? rentWithKmEur + addonsTotal : 0,
                        planId: selectedPlanId ?? "",
                      });
                   } catch (e) {
                     console.error(e);
                     const raw = e instanceof Error ? e.message : "";
                     const friendly = /unauthorized|401/i.test(raw)
                       ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an und starte die Zahlung neu."
                       : /internal server error|unexpected|500/i.test(raw) || !raw
                         ? "Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut."
                         : raw;
                     setCheckoutError(friendly);
                      setCheckoutClientSecret(null);
                   }
                }}
                className="mt-4 w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
              >
                Sicher bezahlen
              </button>
              </>
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
                  onClick={() => { setShowCheckout(false); setCheckoutError(null); setCheckoutClientSecret(null); setStep(3); }}
                  className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 text-foreground font-medium transition-all hover:bg-secondary/80"
                >
                  <ChevronLeft className="w-5 h-5" /> Zurück
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Gute Fahrt */}
        {step === 6 && (
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
                  <p className="mt-1">Bei Fragen: info@mytransporter.org</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}