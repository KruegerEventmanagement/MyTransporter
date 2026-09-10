import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { Addon } from "@/lib/addons";
import { makeAddonSelectionId } from "@/lib/addons";

type Props = {
  addon: Addon;
  selected?: boolean;
  /** Aktuell gewählte Stunden (bei Stundenpaketen) */
  hours?: number;
  onToggle?: (selectionId: string) => void;
  onHoursChange?: (selectionId: string) => void;
  /** Wenn true: keine Auswahl-Buttons (Marketing-Modus) */
  marketing?: boolean;
};

export function AddonPackageCard({
  addon,
  selected = false,
  hours,
  onToggle,
  onHoursChange,
  marketing = false,
}: Props) {
  const min = addon.hourly?.minHours ?? 1;
  const max = addon.hourly?.maxHours ?? 1;
  const [localHours, setLocalHours] = useState(hours ?? min);
  const currentHours = hours ?? localHours;

  const setHours = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    setLocalHours(clamped);
    if (selected) onHoursChange?.(makeAddonSelectionId(addon, clamped));
  };

  const totalEur = addon.hourly ? addon.priceEur * currentHours : addon.priceEur;

  return (
    <div
      className={`relative rounded-2xl border-2 bg-card p-6 transition-all ${
        selected ? "border-accent shadow-md" : "border-border"
      }`}
    >
      <span className="absolute -top-3 left-6 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full bg-foreground text-background font-semibold">
        {addon.badge}
      </span>

      <div className="flex items-start justify-between gap-4 mt-2">
        <h3 className="text-xl font-bold text-foreground">{addon.name}</h3>
        <p className="text-2xl font-bold text-foreground whitespace-nowrap">
          {addon.priceEur} €
        </p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {addon.hourly ? `pro Stunde · mindestens ${min} Stunden` : "pro Buchung"}
      </p>

      <ul className="space-y-2 mb-4">
        {addon.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground mb-4">{addon.description}</p>

      {addon.hourly && !marketing && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Stunden</p>
            <p className="font-medium text-foreground">
              {currentHours} Std. · {totalEur} €
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Eine Stunde weniger"
              onClick={() => setHours(currentHours - 1)}
              disabled={currentHours <= min}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Eine Stunde mehr"
              onClick={() => setHours(currentHours + 1)}
              disabled={currentHours >= max}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!marketing && (
        <button
          type="button"
          onClick={() => onToggle?.(makeAddonSelectionId(addon, currentHours))}
          className={`w-full rounded-full py-3 font-medium transition-all ${
            selected
              ? "bg-secondary text-foreground hover:bg-secondary/80"
              : "bg-accent text-accent-foreground hover:scale-[1.01] hover:shadow-lg"
          }`}
        >
          {selected ? "Hinzugefügt – entfernen" : "Paket hinzufügen"}
        </button>
      )}
    </div>
  );
}
