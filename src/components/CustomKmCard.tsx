import { Route as RouteIcon } from "lucide-react";
import type { CustomKmQuote } from "@/lib/custom-km";
import { CUSTOM_KM_MAX } from "@/lib/custom-km";

const eur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const km = (n: number) => `${n.toLocaleString("de-DE")} km`;

export function CustomKmCard(props: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  error: string | null;
  quote: CustomKmQuote | null;
  includedKm: number | null;
  includedRateCents: number | null;
  addonsCents: number;
  depositEur: number;
}) {
  const { enabled, value, error, quote, includedKm } = props;
  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 max-w-3xl mx-auto mt-6" data-testid="custom-km-card">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => props.onEnabledChange(e.target.checked)}
          className="mt-1 h-5 w-5 accent-foreground"
          aria-label="Individuelles Kilometerpaket aktivieren"
        />
        <span>
          <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <RouteIcon className="w-5 h-5" /> Individuelles Kilometerpaket
          </span>
          <span className="block text-xs text-muted-foreground mt-1">Optional. Ohne Auswahl gilt dein Tarif unverändert.</span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-foreground" htmlFor="custom-km-input">Gewünschte Gesamtkilometer</label>
          <input
            id="custom-km-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            data-max={CUSTOM_KM_MAX}
            value={value}
            onChange={(e) => props.onValueChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="custom-km-help"
            className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground"
            placeholder="z. B. 503"
          />
          <p id="custom-km-help" className="mt-1 text-xs text-muted-foreground">
            Gesamte geplante Strecke, nicht zusätzliche Kilometer. Bereits enthaltene Kilometer werden berücksichtigt.
          </p>
          {error && <p className="mt-2 text-sm font-medium text-foreground" role="alert">{error}</p>}
          {!error && value.trim() === "" && (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="custom-km-empty">Keine zusätzlichen Kilometer ausgewählt</p>
          )}
          {!error && quote && includedKm !== null && (
            <dl className="mt-4 space-y-1 text-sm">
              <Row k="Im Tarif bisher inklusive" v={km(includedKm)} />
              <Row k="Gewünschte Gesamtkilometer" v={km(quote.desiredKm)} />
              <Row k="Gebuchtes Gesamtkontingent" v={km(quote.contractKm)} strong />
              <Row
                k={quote.consideredPlanId !== quote.originalPlanId ? `Paketaufschlag (berechnet über ${quote.consideredPlanLabel})` : "Paketaufschlag"}
                v={eur(quote.surchargeCents)}
              />
              <Row k="Neuer Mietpreis inkl. Zubehör" v={eur(quote.totalRentCents + props.addonsCents)} strong />
              <Row k="Kaution (separat)" v={`${props.depositEur} €`} />
              <Row k={`Mehrkilometer über ${km(quote.contractKm)}`} v={`${eur(quote.rateCents)}/km`} />
              {quote.surchargeCents === 0 && (
                <p className="text-xs text-muted-foreground pt-1">Deine Strecke ist bereits im Tarif enthalten – kein Aufpreis.</p>
              )}
            </dl>
          )}
          {!error && !quote && props.includedRateCents === null && (
            <p className="mt-2 text-xs text-muted-foreground">Bitte zuerst einen Tarif wählen.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={strong ? "font-semibold text-foreground whitespace-nowrap" : "text-foreground whitespace-nowrap"}>{v}</dd>
    </div>
  );
}
