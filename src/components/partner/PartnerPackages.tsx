import { Check } from "lucide-react";
import { PARTNER_PACKAGES, formatEuro, type PartnerPackageId } from "@/lib/partner-packages";

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

export function PartnerPackages({ highlight, onSelect }: Props) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {PARTNER_PACKAGES.map((pkg) => {
        const isActive = highlight === pkg.id;
        return (
          <button
            key={pkg.id}
            type="button"
            onClick={() => onSelect?.(pkg.id)}
            className={`text-left p-5 rounded-2xl border bg-card transition-all ${
              isActive
                ? "border-foreground shadow-md scale-[1.01]"
                : "border-border hover:border-foreground/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-foreground text-background">
                  {pkg.code}
                </span>
                <h3 className="text-base font-semibold text-foreground">{pkg.name}</h3>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{pkg.sizeLabel}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{pkg.description}</p>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-foreground">{formatEuro(pkg.monthly)}</span>
              <span className="text-xs text-muted-foreground">/ Monat</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {pkg.slots} {pkg.slots === 1 ? "Platz verfügbar" : "Plätze verfügbar"}
            </p>

            <div className="mt-4 space-y-1.5">
              {pkg.prices.map((p) => (
                <div
                  key={p.years}
                  className="flex items-center justify-between text-xs border-t border-border/60 pt-1.5"
                >
                  <span className="text-muted-foreground">
                    {p.years} {p.years === 1 ? "Jahr" : "Jahre"}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatEuro(p.monthly)}<span className="text-muted-foreground font-normal">/Mon.</span>
                    <span className="text-muted-foreground font-normal"> · gesamt {formatEuro(p.total)}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5" />
              Einmalige Druck-/Produktionsgebühr: <strong className="text-foreground">{formatEuro(pkg.setupFee)}</strong>
            </div>
          </button>
        );
      })}
    </div>
  );
}