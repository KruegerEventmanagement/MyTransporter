import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Mail, CalendarDays, Clock, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RollingNumber } from "@/components/RollingNumber";
import { VEHICLE_CLASS_SHORT_LABEL, vehicleClassFromName, type VehicleClass } from "@/lib/booking-rules";
import { formatEur, quoteLongTermWithKm, rentalDaysFromDateTimes, LONG_TERM_MIN_DAYS } from "@/lib/long-term";
import jumperImg from "@/assets/citroen-jumper-l1h1.jpg";
import ducatoImg from "@/assets/fiat-ducato.jpg";
import heroImg from "@/assets/hero-van.jpg";

type LtVehicle = {
  id: string;
  name: string;
  plate: string;
  brand: string | null;
  model: string | null;
  vehicle_class: string | null;
  fuel_type: string | null;
  power_kw: number | null;
  seats: number | null;
  max_weight_kg: number | null;
  payload_kg: number | null;
  trailer_load_braked_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
  cargo_volume_m3: number | null;
  pickup_location: string | null;
  photo_urls: string[];
  tank_liters: number | null;
  range_km: number | null;
};

const FIELDS =
  "id, name, plate, brand, model, vehicle_class, fuel_type, power_kw, seats, max_weight_kg, payload_kg, trailer_load_braked_kg, length_cm, width_cm, height_cm, cargo_length_cm, cargo_width_cm, cargo_height_cm, cargo_volume_m3, pickup_location, photo_urls, tank_liters, range_km";

function classOf(v: LtVehicle): VehicleClass {
  return vehicleClassFromName(v.vehicle_class, v.name, v.model);
}

/** Richtwerte, falls im Admin nichts eingetragen ist. */
function tankGuess(v: LtVehicle): { liters: number; range: string } {
  const s = `${v.brand ?? ""} ${v.model ?? ""} ${v.name}`.toLowerCase();
  if (s.includes("crafter")) return { liters: 75, range: "800–900" };
  return { liters: 90, range: "900–1.000" };
}

function fallbackImages(v: LtVehicle): string[] {
  const s = `${v.brand ?? ""} ${v.name}`.toLowerCase();
  if (s.includes("jumper") || s.includes("citro")) return [jumperImg];
  if (s.includes("ducato") || s.includes("fiat")) return [ducatoImg];
  return [heroImg];
}

