import { Check } from "lucide-react";
import type { Addon } from "@/lib/addons";

type Props = {
  addon: Addon;
  selected?: boolean;
  onToggle?: (id: string) => void;
  /** Wenn true: keine Auswahl-Buttons (Marketing-Modus) */
  marketing?: boolean;
};

export function AddonPackageCard({ addon, selected = false, onToggle, marketing = false }: Props) {
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
        <p className="text-2xl font-bold text-foreground whitespace-nowrap">{addon.priceEur} €</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">pro Buchung</p>

      <ul className="space-y-2 mb-4">
        {addon.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground mb-4">{addon.description}</p>

      {!marketing && (
        <button
          type="button"
          onClick={() => onToggle?.(addon.id)}
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
