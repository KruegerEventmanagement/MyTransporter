import { Check } from "lucide-react";
import { PARTNER_PACKAGES, formatEuro, type PartnerPackageId } from "@/lib/partner-packages";

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

export function PartnerPackages({ highlight, onSelect }: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
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
              <h3 className="text-base font-semibold text-foreground">{pkg.name}</h3>
              <span className="text-xs text-muted-foreground">{pkg.sizeLabel}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{pkg.description}</p>

            <div className="mt-4 space-y-1.5">
              {pkg.prices.map((p) => (
                <div
                  key={p.years}
                  className="flex items-center justify-between text-sm border-t border-border/60 pt-1.5"
                >
                  <span className="text-muted-foreground">
                    {p.years} {p.years === 1 ? "Jahr" : "Jahre"}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatEuro(p.total)}
                    <span className="text-xs text-muted-foreground font-normal">
                      {" "}· {formatEuro(p.perYear)}/Jahr
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5" />
              Einmalige Bearbeitungsgebühr Magnetfolie: <strong className="text-foreground">{formatEuro(pkg.setupFee)}</strong>
            </div>
          </button>
        );
      })}
    </div>
  );
}