const images = (v: LtVehicle) => (v.photo_urls?.length ? v.photo_urls : fallbackImages(v));
const cm = (n: number | null) => (n ? `${(n / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} m` : null);

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function LongTermPlanner() {
  const [vehicles, setVehicles] = useState<LtVehicle[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [img, setImg] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(addDaysIso(today, 1));
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(addDaysIso(today, 31));
  const [endTime, setEndTime] = useState("09:00");
  const [km, setKm] = useState(2500);
  const touchX = useRef<number | null>(null);

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
        else setVehicles(data as unknown as LtVehicle[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const v = vehicles[idx];
  const imgs = v ? images(v) : [];
  const vClass: VehicleClass = v ? classOf(v) : "l1h1";
  const days = rentalDaysFromDateTimes(startDate, startTime, endDate, endTime);
  const quote = useMemo(() => quoteLongTermWithKm(days, vClass, km), [days, vClass, km]);

  const selectVehicle = (i: number) => {
    setIdx(i);
    setImg(0);
  };
  const stepImg = (d: number) => imgs.length && setImg((i) => (i + d + imgs.length) % imgs.length);

  const mailHref = useMemo(() => {
    if (!v || !quote.eligible) return undefined;
    const subject = `Anfrage für Langzeitmiete – ${v.name}`;
    const body = [
      "Hallo MyTransporter-Team,",
      "",
      "ich möchte folgende Langzeitmiete anfragen:",
      "",
      `Fahrzeug: ${v.name} (${VEHICLE_CLASS_SHORT_LABEL[vClass]}, ${v.plate})`,
      `Abholung: ${fmtDate(startDate)}, ${startTime} Uhr`,
      `Rückgabe: ${fmtDate(endDate)}, ${endTime} Uhr`,
      `Miettage: ${quote.days}`,
      `Wunschkilometer: ${quote.desiredKm.toLocaleString("de-DE")} km`,
      `Berechneter Richtpreis: ${formatEur(quote.totalEur)} € (zzgl. ${formatEur(quote.depositEur)} € Kaution)`,
      "",
      "Name:",
      "Telefon:",
      "",
      "Viele Grüße",
    ].join("\n");
    return `mailto:info@mytransporter.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [v, vClass, quote, startDate, startTime, endDate, endTime]);

  const specs: Array<[string, string | null]> = v
    ? [
        ["Ladefläche", v.cargo_length_cm && v.cargo_width_cm ? `${cm(v.cargo_length_cm)} × ${cm(v.cargo_width_cm)}` : null],
        ["Ladehöhe", cm(v.cargo_height_cm)],
        ["Ladevolumen", v.cargo_volume_m3 ? `${Number(v.cargo_volume_m3).toLocaleString("de-DE")} m³` : null],
        ["Außenmaße (L × B × H)", v.length_cm && v.width_cm && v.height_cm ? `${cm(v.length_cm)} × ${cm(v.width_cm)} × ${cm(v.height_cm)}` : null],
        ["Nutzlast", v.payload_kg ? `${v.payload_kg.toLocaleString("de-DE")} kg` : null],
        ["Zul. Gesamtgewicht", v.max_weight_kg ? `${v.max_weight_kg.toLocaleString("de-DE")} kg` : null],
        ["Tankgröße", `ca. ${v.tank_liters ?? tankGuess(v).liters} l`],
        ["Reichweite", `ca. ${v.range_km ? v.range_km.toLocaleString("de-DE") : tankGuess(v).range} km`],
        ["Kraftstoff", v.fuel_type],
        ["Leistung", v.power_kw ? `${v.power_kw} kW (${Math.round(v.power_kw * 1.36)} PS)` : null],
        ["Sitzplätze", v.seats ? String(v.seats) : null],
        ["Anhängelast", v.trailer_load_braked_kg ? `${v.trailer_load_braked_kg.toLocaleString("de-DE")} kg` : null],
        ["Abholort", v.pickup_location],
      ]
    : [];

  const inp =
    "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground";

  return (
    <div className="mt-10 space-y-6 min-w-0">
      {/* Fahrzeugauswahl */}
      <section className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0">
        <h2 className="text-lg font-semibold text-foreground">1. Transporter wählen</h2>
        {loadError && <p className="mt-2 text-sm text-muted-foreground">Fahrzeuge konnten nicht geladen werden. Bitte Seite neu laden.</p>}
        {!loadError && vehicles.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Fahrzeuge werden geladen …</p>}

        {vehicles.length > 0 && v && (
          <>
            <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2">
              {vehicles.map((veh, i) => (
                <button
                  key={veh.id}
                  type="button"
                  onClick={() => selectVehicle(i)}
                  aria-label={`${veh.name} auswählen`}
                  aria-pressed={i === idx}
                  className={`aspect-square overflow-hidden rounded-xl border-2 p-1 transition ${
                    i === idx ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <img src={images(veh)[0]} alt="" className={`h-full w-full rounded-lg object-cover ${i === idx ? "opacity-60 grayscale" : ""}`} />
                </button>
              ))}
            </div>

            <div
              className="relative mt-4 overflow-hidden rounded-2xl bg-muted"
              onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
              onTouchEnd={(e) => {
                const start = touchX.current;
                const endX = e.changedTouches[0]?.clientX;
                touchX.current = null;
                if (start == null || endX == null) return;
                if (Math.abs(endX - start) > 40) stepImg(endX < start ? 1 : -1);
              }}
            >
              <img src={imgs[img]} alt={`${v.name} Bild ${img + 1}`} className="aspect-[4/3] w-full object-cover" draggable={false} />
              {imgs.length > 1 && (
                <>
                  <button type="button" aria-label="Vorheriges Bild" onClick={() => stepImg(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" aria-label="Nächstes Bild" onClick={() => stepImg(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                    {imgs.map((_, i) => (
                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === img ? "bg-foreground" : "bg-background/80"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 text-center">
              <p className="font-semibold text-foreground">{v.name}</p>
              <p className="text-xs text-muted-foreground">{VEHICLE_CLASS_SHORT_LABEL[vClass]}</p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {specs.filter(([, val]) => val).map(([label, val]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground break-words">{val}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">Tankgröße und Reichweite sind ungefähre Richtwerte.</p>

            {vehicles.length > 1 && (
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => selectVehicle((idx + 1) % vehicles.length)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted">
                  Nächster Transporter <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Rechner */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1fr] min-w-0">
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-lg font-semibold text-foreground">2. Zeitraum und Kilometer</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Abholung</span>
              <input type="date" value={startDate} min={today} onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value && e.target.value >= endDate) setEndDate(addDaysIso(e.target.value, LONG_TERM_MIN_DAYS));
              }} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uhrzeit</span>
              <input type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Rückgabe</span>
              <input type="date" value={endDate} min={addDaysIso(startDate || today, 1)} onChange={(e) => setEndDate(e.target.value)} className={inp} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Uhrzeit</span>
              <input type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inp} />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Wunschkilometer</span>
            <input type="number" inputMode="numeric" min={0} max={30000} step={100} value={km}
              onChange={(e) => setKm(Math.max(0, Math.min(30000, Number(e.target.value) || 0)))} className={inp} />
            <input type="range" min={500} max={15000} step={100} value={Math.min(15000, Math.max(500, km))}
              onChange={(e) => setKm(Number(e.target.value))} className="mt-3 w-full accent-foreground" aria-label="Wunschkilometer" />
          </label>
        </div>

        <div className="rounded-3xl border border-border bg-gradient-to-b from-secondary/70 to-card p-4 sm:p-6 shadow-sm min-w-0">
          {quote.eligible ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dein Richtpreis · {quote.days} Tage · {v ? VEHICLE_CLASS_SHORT_LABEL[vClass] : ""}
              </p>
              <div className="mt-1 text-4xl sm:text-5xl font-bold text-foreground">
                <RollingNumber value={formatEur(quote.totalEur)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">entspricht {formatEur(quote.effectivePricePerDayEur)} € pro Tag</p>
              <dl className="mt-5 space-y-2 text-sm">
                <Row l="Grundpreis" r={`${formatEur(quote.basePriceEur)} €`} />
                <Row l={`Inklusive ${quote.includedKm.toLocaleString("de-DE")} km`} r="" />
                {quote.extraKm > 0 && <Row l={`+ ${quote.extraKm.toLocaleString("de-DE")} Zusatz-km`} r={`${formatEur(quote.extraKmCostEur)} €`} />}
                {quote.creditEur > 0 && <Row l="Gutschrift weniger km" r={`− ${formatEur(quote.creditEur)} €`} />}
                <Row l="Jeder weitere km" r={`${formatEur(quote.nextKmEur)} €`} />
                <Row l="Kaution (separat)" r={`${formatEur(quote.depositEur)} €`} />
              </dl>
              <a href={mailHref} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90">
                <Mail className="h-4 w-4" /> Anfragen
              </a>
              <p className="mt-3 text-[11px] text-muted-foreground">Unverbindlicher Richtpreis, verbindlich erst nach Bestätigung.</p>
            </>
          ) : (
            <div className="flex h-full flex-col justify-center text-center">
              <p className="text-lg font-semibold text-foreground">Langzeitmiete ab {LONG_TERM_MIN_DAYS} Tagen</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {quote.reason === "invalid_range" ? "Bitte wähle eine Rückgabe nach der Abholung." : `Dein Zeitraum umfasst ${quote.days} Tage.`}
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
