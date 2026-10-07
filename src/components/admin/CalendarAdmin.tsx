import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  listManualReservations,
  upsertManualReservation,
  deleteManualReservation,
  listManualReservationDocuments,
  addManualReservationDocument,
  deleteManualReservationDocument,
  listManualNotificationStates,
  sendManualReservationConfirmation,
  listCustomerMailStates,
  type CustomerMailState,
  type ManualReservation,
  type ManualNotificationState,
} from "@/lib/manual-reservations.functions";
import { bookingWindowMs } from "@/lib/booking-window";
import { berlinInputFromDate, berlinInputToDate } from "@/lib/berlin-input";
import { centsToInput, formatCents, parseEuroToCents } from "@/lib/money-input";
import { isValidCustomerEmail } from "@/lib/manual-confirmation";
import type { ConfirmationOutcome } from "@/lib/manual-confirmation.server";
import { ageOnIsoDate, isValidIsoDate, todayIsoBerlin } from "@/lib/age";
import { getCalendarSyncStatus, type CalendarSyncStatus } from "@/lib/calendar-status.functions";
import { calendarStatusView } from "@/lib/calendar-status";
import { CalendarEntryDetailsPanel } from "@/components/admin/CalendarEntryDetails";
import { fmtBerlinDateTime, overlapsBerlinDay } from "@/lib/calendar-details";

function CalendarSyncBanner() {
  const fetchStatus = useServerFn(getCalendarSyncStatus);
  const [s, setS] = useState<CalendarSyncStatus | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetchStatus()
      .then(setS)
      .catch(() => setErr(true));
  }, [fetchStatus]);
  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "noch nie";
  if (err) {
    return (
      <div role="alert" className="rounded-2xl border-2 border-foreground p-3 text-sm">
        Google-Kalender-Status konnte nicht geladen werden.
      </div>
    );
  }
  if (!s) return <div className="rounded-2xl bg-secondary p-3 text-sm">Google-Kalender-Status wird geladen …</div>;
  const v = calendarStatusView(s);
  return (
    <div
      role={v.tone === "ok" ? "status" : "alert"}
      className={`rounded-2xl p-3 text-sm ${v.tone === "ok" ? "bg-secondary" : "border-2 border-foreground"}`}
    >
      <p className="font-semibold">{v.headline}</p>
      {v.hint && <p className="mt-1">{v.hint}</p>}
      <p className="mt-1">
        Letzte gespeicherte Übertragung: {fmt(s.lastSuccessAt)} (kein Nachweis einer heute gültigen Verbindung)
      </p>
      {s.lastErrorClass && <p className="mt-1">Letzter Fehler: {s.lastErrorClass}</p>}
    </div>
  );
}


const DOC_KINDS = [
  { value: "id_front", label: "Personalausweis · Vorderseite" },
  { value: "id_back", label: "Personalausweis · Rückseite" },
  { value: "license_front", label: "Führerschein · Vorderseite" },
  { value: "license_back", label: "Führerschein · Rückseite" },
  { value: "other", label: "Sonstiges Dokument" },
] as const;

type DocKind = (typeof DOC_KINDS)[number]["value"];

function docLabel(type: string): string {
  return DOC_KINDS.find((d) => d.value === type)?.label ?? "Dokument";
}

interface StoredDoc {
  id: string;
  doc_type: string;
  original_name: string | null;
  signedUrl: string | null;
}

interface PendingDoc {
  key: string;
  docType: DocKind;
  file: File;
}

