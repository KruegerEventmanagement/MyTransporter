import { Check } from "lucide-react";
import {
  PACKAGES_BY_VIEW,
  formatEuro,
  formatSqm,
  PROMO_DISCOUNT_PERCENT,
  REGULAR_SETUP_FEE,
  type PartnerPackageId,
} from "@/lib/partner-packages";
import { VIEWS, type ViewId } from "@/lib/partner-zones";

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

export function PartnerPackages({ highlight, onSelect }: Props) {
  const viewOrder: ViewId[] = ["driver", "passenger", "rear", "front"];
  return (
    <div className="space-y-10">
      <p className="text-xs text-muted-foreground -mt-4">
        Alle Preise verstehen sich in Euro <strong>netto, zzgl. 19% gesetzlicher Umsatzsteuer</strong>. Angebote richten sich ausschließlich an Unternehmen (B2B).
      </p>
      <p className="text-xs font-medium text-foreground -mt-6">
        Aktion: <strong>-{PROMO_DISCOUNT_PERCENT}%</strong> auf alle Flächen und Folienproduktion geschenkt
        (statt {formatEuro(REGULAR_SETUP_FEE)} netto). Nur wenige Flächen pro Fahrzeug verfügbar.
      </p>
      {viewOrder.map((v) => {
        const pkgs = PACKAGES_BY_VIEW[v];
        if (pkgs.length === 0) return null;
        return (
          <div key={v}>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">{VIEWS[v].label}</h3>
              <span className="text-xs text-muted-foreground">
                {pkgs.length} Flächen · ab {formatEuro(Math.min(...pkgs.map((p) => p.monthly)))} netto/Mon.
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pkgs.map((pkg) => {
                const isActive = highlight === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => onSelect?.(pkg.id)}
                    className={`text-left p-4 rounded-xl border bg-card transition-all ${
                      isActive
                        ? "border-foreground shadow-md scale-[1.01]"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-foreground text-background">
                        {pkg.code}
                      </span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {pkg.sizeLabel}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">{formatSqm(pkg.sqm)}</div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-sm text-muted-foreground line-through">{formatEuro(pkg.listMonthly)}</span>
                      <span className="text-2xl font-bold text-foreground">{formatEuro(pkg.monthly)}</span>
                      <span className="text-[11px] text-muted-foreground">netto / Mon.</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">zzgl. 19% MwSt.</div>
                    <div className="mt-3 space-y-1 text-[11px]">
                      {pkg.prices.map((p) => (
                        <div
                          key={p.years}
                          className="flex items-center justify-between border-t border-border/60 pt-1"
                        >
                          <span className="text-muted-foreground">
                            {p.years} {p.years === 1 ? "Jahr" : "Jahre"}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatEuro(p.monthly)} netto/Mon.
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Check className="w-3 h-3" /> Folienproduktion 0 € (statt {formatEuro(REGULAR_SETUP_FEE)})
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
