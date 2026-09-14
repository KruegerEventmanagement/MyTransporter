import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  PACKAGES_BY_VIEW,
  formatEuro,
  formatSqm,
  SETUP_FEE_EUR,
  getPartnerPackageOrNull,
  type PartnerPackageId,
} from "@/lib/partner-packages";
import { VIEWS, type ViewId, getViewForZone } from "@/lib/partner-zones";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ZonePreview } from "./ZonePreview";

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

const VIEW_ORDER: ViewId[] = ["driver", "passenger", "front", "rear"];

export function PartnerAreaPicker({ highlight, onSelect }: Props) {
  const view: ViewId = highlight ? getViewForZone(highlight) : "driver";
  const pkgs = PACKAGES_BY_VIEW[view];
  const active = useMemo(
    () => (highlight ? getPartnerPackageOrNull(highlight) : null),
    [highlight],
  );
  const current = active && active.view === view ? active : (pkgs[0] ?? null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Fahrzeugseite
          </label>
          <Select
            value={view}
            onValueChange={(v) => {
              const first = PACKAGES_BY_VIEW[v as ViewId][0];
              if (first) onSelect?.(first.id);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_ORDER.map((v) => (
                <SelectItem key={v} value={v}>
                  {VIEWS[v].label} ({PACKAGES_BY_VIEW[v].length} Flächen)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Werbefläche
          </label>
          <Select
            value={current?.id ?? ""}
            onValueChange={(v) => onSelect?.(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Fläche wählen" />
            </SelectTrigger>
            <SelectContent>
              {pkgs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} · {p.sizeLabel} · {formatEuro(p.monthly)} netto/Mon.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {current && (
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px]">
          <div>
            <div className="text-xs text-muted-foreground">
              {current.viewLabel} · Fläche {current.code}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {current.sizeLabel} · {formatSqm(current.sqm)}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-foreground">
                {formatEuro(current.monthly)}
              </span>
              <span className="text-[11px] text-muted-foreground">netto / Mon.</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              zzgl. 19% MwSt. · Preis bei 1 Jahr Laufzeit
            </div>
            <div className="mt-3 space-y-1 text-[11px]">
              {current.prices.map((p) => (
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
            <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3" /> Folienproduktion einmalig{" "}
              {formatEuro(SETUP_FEE_EUR)} netto
            </div>
          </div>
          <div>
            <ZonePreview view={view} code={current.code} />
            <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
              Schraffiert: Position der Fläche {current.code}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
