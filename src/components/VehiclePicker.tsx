import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Truck } from "lucide-react";
import { isSpeedLimited, SPEED_LIMIT_BADGE, SPEED_LIMIT_TEXT, vehicleSpecNote, vehicleSpecRows, type SpecVehicle } from "@/lib/vehicle-facts";

export type PickerVehicle = SpecVehicle & {
  id: string;
  name: string;
  plate: string;
  photo_urls: string[] | null;
  classLabel: string;
};

export type PickerStatus = { label?: string; disabled?: boolean; dimmed?: boolean };

type Props = {
  vehicles: PickerVehicle[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  statusFor?: (v: PickerVehicle) => PickerStatus | undefined;
  /** Inhalt direkt unter dem Namen (z. B. Verfügbarkeitshinweis). */
  children?: ReactNode;
  showSpecs?: boolean;
};

/** Einheitliche Fahrzeugauswahl: Foto-Kacheln oben, großes Bild mit eigener Bildnavigation. */
export function VehiclePicker({ vehicles, selectedIndex, onSelect, statusFor, children, showSpecs = true }: Props) {
  const v = vehicles[selectedIndex];
  if (!v) return null;
  const pick = (i: number) => {
    const target = vehicles[i];
    if (target && !statusFor?.(target)?.disabled) onSelect(i);
  };
  /** Nächstes/voriges wählbares Fahrzeug. */
  const step = (d: number) => {
    for (let k = 1; k <= vehicles.length; k++) {
      const i = (selectedIndex + d * k + vehicles.length * k) % vehicles.length;
      if (!statusFor?.(vehicles[i]!)?.disabled) return onSelect(i);
    }
  };
  const specs = vehicleSpecRows(v);
  const specNote = vehicleSpecNote(v);
  const limited = isSpeedLimited(v);

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2" role="group" aria-label="Transporter auswählen">
        {vehicles.map((veh, i) => {
          const st = statusFor?.(veh);
          const sel = i === selectedIndex;
          const cover = veh.photo_urls?.[0];
          return (
            <button
              key={veh.id}
              type="button"
              onClick={() => pick(i)}
              disabled={st?.disabled}
              aria-label={`${veh.name}, ${veh.classLabel}, ${veh.plate} auswählen${st?.label ? ` (${st.label})` : ""}`}
              aria-pressed={sel}
              className={`flex min-w-0 flex-col overflow-hidden rounded-xl border-2 p-1 text-left transition ${
                sel ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"
              } ${st?.dimmed || st?.disabled ? "opacity-50" : ""} disabled:cursor-not-allowed`}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {cover ? (
                  <img src={cover} alt="" className={`h-full w-full object-contain ${sel ? "opacity-60 grayscale" : ""}`} loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Truck className="h-6 w-6" /></span>
                )}
              </span>
              <span className="mt-1 block truncate text-[10px] font-semibold leading-tight text-foreground">{veh.classLabel}</span>
              <span className="block break-words font-mono text-[9px] sm:text-[10px] leading-tight text-muted-foreground">{veh.plate}</span>
              {st?.label && <span className="block truncate text-[10px] leading-tight text-muted-foreground">{st.label}</span>}
            </button>
          );
        })}
      </div>

      <VehicleGallery key={v.id} vehicle={v} speedLimited={limited} />

      <div className="mt-3 text-center">
        <p className="font-semibold text-foreground">{v.name}</p>
        <p className="text-xs text-muted-foreground">
          {v.classLabel} · <span className="font-mono">{v.plate}</span>
        </p>
        {limited && <p className="mt-1 text-sm font-medium text-foreground">{SPEED_LIMIT_TEXT}</p>}
      </div>

      {children}

      {showSpecs && specs.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {specs.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className={`break-words ${r.unconfirmed ? "text-muted-foreground italic" : "font-medium text-foreground"}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {showSpecs && specNote && <p className="mt-2 text-[11px] text-muted-foreground">{specNote}</p>}

      {vehicles.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={() => step(-1)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted">
            <ChevronUp className="h-4 w-4" /> Vorheriger Transporter
          </button>
          <button type="button" onClick={() => step(1)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted">
            Nächster Transporter <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Bildergalerie eines Fahrzeugs. Wird per key je Fahrzeug neu gestartet (Bildindex = 0). */
export function VehicleGallery({ vehicle, speedLimited }: { vehicle: PickerVehicle; speedLimited: boolean }) {
  const imgs = (vehicle.photo_urls ?? []).filter(Boolean);
  const [img, setImg] = useState(0);
  const touchX = useRef<number | null>(null);
  const n = imgs.length;
  const stepImg = (d: number) => n > 1 && setImg((i) => (i + d + n) % n);

  return (
    <div className="mt-4">
      <div
        className="relative overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        tabIndex={n > 1 ? 0 : -1}
        role="region"
        aria-roledescription="Bildergalerie"
        aria-label={`Fotos von ${vehicle.name}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); stepImg(-1); }
          if (e.key === "ArrowRight") { e.preventDefault(); stepImg(1); }
        }}
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const endX = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || endX == null) return;
          if (Math.abs(endX - start) > 40) stepImg(endX < start ? 1 : -1);
        }}
      >
        {n > 0 ? (
          <img src={imgs[img]} alt={`${vehicle.name} (${vehicle.plate}), Foto ${img + 1} von ${n}`} className="aspect-[4/3] w-full object-contain" draggable={false} />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Truck className="h-10 w-10" />
            <span className="text-sm">Noch kein Foto vorhanden</span>
          </div>
        )}
        {speedLimited && (
          <span className="absolute right-2 top-2 z-20 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow">
            {SPEED_LIMIT_BADGE}
          </span>
        )}
        {n > 1 && (
          <>
            <button type="button" aria-label="Vorheriges Foto" onClick={() => stepImg(-1)} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" aria-label="Nächstes Foto" onClick={() => stepImg(1)} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 text-foreground shadow">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-2 left-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground" aria-live="polite">
              Foto {img + 1} / {n}
            </span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Foto-Vorschau">
          {imgs.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setImg(i)}
              aria-label={`Foto ${i + 1} anzeigen`}
              aria-current={i === img}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-muted ${i === img ? "border-foreground" : "border-transparent"}`}
            >
              <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
