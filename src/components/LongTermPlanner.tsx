import { useEffect, useMemo, useState } from "react";
import { Mail, CalendarDays, Clock, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RollingNumber } from "@/components/RollingNumber";
import { VehiclePicker, type PickerVehicle } from "@/components/VehiclePicker";
import { VEHICLE_CLASS_SHORT_LABEL, vehicleClassFromName, type VehicleClass } from "@/lib/booking-rules";
import { formatEur, LONG_TERM_MAX_KM } from "@/lib/long-term";
import { quoteRental, type RentalQuote } from "@/lib/rental-quote";
import { isSpeedLimited, SPEED_LIMIT_TEXT } from "@/lib/vehicle-facts";

type LtVehicle = PickerVehicle & { brand: string | null; model: string | null; vehicle_class: string | null };

const FIELDS =
  "id, name, plate, brand, model, vehicle_class, fuel_type, power_kw, seats, max_weight_kg, payload_kg, trailer_load_braked_kg, length_cm, width_cm, height_cm, cargo_length_cm, cargo_width_cm, cargo_height_cm, cargo_volume_m3, pickup_location, pickup_address, photo_urls, tank_liters, range_km, first_registration, cargo_width_between_arches_cm, rear_door_width_cm, rear_door_height_cm, side_door_width_cm, side_door_height_cm, specs_status, specs_source";

