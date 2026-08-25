import { PLAN_CATALOG, L4H2_SURCHARGE_EUR } from "@/lib/booking-rules";

const SINGLE = PLAN_CATALOG.filter((p) => p.days === 1);
const MULTI = PLAN_CATALOG.filter((p) => p.days > 1);

function scrollToBooking() {
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function TariffSection() {
  return (
    <section id="tarife" className="py-16 px-4 sm:px-6 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Transporter mieten zum fairen Festpreis
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Zwei Fahrzeugklassen: der kurze L1H1 und der lange L4H2 mit noch mehr Ladevolumen.
            Alle Preise unten gelten für den L1H1 – der L4H2 kostet pro Buchung pauschal{" "}
            {L4H2_SURCHARGE_EUR} € mehr.
          </p>
        </div>


        {/* Eintagestarife */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SINGLE.map((plan) => {
            const highlight = plan.highlight === "popular" || plan.highlight === "best_km";
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-6 flex flex-col ${
                  highlight ? "border-foreground bg-secondary/40" : "border-border bg-card"
                }`}
              >
                {plan.highlightLabel && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full bg-foreground text-background font-semibold whitespace-nowrap">
                    {plan.highlightLabel}
                  </span>
                )}
                <h3 className="text-lg font-bold text-foreground">{plan.shortLabel}</h3>
                <p className="text-3xl font-bold text-foreground mt-2">{plan.price} €</p>
                <p className="text-xs text-muted-foreground mt-1">
                  L1H1 · L4H2 {plan.price + L4H2_SURCHARGE_EUR} €
                </p>
                <p className="text-xs text-muted-foreground mt-1">inkl. {plan.freeKm} km</p>
                {plan.idealFor && (
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed flex-1">
                    {plan.idealFor}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  Mehrkilometer: {(plan.extraKmCents / 100).toFixed(2).replace(".", ",")} €/km
                </p>
                <button
                  type="button"
                  onClick={scrollToBooking}
                  className="mt-4 rounded-full bg-foreground text-background py-2.5 text-sm font-medium hover:opacity-90 transition"
                >
                  Verfügbarkeit prüfen
                </button>
              </div>
            );
          })}
        </div>

        {/* Mehrtagestarife */}
        <div className="mt-14">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-foreground">
              Mehrtagestarife für Umzug, Renovierung &amp; Projekte
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl mx-auto">
              Wenn ein Tag nicht reicht: Buche den großen L4H2-Transporter einfach mehrere Tage
              und profitiere von günstigeren Tagespreisen.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Tarif</th>
                  <th className="text-right px-4 py-3 font-semibold">Preis</th>
                  <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell">Inklusive km</th>
                  <th className="text-right px-4 py-3 font-semibold">pro Tag</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {MULTI.map((plan) => {
                  const perDay = (plan.price / plan.days).toFixed(2).replace(".", ",");
                  const highlighted = !!plan.highlightLabel;
                  return (
                    <tr key={plan.id} className={`border-t border-border ${highlighted ? "bg-secondary/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{plan.label}</div>
                        {plan.highlightLabel && (
                          <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-foreground text-background font-semibold">
                            {plan.highlightLabel}
                          </span>
                        )}
                        {plan.idealFor && (
                          <p className="text-xs text-muted-foreground mt-1 hidden md:block">{plan.idealFor}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground whitespace-nowrap">{plan.price} €</td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {plan.freeKm.toLocaleString("de-DE")} km
                      </td>
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">{perDay} €</td>
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={scrollToBooking}
                          className="rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 transition whitespace-nowrap"
                        >
                          Prüfen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Mehrkilometer in den Mehrtagestarifen: 0,35 €/km · Wochenmiete: 0,29 €/km · Kaution 200 € (wird zurückerstattet)
          </p>
        </div>
      </div>
    </section>
  );
}