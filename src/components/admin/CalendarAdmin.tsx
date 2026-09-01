import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  listManualReservations,
  upsertManualReservation,
  deleteManualReservation,
  type ManualReservation,
} from "@/lib/manual-reservations.functions";
import { computePlanReturn } from "@/lib/booking-rules";

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
}

type Entry =
  | { kind: "booking"; id: string; start: Date; end: Date; booking: BookingSlot }
  | { kind: "manual"; id: string; start: Date; end: Date; manual: ManualReservation };

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toLocalInput(d: Date): { date: string; time: string } {
  return {
    date: ymd(d),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

function fromLocalInput(date: string, time: string): Date {
  return new Date(`${date}T${time || "00:00"}:00`);
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function sameDay(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

function overlapsDay(entry: Entry, day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
  return entry.start <= dayEnd && entry.end >= dayStart;
}

interface FormState {
  id?: string;
  vehicleKey: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
  reminderEnabled: boolean;
  notifyCustomer: boolean;
}

function emptyForm(day: Date): FormState {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0);
  const s = toLocalInput(start);
  const e = toLocalInput(end);
  return {
    vehicleKey: "",
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    note: "",
    reminderEnabled: true,
    notifyCustomer: false,
  };
}

export function CalendarAdmin() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [bookingSlots, setBookingSlots] = useState<BookingSlot[]>([]);
  const [manuals, setManuals] = useState<ManualReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchManual = useServerFn(listManualReservations);
  const saveManual = useServerFn(upsertManualReservation);
  const removeManual = useServerFn(deleteManualReservation);

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
          .select("id, vehicle_name, vehicle_plate, plan_id, plan_label, start_date, start_hour, status")
          .in("status", ["paid", "active", "returning", "in_progress", "picked_up"]),
        fetchManual({ data: { fromIso: rangeFrom.toISOString(), toIso: rangeTo.toISOString() } }),
      ]);

      setVehicles((vehicleRows ?? []) as VehicleOption[]);
      setManuals(manualRows);

      const slots: BookingSlot[] = (bookingRows ?? [])
        .filter((b) => b.start_date && b.start_hour !== null)
        .map((b) => {
          const start = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`);
          const end = computePlanReturn(b.plan_id, start, b.start_hour as number);
          return {
            id: b.id,
            vehiclePlate: b.vehicle_plate ?? "",
            vehicleName: b.vehicle_name ?? "",
            label: b.plan_label ?? "Buchung",
            start,
            end,
            customerHint: b.status,
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

  const openCreate = () => setForm(emptyForm(selectedDay));

  const openEdit = (m: ManualReservation) => {
    const s = toLocalInput(new Date(m.start_at));
    const e = toLocalInput(new Date(m.end_at));
    const vehicle = vehicles.find((v) => v.plate === m.vehicle_plate);
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
      note: m.note ?? "",
      reminderEnabled: m.reminder_enabled,
      notifyCustomer: m.notify_customer,
    });
  };

  const handleSave = async () => {
    if (!form) return;
    const vehicle = vehicles.find((v) => v.id === form.vehicleKey);
    if (!vehicle) {
      toast.error("Bitte ein Fahrzeug auswählen");
      return;
    }
    if (!form.customerName.trim()) {
      toast.error("Bitte einen Namen eintragen");
      return;
    }
    const start = fromLocalInput(form.startDate, form.startTime);
    const end = fromLocalInput(form.endDate, form.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error("Bitte Datum und Uhrzeit vollständig angeben");
      return;
    }
    if (end <= start) {
      toast.error("Das Ende muss nach dem Start liegen");
      return;
    }
    if (form.notifyCustomer && !form.customerEmail.trim()) {
      toast.error("Für die Kunden-Erinnerung wird eine E-Mail-Adresse benötigt");
      return;
    }

    setSaving(true);
    try {
      await saveManual({
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
          note: form.note.trim() || null,
          reminderEnabled: form.reminderEnabled,
          notifyCustomer: form.notifyCustomer,
        },
      });
      toast.success(form.id ? "Termin aktualisiert" : "Termin eingetragen", {
        description: `${vehicle.plate} ist im Zeitraum jetzt blockiert.`,
      });
      setForm(null);
      setSelectedDay(start);
      await load();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", { description: String(e) });
    } finally {
      setSaving(false);
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
            const isToday = sameDay(day, new Date());
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
          {dayEntries.map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="rounded-2xl border border-border bg-card p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {fmtTime(e.start)} – {fmtTime(e.end)}
                  {!sameDay(e.start, e.end) && ` (bis ${e.end.toLocaleDateString("de-DE")})`}
                </p>
                {e.kind === "booking" ? (
                  <>
                    <p className="font-semibold truncate">
                      {e.booking.vehicleName} · {e.booking.vehiclePlate}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Online-Buchung · {e.booking.label}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold truncate">
                      {e.manual.vehicle_name || "Transporter"} · {e.manual.vehicle_plate}
                    </p>
                    <p className="text-xs truncate">{e.manual.customer_name}</p>
                    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                      {e.manual.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {e.manual.customer_phone}
                        </span>
                      )}
                      {e.manual.customer_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {e.manual.customer_email}
                        </span>
                      )}
                    </p>
                    {e.manual.note && (
                      <p className="text-xs text-muted-foreground mt-1">{e.manual.note}</p>
                    )}
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
            </li>
          ))}
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
              <span className="truncate">
                {fmtDateTime(e.start)} ·{" "}
                {e.kind === "manual"
                  ? `${e.manual.vehicle_plate} · ${e.manual.customer_name}`
                  : `${e.booking.vehiclePlate} · Online-Buchung`}
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

            {conflictWarning && (
              <p className="text-xs rounded-xl border border-foreground px-3 py-2">{conflictWarning}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-foreground text-background py-3 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Speichern…" : "Termin speichern"}
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