function fmtBirth(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function birthLabel(iso: string | null | undefined): string | null {
  if (!iso || !isValidIsoDate(iso)) return null;
  const age = ageOnIsoDate(iso, todayIsoBerlin());
  return age === null ? fmtBirth(iso) : `${fmtBirth(iso)} · ${age} Jahre`;
}

interface VehicleOption {
  id: string;
  name: string;
  plate: string;
}

interface BookingSlot {
  id: string;
  vehiclePlate: string;
  vehicleName: string;
  label: string;
  start: Date;
  end: Date;
  customerHint: string;
  customerName: string | null;
}

type Entry =
  | { kind: "booking"; id: string; start: Date; end: Date; booking: BookingSlot }
  | { kind: "manual"; id: string; start: Date; end: Date; manual: ManualReservation };

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Gespeicherter Zeitpunkt → Berliner Eingabewerte (Browser-Zeitzone egal). */
function toLocalInput(d: Date): { date: string; time: string } {
  return berlinInputFromDate(d);
}

/** Eingabe immer als Europe/Berlin; ungültige/mehrdeutige Zeiten → Invalid Date. */
function fromLocalInput(date: string, time: string): Date {
  const r = berlinInputToDate(date, time);
  return r.ok ? r.date : new Date(NaN);
}

/** Immer Europe/Berlin, unabhängig von der Zeitzone des Browsers. */
function fmtDateTime(d: Date): string {
  return fmtBerlinDateTime(d);
}

function sameDay(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

function overlapsDay(entry: Entry, day: Date): boolean {
  // Kalenderzelle = Berliner Kalendertag, damit Zuordnung und Anzeige übereinstimmen.
  return overlapsBerlinDay(
    entry.start.getTime(),
    entry.end.getTime(),
    day.getFullYear(),
    day.getMonth() + 1,
    day.getDate(),
  );
}

interface FormState {
  id?: string;
  /** Stabil je Anlage-Vorgang, auch über Wiederholungen. */
  createRequestId?: string;
  vehicleKey: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerBirthDate: string;
  customerStreet: string;
  customerCity: string;
  customerIdNumber: string;
  customerLicenseNumber: string;
  note: string;
  reminderEnabled: boolean;
  notifyCustomer: boolean;
  price: string;
  /** Hatte der Termin bereits einen Preis? (dann Pflicht beim Bearbeiten) */
  hadPrice: boolean;
  sendConfirmation: boolean;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function emptyForm(day: Date): FormState {
  // Kalenderzelle = Berliner Kalendertag; Uhrzeiten sind Berliner Wanduhrzeit.
  const s = { date: ymd(day), time: "09:00" };
  const e = { date: ymd(day), time: "18:00" };
  return {
    createRequestId: newRequestId(),
    vehicleKey: "",
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerBirthDate: "",
    customerStreet: "",
    customerCity: "",
    customerIdNumber: "",
    customerLicenseNumber: "",
    note: "",
    reminderEnabled: true,
    notifyCustomer: true,
    price: "",
    hadPrice: false,
    sendConfirmation: true,
  };
}

/**
 * Zustand der Owner-Benachrichtigung in Klartext. Eine gesendete E-Mail ist
 * KEIN Beweis für einen Kalendereintrag – der entsteht erst im Postfach.
 */
function notifyLabel(state?: ManualNotificationState): string {
  if (!state) return "Keine automatische Benachrichtigung erfasst";
  if (state.status === "succeeded")
    return "E-Mail an info@mytransporter.org gesendet (Kalender folgt im Postfach)";
  if (state.status === "failed")
    return `Benachrichtigung fehlgeschlagen – Wiederholung geplant (Versuch ${state.attempts})`;
  return "Benachrichtigung ausstehend";
}

/** Kunden-Bestätigung – getrennt von der Owner-Mail. „Versendet“ heißt: vom Anbieter angenommen, nicht zugestellt. */
function customerMailLabel(m: ManualReservation, st?: CustomerMailState): string {
  if (!st)
    return m.total_price_cents == null
      ? "Kundenbestätigung: noch kein Preis hinterlegt"
      : m.confirmation_requested
        ? "Buchung gespeichert – Bestätigung angefordert, noch nicht versendet"
        : "Kundenbestätigung: nicht angefordert";
  const old = st.revision !== m.revision ? " (ältere Fassung)" : "";
  if (st.status === "sent") return `Kundenbestätigung versendet${old} – vom Mailanbieter angenommen`;
  if (st.status === "processing")
    return leaseExpired(st)
      ? `Kundenbestätigung unklar – Prüfung nötig${old} (Versuch abgebrochen, evtl. angekommen)`
      : "Kundenbestätigung wird gerade versendet …";
  if (st.status === "failed")
    return `Buchung gespeichert – Bestätigung nicht versendet${old}: ${mailErrorText(st.error_kind)}${st.ambiguous ? " (Annahme unklar)" : ""}`;
  return "Kundenbestätigung ausstehend";
}

function leaseExpired(st: CustomerMailState): boolean {
  return st.status === "processing" && (!st.lease_until || Date.parse(st.lease_until) < Date.now());
}

/** Button adressiert immer die angezeigte (aktuelle) Fassung – nie eine andere. */
function canSendConfirmation(m: ManualReservation, st?: CustomerMailState): boolean {
  if (m.total_price_cents == null || !m.customer_email) return false;
  if (st && st.revision === m.revision) {
    return st.status === "failed" || st.status === "pending" || leaseExpired(st);
  }
  // Aktuelle Fassung ohne Versandeintrag: nur wenn beim Speichern angefordert.
  return m.confirmation_requested;
}

function mailErrorText(kind: string | null): string {
  switch (kind) {
    case "invalid_key":
      return "Mail-Zugang ungültig (Schlüssel ersetzen)";
    case "missing_key":
      return "Mail-Zugang fehlt";
    case "restricted_key":
      return "Mail-Schlüssel ohne Senderecht";
    case "sender_domain":
      return "Absender-Domain nicht freigegeben";
    case "timeout":
      return "Zeitüberschreitung";
    case "transient":
    case "network":
      return "vorübergehende Störung";
    default:
      return "Versandfehler";
  }
}

/** Heutiger Berliner Kalendertag als Zellen-Datum (unabhängig von der Browser-Zeitzone). */
function berlinToday(): Date {
  const [y, m, d] = todayIsoBerlin().split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function CalendarAdmin() {
  const [month, setMonth] = useState(() => {
    const now = berlinToday();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => berlinToday());
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [bookingSlots, setBookingSlots] = useState<BookingSlot[]>([]);
  const [manuals, setManuals] = useState<ManualReservation[]>([]);
  const [notifyStates, setNotifyStates] = useState<Record<string, ManualNotificationState>>({});
  const [customerMail, setCustomerMail] = useState<Record<string, CustomerMailState>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [namesError, setNamesError] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [storedDocs, setStoredDocs] = useState<StoredDoc[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [nextDocKind, setNextDocKind] = useState<DocKind>("id_front");

  const fetchManual = useServerFn(listManualReservations);
  const fetchNotifyStates = useServerFn(listManualNotificationStates);
  const saveManual = useServerFn(upsertManualReservation);
  const sendConfirmation = useServerFn(sendManualReservationConfirmation);
  const fetchCustomerMail = useServerFn(listCustomerMailStates);
  const removeManual = useServerFn(deleteManualReservation);
  const fetchDocs = useServerFn(listManualReservationDocuments);
  const addDoc = useServerFn(addManualReservationDocument);
  const removeDoc = useServerFn(deleteManualReservationDocument);

  const loadDocs = async (reservationId: string) => {
    try {
      const rows = await fetchDocs({ data: { reservationId } });
      setStoredDocs(
        rows.map((r) => ({
          id: r.id,
          doc_type: r.doc_type,
          original_name: r.original_name,
          signedUrl: r.signedUrl,
        })),
      );
    } catch {
      setStoredDocs([]);
    }
  };

  /** Lädt vorgemerkte Dateien in den geschützten Speicher und verknüpft sie mit dem Termin. */
  const uploadPendingDocs = async (reservationId: string) => {
    if (pendingDocs.length === 0) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Sitzung abgelaufen – bitte neu anmelden.");

    for (const doc of pendingDocs) {
      const ext = doc.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${uid}/manual/${reservationId}/${doc.docType}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("user-documents")
        .upload(path, doc.file, { contentType: doc.file.type || undefined, upsert: false });
      if (error) throw new Error(`Datei „${doc.file.name}" konnte nicht gespeichert werden`);
      await addDoc({
        data: {
          reservationId,
          docType: doc.docType,
          filePath: path,
          originalName: doc.file.name.slice(0, 200),
        },
      });
    }
    setPendingDocs([]);
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await removeDoc({ data: { id } });
      setStoredDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dokument gelöscht");
    } catch {
      toast.error("Dokument konnte nicht gelöscht werden");
    }
  };

  const rangeFrom = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() - 1, 1),
    [month],
  );
  const rangeTo = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 2, 1),
    [month],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: vehicleRows }, { data: bookingRows }, manualRows] = await Promise.all([
        supabase.from("vehicles").select("id, name, plate").eq("is_active", true).order("name"),
        supabase
          .from("bookings")
          .select("id, user_id, vehicle_name, vehicle_plate, plan_id, plan_label, start_date, start_hour, status")
          .in("status", ["paid", "active", "returning", "in_progress", "picked_up"]),
        fetchManual({ data: { fromIso: rangeFrom.toISOString(), toIso: rangeTo.toISOString() } }),
      ]);

      setVehicles((vehicleRows ?? []) as VehicleOption[]);
      setManuals(manualRows);

      // Zustand der Owner-Benachrichtigung (ausstehend / gesendet / Fehler)
      try {
        const ids = manualRows.map((m) => m.id);
        const states =
          ids.length > 0 ? await fetchNotifyStates({ data: { reservationIds: ids } }) : [];
        const latest: Record<string, ManualNotificationState> = {};
        for (const st of states) {
          if (!latest[st.reservation_id]) latest[st.reservation_id] = st;
        }
        setNotifyStates(latest);
      } catch {
        setNotifyStates({});
      }
      try {
        const ids = manualRows.map((m) => m.id);
        const rows = ids.length > 0 ? await fetchCustomerMail({ data: { reservationIds: ids } }) : [];
        const latest: Record<string, CustomerMailState> = {};
        for (const st of rows) if (!latest[st.reservation_id]) latest[st.reservation_id] = st;
        setCustomerMail(latest);
      } catch {
        setCustomerMail({});
      }

      // Kundenname nur über die gespeicherte user_id (Admin-RLS), kein Namensabgleich.
      const userIds = [...new Set((bookingRows ?? []).map((b) => b.user_id).filter(Boolean))];
      const names: Record<string, string> = {};
      if (userIds.length === 0) setNamesError(false);
      if (userIds.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        setNamesError(!!profErr);
        for (const p of profs ?? []) {
          const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          if (n) names[p.id] = n;
        }
      }

      const slots: BookingSlot[] = (bookingRows ?? [])
        .filter((b) => b.start_date && b.start_hour !== null)
        .map((b) => {
          // Gleiche zentrale Regel wie öffentliche Auswahl und Datenbank
          const w = bookingWindowMs(b.plan_id, b.start_date as string, b.start_hour as number);
          const start = new Date(w.start);
          const end = new Date(w.end);
          return {
            id: b.id,
            vehiclePlate: b.vehicle_plate ?? "",
            vehicleName: b.vehicle_name ?? "",
            label: b.plan_label ?? "Buchung",
            start,
            end,
            customerHint: b.status,
            customerName: names[b.user_id] ?? null,
          };
        });
      setBookingSlots(slots);
    } catch (e) {
      toast.error("Kalender konnte nicht geladen werden", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const entries: Entry[] = useMemo(
    () => [
      ...bookingSlots.map<Entry>((b) => ({ kind: "booking", id: b.id, start: b.start, end: b.end, booking: b })),
      ...manuals.map<Entry>((m) => ({
        kind: "manual",
        id: m.id,
        start: new Date(m.start_at),
        end: new Date(m.end_at),
        manual: m,
      })),
    ],
    [bookingSlots, manuals],
  );

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Montag = 0
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from({ length: offset }, () => null);
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), i));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => overlapsDay(e, selectedDay))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [entries, selectedDay],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return entries
      .filter((e) => e.end.getTime() >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 8);
  }, [entries]);

  const conflictWarning = useMemo(() => {
    if (!form) return null;
    const vehicle = vehicles.find((v) => v.id === form.vehicleKey);
    if (!vehicle) return null;
    const start = fromLocalInput(form.startDate, form.startTime);
    const end = fromLocalInput(form.endDate, form.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    const clash = entries.find((e) => {
      if (e.kind === "manual" && e.id === form.id) return false;
      const plate = e.kind === "booking" ? e.booking.vehiclePlate : e.manual.vehicle_plate;
      if (plate !== vehicle.plate) return false;
      return e.start < end && e.end > start;
    });
    if (!clash) return null;
    return `${vehicle.plate} ist in diesem Zeitraum bereits belegt (${fmtDateTime(clash.start)} – ${fmtDateTime(clash.end)}).`;
  }, [form, vehicles, entries]);

  const openCreate = () => {
    setFormError(null);
    setStoredDocs([]);
    setPendingDocs([]);
    setForm(emptyForm(selectedDay));
  };

  const openEdit = (m: ManualReservation) => {
    // Detailansicht schließen: Bearbeiten/Dokumentlöschen kann sie sofort veralten lassen.
    setExpandedKey(null);
    const s = toLocalInput(new Date(m.start_at));
    const e = toLocalInput(new Date(m.end_at));
    const vehicle = vehicles.find((v) => v.plate === m.vehicle_plate);
    setFormError(null);
    setPendingDocs([]);
    setStoredDocs([]);
    setForm({
      id: m.id,
      vehicleKey: vehicle?.id ?? "",
      startDate: s.date,
      startTime: s.time,
      endDate: e.date,
      endTime: e.time,
      customerName: m.customer_name,
      customerPhone: m.customer_phone ?? "",
      customerEmail: m.customer_email ?? "",
      customerBirthDate: m.customer_birth_date ?? "",
      customerStreet: m.customer_street ?? "",
      customerCity: m.customer_city ?? "",
      customerIdNumber: m.customer_id_number ?? "",
      customerLicenseNumber: m.customer_license_number ?? "",
      note: m.note ?? "",
      reminderEnabled: m.reminder_enabled,
      notifyCustomer: m.notify_customer,
      price: centsToInput(m.total_price_cents),
      hadPrice: m.total_price_cents != null,
      sendConfirmation: false,
    });
    void loadDocs(m.id);
  };

  const fail = (msg: string) => {
    setFormError(msg);
    toast.error(msg);
  };

  const handleSave = async () => {
    if (!form) return;
    setFormError(null);
    const vehicle = vehicles.find((v) => v.id === form.vehicleKey);
    if (!vehicle) {
      fail("Bitte ein Fahrzeug auswählen");
      return;
    }
    if (!form.customerName.trim()) {
      fail("Bitte einen Namen eintragen");
      return;
    }
    const sp = berlinInputToDate(form.startDate, form.startTime);
    const ep = berlinInputToDate(form.endDate, form.endTime);
    if (!sp.ok) {
      fail(`Von: ${sp.error}`);
      return;
    }
    if (!ep.ok) {
      fail(`Bis: ${ep.error}`);
      return;
    }
    const start = sp.date;
    const end = ep.date;
    if (end <= start) {
      fail("Das Ende muss nach dem Start liegen");
      return;
    }
    const email = form.customerEmail.trim();
    if ((form.notifyCustomer || form.sendConfirmation) && !email) {
      fail("Für Bestätigung/Erinnerung an den Kunden wird eine E-Mail-Adresse benötigt");
      return;
    }
    if (email && !isValidCustomerEmail(email)) {
      fail("Bitte eine gültige E-Mail-Adresse eingeben");
      return;
    }
    let totalPriceCents: number | null = null;
    if (form.price.trim() || !form.id || form.hadPrice || form.sendConfirmation) {
      const parsed = parseEuroToCents(form.price);
      if (!parsed.ok) {
        fail(parsed.error);
        return;
      }
      totalPriceCents = parsed.cents;
    }
    const birth = form.customerBirthDate.trim();
    if (birth) {
      if (!isValidIsoDate(birth)) {
        fail("Bitte ein gültiges Geburtsdatum eingeben");
        return;
      }
      if (birth > todayIsoBerlin()) {
        fail("Das Geburtsdatum darf nicht in der Zukunft liegen");
        return;
      }
    }

    setSaving(true);
    try {
      const result = await saveManual({
        data: {
          id: form.id,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
          vehicleName: vehicle.name,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim() || null,
          customerEmail: form.customerEmail.trim() || null,
          customerBirthDate: birth || null,
          customerStreet: form.customerStreet.trim() || null,
          customerCity: form.customerCity.trim() || null,
          customerIdNumber: form.customerIdNumber.trim() || null,
          customerLicenseNumber: form.customerLicenseNumber.trim() || null,
          note: form.note.trim() || null,
          reminderEnabled: form.reminderEnabled,
          notifyCustomer: form.notifyCustomer,
          totalPriceCents,
          sendConfirmation: form.sendConfirmation,
          createRequestId: form.id ? undefined : form.createRequestId,
        },
      });
      const saved = result.reservation;

      let docWarning: string | null = null;
      try {
        await uploadPendingDocs(saved.id);
      } catch (docErr) {
        docWarning = docErr instanceof Error ? docErr.message : "Dateien nicht gespeichert";
      }

      toast.success(
        result.deduplicated ? "Termin war bereits gespeichert" : form.id ? "Termin aktualisiert" : "Termin eingetragen",
        {
          description: docWarning
            ? `${vehicle.plate} ist blockiert – aber: ${docWarning}`
            : `${vehicle.plate} ist im Zeitraum jetzt blockiert.`,
        },
      );
      // Der Versand lief bereits serverseitig im Speichern – hier nur Status anzeigen.
      if (result.confirmation) showConfirmationOutcome(result.confirmation);
      setForm(null);
      setStoredDocs([]);
      setPendingDocs([]);
      setSelectedDay(start);
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = /unauthorized|forbidden/i.test(raw)
        ? "Speichern nicht erlaubt – bitte neu als Admin anmelden."
        : `Speichern fehlgeschlagen: ${raw}`;
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const showConfirmationOutcome = (res: ConfirmationOutcome) => {
      if (res.status === "sent") {
        toast.success(res.already ? "Bestätigung war bereits versendet" : "Bestätigung an den Kunden versendet", {
          description: "Vom Mailanbieter angenommen – Zustellung wird nicht garantiert.",
        });
      } else if (res.status === "blocked") {
        toast.error("Buchung gespeichert – Bestätigung nicht versendet", { description: res.reason });
      } else if (res.status === "in_progress") {
        toast.message("Bestätigung wird bereits versendet");
      } else if (res.status === "accepted_unrecorded") {
        toast.warning("Bestätigung vom Mailanbieter angenommen", {
          description: "Status konnte nicht gespeichert werden – bitte nicht erneut senden, sondern im Postfach prüfen.",
        });
      } else if (res.status === "needs_review") {
        toast.error("Bestätigung unklar – Prüfung nötig", {
          description: "Früherer Versuch ist älter als 23 Stunden und evtl. angekommen. Bitte prüfen statt neu senden.",
        });
      } else {
        toast.error("Buchung gespeichert – Bestätigung nicht versendet", {
          description: `${mailErrorText(res.kind)}${res.ambiguous ? " (Annahme unklar)" : ""}`,
        });
      }
  };

  const triggerConfirmation = async (m: ManualReservation, revision: number) => {
    if (sendingId) return; // Doppelklick-Schutz (Server ist zusätzlich idempotent)
    setSendingId(m.id);
    try {
      showConfirmationOutcome(await sendConfirmation({ data: { id: m.id, revision } }));
    } catch (e) {
      toast.error("Buchung gespeichert – Bestätigung nicht versendet", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSendingId(null);
      await load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Diesen Termin wirklich löschen? Das Fahrzeug wird dann wieder freigegeben.")) return;
    try {
      await removeManual({ data: { id } });
      toast.success("Termin gelöscht");
      setForm(null);
      await load();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", { description: String(e) });
    }
  };

  return (
    <div className="space-y-6">
      <CalendarSyncBanner />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="font-semibold min-w-[10rem] text-center">
            {month.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </p>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={openCreate}
          className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Termin eintragen
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const dayList = entries.filter((e) => overlapsDay(e, day));
            const manualCount = dayList.filter((e) => e.kind === "manual").length;
            const bookingCount = dayList.length - manualCount;
            const isSelected = sameDay(day, selectedDay);
            const isToday = sameDay(day, berlinToday());
            return (
              <button
                key={ymd(day)}
                onClick={() => setSelectedDay(day)}
                className={`aspect-square rounded-xl border p-1 flex flex-col items-center justify-start text-xs transition-colors ${
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border hover:bg-secondary/60"
                }`}
              >
                <span className={`font-semibold ${isToday && !isSelected ? "underline" : ""}`}>
                  {day.getDate()}
                </span>
                <span className="flex gap-0.5 mt-1 flex-wrap justify-center">
                  {Array.from({ length: Math.min(bookingCount, 3) }).map((_, k) => (
                    <span
                      key={`b${k}`}
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-background" : "bg-foreground"}`}
                    />
                  ))}
                  {Array.from({ length: Math.min(manualCount, 3) }).map((_, k) => (
                    <span
                      key={`m${k}`}
                      className={`w-1.5 h-1.5 rounded-full border ${
                        isSelected ? "border-background" : "border-foreground"
                      }`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground" /> Online-Buchung
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full border border-foreground" /> Manueller Termin
          </span>
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" />
          {selectedDay.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
        </h2>
        {loading && <p className="text-sm text-muted-foreground py-4">Lade…</p>}
        {!loading && dayEntries.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Keine Belegung an diesem Tag.</p>
        )}
        <ul className="space-y-2">
          {dayEntries.map((e) => {
            const key = `${e.kind}-${e.id}`;
            const open = expandedKey === key;
            const name = e.kind === "manual" ? e.manual.customer_name : e.booking.customerName;
            return (
              <li key={key} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {e.kind === "booking"
                        ? `${e.booking.vehicleName} · ${e.booking.vehiclePlate}`
                        : `${e.manual.vehicle_name || "Transporter"} · ${e.manual.vehicle_plate}`}
                    </p>
                    <p className="text-sm break-words">
                      {name ||
                        (e.kind === "booking" && namesError
                          ? "Namen konnten nicht geladen werden"
                          : "Kundenname nicht hinterlegt")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.kind === "booking" ? `Online-Buchung · ${e.booking.label}` : "Manueller Termin"}
                    </p>
                    <p className="text-xs mt-1">Von: {fmtDateTime(e.start)}</p>
                    <p className="text-xs">Bis: {fmtDateTime(e.end)}</p>
                    {e.kind === "manual" && (
                      <>
                        <p className="text-xs mt-1">
                          Gesamtmietpreis:{" "}
                          {e.manual.total_price_cents == null
                            ? "nicht hinterlegt"
                            : formatCents(e.manual.total_price_cents)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Betreiber: {notifyLabel(notifyStates[e.manual.id])}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {customerMailLabel(e.manual, customerMail[e.manual.id])}
                        </p>
                        {canSendConfirmation(e.manual, customerMail[e.manual.id]) ? (
                          <button
                            type="button"
                            disabled={sendingId === e.manual.id}
                            onClick={() => triggerConfirmation(e.manual, e.manual.revision)}
                            className="mt-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium disabled:opacity-50"
                          >
                            {sendingId === e.manual.id ? "Sende …" : "Bestätigung erneut versuchen / senden"}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  {e.kind === "manual" ? (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(e.manual)}
                        className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium flex items-center gap-1 justify-center"
                      >
                        <Trash2 className="w-3 h-3" /> Löschen
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                      Buchung
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`details-${key}`}
                  onClick={() => setExpandedKey(open ? null : key)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
                >
                  {open ? "Details schließen" : "Buchungsdetails anzeigen"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div id={`details-${key}`} className="mt-3 border-t border-border pt-3">
                    <CalendarEntryDetailsPanel key={key} kind={e.kind} id={e.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Nächste Termine
        </h2>
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li
              key={`up-${e.kind}-${e.id}`}
              className="text-sm rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between gap-3"
            >
              <span className="min-w-0 break-words">
                Von: {fmtDateTime(e.start)} · Bis: {fmtDateTime(e.end)} ·{" "}
                {e.kind === "manual"
                  ? `${e.manual.vehicle_plate} · ${e.manual.customer_name}`
                  : `${e.booking.vehiclePlate} · ${e.booking.customerName ?? (namesError ? "Namen konnten nicht geladen werden" : "Online-Buchung")}`}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                {e.kind === "manual" ? "Manuell" : "Buchung"}
              </span>
            </li>
          ))}
          {upcoming.length === 0 && !loading && (
            <li className="text-sm text-muted-foreground">Keine kommenden Termine.</li>
          )}
        </ul>
      </section>

      {form && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {form.id ? "Termin bearbeiten" : "Manuellen Termin eintragen"}
              </h3>
              <button
                onClick={() => setForm(null)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Transporter</label>
              <select
                value={form.vehicleKey}
                onChange={(ev) => setForm({ ...form, vehicleKey: ev.target.value })}
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              >
                <option value="">Bitte wählen…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Von (Datum)</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(ev) => setForm({ ...form, startDate: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Von (Uhrzeit)</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(ev) => setForm({ ...form, startTime: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Bis (Datum)</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(ev) => setForm({ ...form, endDate: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Bis (Uhrzeit)</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(ev) => setForm({ ...form, endTime: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={form.customerName}
                maxLength={120}
                onChange={(ev) => setForm({ ...form, customerName: ev.target.value })}
                placeholder="Vor- und Nachname"
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="manual-price" className="text-xs font-medium text-muted-foreground">
                Gesamtmietpreis in EUR{!form.id || form.hadPrice ? " (Pflicht)" : " (noch nicht hinterlegt)"}
              </label>
              <input
                id="manual-price"
                inputMode="decimal"
                value={form.price}
                maxLength={14}
                onChange={(ev) => setForm({ ...form, price: ev.target.value })}
                placeholder="z. B. 129,00"
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                Nur die Vereinbarung – es wird keine Zahlung, Rechnung oder „bezahlt“-Markierung ausgelöst.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Telefon</label>
                <input
                  value={form.customerPhone}
                  maxLength={40}
                  onChange={(ev) => setForm({ ...form, customerPhone: ev.target.value })}
                  placeholder="+49 …"
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  maxLength={255}
                  onChange={(ev) => setForm({ ...form, customerEmail: ev.target.value })}
                  placeholder="name@example.de"
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Geburtsdatum (optional)
                </label>
                <input
                  type="date"
                  value={form.customerBirthDate}
                  max={todayIsoBerlin()}
                  onChange={(ev) => setForm({ ...form, customerBirthDate: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
                {birthLabel(form.customerBirthDate) && (
                  <p className="text-[11px] text-muted-foreground">
                    {birthLabel(form.customerBirthDate)}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Straße (optional)
                </label>
                <input
                  value={form.customerStreet}
                  maxLength={160}
                  onChange={(ev) => setForm({ ...form, customerStreet: ev.target.value })}
                  placeholder="Hauptstraße 20"
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  PLZ / Ort (optional)
                </label>
                <input
                  value={form.customerCity}
                  maxLength={160}
                  onChange={(ev) => setForm({ ...form, customerCity: ev.target.value })}
                  placeholder="71229 Leonberg"
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Ausweisnummer (optional)
                </label>
                <input
                  value={form.customerIdNumber}
                  maxLength={60}
                  onChange={(ev) => setForm({ ...form, customerIdNumber: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Führerscheinnummer (optional)
                </label>
                <input
                  value={form.customerLicenseNumber}
                  maxLength={60}
                  onChange={(ev) => setForm({ ...form, customerLicenseNumber: ev.target.value })}
                  className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Dokumente (optional)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ausweis oder Führerschein fotografieren oder Datei auswählen. Nur für dich
                sichtbar.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={nextDocKind}
                  onChange={(ev) => setNextDocKind(ev.target.value as DocKind)}
                  className="flex-1 rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                >
                  {DOC_KINDS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <label className="rounded-full bg-secondary px-4 py-2.5 text-xs font-medium text-center cursor-pointer">
                  Datei / Foto wählen
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(ev) => {
                      const files = Array.from(ev.target.files ?? []);
                      if (files.length === 0) return;
                      setPendingDocs((prev) => [
                        ...prev,
                        ...files.map((file, i) => ({
                          key: `${Date.now()}-${i}-${file.name}`,
                          docType: nextDocKind,
                          file,
                        })),
                      ]);
                      ev.target.value = "";
                    }}
                  />
                </label>
              </div>

              {pendingDocs.length > 0 && (
                <ul className="space-y-1">
                  {pendingDocs.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center justify-between gap-2 text-xs rounded-xl bg-secondary px-3 py-2"
                    >
                      <span className="truncate">
                        {docLabel(d.docType)} · {d.file.name}
                      </span>
                      <button
                        onClick={() =>
                          setPendingDocs((prev) => prev.filter((p) => p.key !== d.key))
                        }
                        className="shrink-0"
                        aria-label="Datei entfernen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                  <li className="text-[11px] text-muted-foreground">
                    Wird beim Speichern des Termins hochgeladen.
                  </li>
                </ul>
              )}

              {storedDocs.length > 0 && (
                <ul className="space-y-1">
                  {storedDocs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-xs rounded-xl border border-border px-3 py-2"
                    >
                      {d.signedUrl ? (
                        <a
                          href={d.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline"
                        >
                          {docLabel(d.doc_type)}
                          {d.original_name ? ` · ${d.original_name}` : ""}
                        </a>
                      ) : (
                        <span className="truncate">{docLabel(d.doc_type)}</span>
                      )}
                      <button
                        onClick={() => handleDeleteDoc(d.id)}
                        className="shrink-0"
                        aria-label="Dokument löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>



            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notiz (optional)</label>
              <textarea
                value={form.note}
                maxLength={1000}
                rows={2}
                onChange={(ev) => setForm({ ...form, note: ev.target.value })}
                className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.reminderEnabled}
                onChange={(ev) => setForm({ ...form, reminderEnabled: ev.target.checked })}
                className="w-4 h-4 accent-foreground"
              />
              Erinnerung für mich (24 h und 30 min vorher)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notifyCustomer}
                onChange={(ev) => setForm({ ...form, notifyCustomer: ev.target.checked })}
                className="w-4 h-4 accent-foreground"
              />
              Erinnerungs-E-Mail auch an den Kunden senden
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sendConfirmation}
                onChange={(ev) => setForm({ ...form, sendConfirmation: ev.target.checked })}
                className="w-4 h-4 accent-foreground"
              />
              {form.id ? "Aktualisierte Buchungsbestätigung an den Kunden senden" : "Buchungsbestätigung an den Kunden senden"}
            </label>

            {conflictWarning && (
              <p className="text-xs rounded-xl border border-foreground px-3 py-2">{conflictWarning}</p>
            )}

            {formError && (
              <p
                role="alert"
                className="text-xs rounded-xl border border-destructive bg-destructive/10 text-destructive px-3 py-2"
              >
                {formError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-foreground text-background py-3 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Speichern…" : form.sendConfirmation ? "Speichern & Bestätigung senden" : "Termin speichern"}
              </button>
              {form.id && (
                <button
                  onClick={() => handleDelete(form.id!)}
                  className="rounded-full bg-secondary px-4 py-3 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
