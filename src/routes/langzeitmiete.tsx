import { useMemo, useState } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Truck, Sparkles, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { RollingNumber } from "@/components/RollingNumber";
import { VEHICLE_CLASSES, VEHICLE_CLASS_LABEL, type VehicleClass } from "@/lib/booking-rules";
import {
  formatEur,
  LONG_TERM_MIN_DAYS,
  LONG_TERM_WEEK_DISCOUNT_PERCENT,
  quoteLongTerm,
  weeklyBasePriceEur,
} from "@/lib/long-term";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import { VideoBackground } from "@/components/VideoBackground";
import fotorVideo from "@/assets/videos/mytransporter-fotor.mp4.asset.json";
import fotorPoster from "@/assets/videos/mytransporter-fotor-poster.jpg.asset.json";

export const Route = createFileRoute("/langzeitmiete")({
  head: () =>
    pageHead({
      path: "/langzeitmiete",
      title: "Transporter Langzeitmiete ab 7 Tagen in Leonberg | MyTransporter",
      description: "Transporter langfristig mieten in Leonberg: ab 7 Tagen tagesgenau berechnet mit Langzeitvorteil. Preis sofort im Rechner sehen, Kaution separat.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Langzeitmiete", path: "/langzeitmiete" }],
    }),
  component: LangzeitmietePage,
});

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function LangzeitmietePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(addDaysIso(today, 1));
  const [end, setEnd] = useState(addDaysIso(today, 8));
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>("l1h1");

  const quote = useMemo(() => quoteLongTerm(start, end, vehicleClass), [start, end, vehicleClass]);
  

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-background">
      <VideoBackground
        src={fotorVideo.url}
        poster={fotorPoster.url}
        title="MyTransporter Langzeitmiete Video"
        fit="contain"
      />
      <Navbar />
      <div className="relative z-10">
      <AdRails>
      <main className="max-w-5xl mx-auto px-4 pt-20 pb-16">
        <header className="text-center max-w-2xl mx-auto rounded-3xl bg-background/90 backdrop-blur-md px-6 py-8 sm:px-10">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Langzeitmiete
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Je länger du mietest, desto entspannter wird dein Projekt. Tagesgenau abgerechnet – ohne
            Aufrunden auf volle Wochen.
          </p>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Eingaben */}
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" /> Mietbeginn
                </span>
                <input
                  type="date"
                  value={start}
                  min={today}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (e.target.value && e.target.value >= end) setEnd(addDaysIso(e.target.value, 7));
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" /> Rückgabe
                </span>
                <input
                  type="date"
                  value={end}
                  min={addDaysIso(start || today, 1)}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>

            <div className="mt-5">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Truck className="w-3.5 h-3.5" /> Fahrzeugklasse
              </span>
              <div className="grid grid-cols-3 gap-2">
                {VEHICLE_CLASSES.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setVehicleClass(cls)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      vehicleClass === cls
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {VEHICLE_CLASS_LABEL[cls]}
                    <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                      7 Tage {weeklyBasePriceEur(cls)} €
                    </span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Ergebnis */}
          <div className="rounded-3xl border border-border bg-gradient-to-b from-secondary/70 to-card p-5 sm:p-7 shadow-sm">
            {quote.eligible ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dein Langzeitpreis · {quote.days} Tage
                  </p>
                  {quote.tierLabel && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
                      {quote.tierLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-4xl sm:text-6xl font-bold text-foreground">
                  <RollingNumber value={formatEur(quote.totalEur)} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  entspricht {formatEur(quote.effectivePricePerDayEur)} € pro Tag
                  {quote.isExactWeekDiscount
                    ? ` · ${LONG_TERM_WEEK_DISCOUNT_PERCENT} % günstiger als der Wochenpreis`
                    : ""}
                </p>

                <dl className="mt-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Regulärer Wochenpreis hochgerechnet
                      <span className="block text-[10px]">Vergleichswert</span>
                    </dt>
                    <dd className="text-muted-foreground line-through">
                      {formatEur(quote.referencePriceEur)} €
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-semibold">
                    <dt className="text-foreground">Dein Langzeitpreis</dt>
                    <dd className="text-foreground">{formatEur(quote.totalEur)} €</dd>
                  </div>
                  {quote.savingsEur > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Du sparst</dt>
                      <dd className="text-foreground">{formatEur(quote.savingsEur)} €</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Inklusiv-Kilometer
                      <span className="block text-[10px]">
                        4.000 km je 30 Miettage · Mehrkilometer {formatEur(quote.extraKmEur)} €/km
                      </span>
                    </dt>
                    <dd className="text-foreground">
                      inkl. {quote.freeKm.toLocaleString("de-DE")} km
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Kaution (separat, ohne Rabatt)</dt>
                    <dd className="text-foreground">{formatEur(quote.depositEur)} €</dd>
                  </div>
                </dl>

                <Link
                  to="/"
                  className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Verfügbarkeit prüfen <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Transparenter Richtpreis auf Basis unserer Wochenmiete. Kaution, Mehrkilometer und
                  Tankkosten werden wie gewohnt separat abgerechnet.
                </p>
              </>
            ) : (
              <div className="flex h-full flex-col justify-center text-center">
                <p className="text-xl font-semibold text-foreground">
                  Langzeitmiete startet ab {LONG_TERM_MIN_DAYS} Tagen
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {quote.reason === "invalid_range"
                    ? "Bitte wähle eine Rückgabe nach dem Mietbeginn."
                    : `Dein Zeitraum umfasst ${quote.days} ${quote.days === 1 ? "Tag" : "Tage"}. Für kürzere Mieten haben wir passende Tarife.`}
                </p>
                <Link
                  to="/preise"
                  className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Zu den normalen Tarifen <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: CalendarDays,
              title: "Tagesgenau",
              text: "Kein Aufrunden auf volle Wochen – du zahlst genau deine Miettage.",
            },
            {
              icon: Sparkles,
              title: "Langzeitvorteil",
              text: `Ab ${LONG_TERM_MIN_DAYS} Tagen automatisch günstiger – je länger du mietest, desto stärker der Vorteil.`,
            },
            {
              icon: Truck,
              title: "Drei Größen",
              text: "L1H1 kurz, L4H2 lang und der extra lange Crafter L5H2.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-4">
              <Icon className="w-4 h-4 text-foreground" />
              <h2 className="mt-2 text-sm font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
        <div className="mt-10 flex justify-center text-sm text-muted-foreground">
          <AdConsentRevokeButton />
        </div>
      </main>
      </AdRails>
      </div>
    </div>
  );
}