function classOf(v: { vehicle_class: string | null; name: string; model: string | null }): VehicleClass {
  return vehicleClassFromName(v.vehicle_class, v.name, v.model);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
const km = (n: number) => `${n.toLocaleString("de-DE")} km`;

/** Mailtext der unverbindlichen Anfrage – enthält alle Posten des Rechners. */
export function buildRequestMail(
  v: { name: string; plate: string },
  vClass: VehicleClass,
  q: Extract<RentalQuote, { ok: true }>,
  t: { startDate: string; startTime: string; endDate: string; endTime: string },
  speedLimited = false,
): string {
  const lines = [
    "Hallo MyTransporter-Team,",
    "",
    `ich möchte unverbindlich folgende ${q.kind === "long_term" ? "Langzeitmiete" : "Miete"} anfragen:`,
    "",
    `Fahrzeug: ${v.name} (${VEHICLE_CLASS_SHORT_LABEL[vClass]}, ${v.plate})`,
    ...(speedLimited ? [SPEED_LIMIT_TEXT] : []),
    `Abholung: ${fmtDate(t.startDate)}, ${t.startTime} Uhr`,
    `Rückgabe: ${fmtDate(t.endDate)}, ${t.endTime} Uhr`,
    `Miettage: ${q.days}`,
    `Tarif: ${q.planLabel}`,
    `Wunschkilometer: ${km(q.desiredKm)}`,
    `Grundpreis: ${formatEur(q.basePriceEur)} € (inkl. ${km(q.includedKm)})`,
    ...(q.extraKm > 0
      ? [q.kind === "long_term"
          ? `Zusätzliches km-Kontingent: ${km(q.extraKm)} = ${formatEur(q.extraKmCostEur)} €`
          : `Voraussichtliche Mehrkilometer: ${km(q.extraKm)} × ${formatEur(q.extraKmRateEur ?? 0)} € = ${formatEur(q.extraKmCostEur)} €`]
      : []),
    ...(q.creditEur > 0 ? [`Gutschrift weniger km: − ${formatEur(q.creditEur)} €`] : []),
    `Richtpreis Miete: ${formatEur(q.totalEur)} €`,
    `Kaution (separat, nicht im Mietpreis): ${formatEur(q.depositEur)} €`,
    `Mehrkilometer bei Rückgabe über ${km(q.contractKm)}: ${formatEur(q.returnExtraKmEur)} € je km`,
    "",
    "Mir ist bewusst, dass dies eine unverbindliche Anfrage ist.",
    "",
    "Name:",
    "Telefon:",
    "",
    "Viele Grüße",
  ];
  return lines.join("\n");
}

export function LongTermPlanner() {
  const [vehicles, setVehicles] = useState<LtVehicle[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [idx, setIdx] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(addDaysIso(today, 1));
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(addDaysIso(today, 31));
  const [endTime, setEndTime] = useState("09:00");
  const [kmInput, setKmInput] = useState(2500);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("vehicles")
      .select(FIELDS)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setLoadError(true);
        else
          setVehicles(
            (data as unknown as Omit<LtVehicle, "classLabel">[]).map((x) => ({
              ...x,
              classLabel: VEHICLE_CLASS_SHORT_LABEL[classOf(x)],
            })),
          );
      });
    return () => {
      alive = false;
    };
  }, []);

  const v = vehicles[idx];
  const vClass: VehicleClass | null = v ? classOf(v) : null;
  const times = { startDate, startTime, endDate, endTime };
  const quote = useMemo<RentalQuote | null>(
    () => (vClass ? quoteRental({ startDate, startTime, endDate, endTime, desiredKm: kmInput }, vClass) : null),
    [vClass, startDate, startTime, endDate, endTime, kmInput],
  );

  const mailHref = useMemo(() => {
    if (!v || !vClass || !quote?.ok) return undefined;
    const subject = `Anfrage für ${quote.kind === "long_term" ? "Langzeitmiete" : "Miete"} – ${v.name} (${v.plate})`;
    const body = buildRequestMail(v, vClass, quote, times, isSpeedLimited(v));
    return `mailto:info@mytransporter.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, vClass, quote, startDate, startTime, endDate, endTime]);

  const inp =
    "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground";

  return (
    <div className="mt-10 space-y-6 min-w-0">
      <section className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0">
        <h2 className="text-lg font-semibold text-foreground">1. Transporter wählen</h2>
        {loadError && <p className="mt-2 text-sm text-muted-foreground">Fahrzeuge konnten nicht geladen werden. Bitte Seite neu laden.</p>}
        {!loadError && vehicles.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Fahrzeuge werden geladen …</p>}
        {vehicles.length > 0 && (
          <div className="mt-3">
            <VehiclePicker vehicles={vehicles} selectedIndex={idx} onSelect={setIdx} />
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr] min-w-0">
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-lg font-semibold text-foreground">2. Zeitraum und Kilometer</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Abholung</span>
              <input type="date" value={startDate} min={today} onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value && e.target.value > endDate) setEndDate(addDaysIso(e.target.value, 1));
              }} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uhrzeit</span>
              <input type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Rückgabe</span>
              <input type="date" value={endDate} min={startDate || today} onChange={(e) => setEndDate(e.target.value)} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uhrzeit</span>
              <input type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inp} />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Wunschkilometer</span>
            <input type="number" inputMode="numeric" min={0} max={LONG_TERM_MAX_KM} step={100} value={kmInput}
              onChange={(e) => {
                const n = Number(e.target.value);
                setKmInput(Number.isFinite(n) ? Math.max(0, Math.min(LONG_TERM_MAX_KM, Math.round(n))) : 0);
              }} className={inp} />
            <input type="range" min={0} max={15000} step={100} value={Math.min(15000, kmInput)}
              onChange={(e) => setKmInput(Number(e.target.value))} className="mt-3 w-full accent-foreground" aria-label="Wunschkilometer" />
          </label>
        </div>

        <div className="rounded-3xl border border-border bg-gradient-to-b from-secondary/70 to-card p-4 sm:p-6 shadow-sm min-w-0" aria-live="polite">
          {!v || !vClass ? (
            <div className="flex h-full flex-col justify-center text-center">
              <p className="text-sm text-muted-foreground">Preis erscheint, sobald ein Transporter geladen ist.</p>
            </div>
          ) : quote?.ok ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dein Richtpreis · {quote.days} {quote.days === 1 ? "Tag" : "Tage"} · {VEHICLE_CLASS_SHORT_LABEL[vClass]} · {v.plate}
              </p>
              <div className="mt-1 text-4xl sm:text-5xl font-bold text-foreground">
                <RollingNumber value={formatEur(quote.totalEur)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Mietpreis · entspricht {formatEur(quote.pricePerDayEur)} € pro Tag</p>
              <dl className="mt-5 space-y-2 text-sm">
                <Row l={quote.kind === "long_term" ? "Langzeit-Grundpreis" : `Tarif: ${quote.planLabel}`} r={`${formatEur(quote.basePriceEur)} €`} />
                <Row l={`Inklusive ${km(quote.includedKm)}`} r="" />
                {quote.extraKm > 0 && (
                  <Row
                    l={quote.kind === "long_term"
                      ? `+ ${km(quote.extraKm)} Zusatz-Kontingent (Staffel)`
                      : `+ ${km(quote.extraKm)} voraussichtl. Mehr-km × ${formatEur(quote.extraKmRateEur ?? 0)} €`}
                    r={`${formatEur(quote.extraKmCostEur)} €`}
                  />
                )}
                {quote.creditEur > 0 && <Row l="Gutschrift weniger km" r={`− ${formatEur(quote.creditEur)} €`} />}
                <Row l="Mietpreis gesamt" r={`${formatEur(quote.totalEur)} €`} />
                <Row l="Kaution (separat)" r={`${formatEur(quote.depositEur)} €`} />
                <Row l={`Mehrkilometer bei Rückgabe über ${km(quote.contractKm)}`} r={`${formatEur(quote.returnExtraKmEur)} €/km`} />
              </dl>
              {isSpeedLimited(v) && <p className="mt-3 text-xs text-foreground">{SPEED_LIMIT_TEXT}</p>}
              <a href={mailHref} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90">
                <Mail className="h-4 w-4" /> Anfragen
              </a>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {quote.kind === "standard" ? "Standardtarif ohne Langzeitrabatt. " : ""}Unverbindlicher Richtpreis, verbindlich erst nach Bestätigung.
              </p>
            </>
          ) : (
            <div className="flex h-full flex-col justify-center text-center">
              <p className="text-lg font-semibold text-foreground">Bitte Eingaben prüfen</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {quote?.reason === "invalid_km" ? "Bitte gültige Kilometer eingeben." : "Bitte wähle eine Rückgabe nach der Abholung."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{l}</dt>
      <dd className="text-foreground whitespace-nowrap">{r}</dd>
    </div>
  );
}
