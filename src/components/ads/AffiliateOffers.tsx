import { ArrowUpRight, CircleDot, Sofa } from "lucide-react";
import {
  AFFILIATE_DISCLOSURE,
  AFFILIATE_LABEL,
  AFFILIATE_REL,
  activeAffiliateOffers,
  type AffiliateOffer,
} from "@/lib/affiliate";
import { useAdsSuppressed } from "@/lib/ad-visibility";

function OfferIcon({ offer }: { offer: AffiliateOffer }) {
  const Icon = offer.icon === "tyre" ? CircleDot : Sofa;
  return <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />;
}

function OfferCard({ offer, compact }: { offer: AffiliateOffer; compact?: boolean }) {
  return (
    <a
      href={offer.trackingUrl}
      target="_blank"
      rel={AFFILIATE_REL}
      data-affiliate={offer.id}
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/40"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {AFFILIATE_LABEL}
      </span>
      <span className={`flex min-w-0 ${compact ? "flex-col gap-2" : "items-center gap-3"}`}>
        <OfferIcon offer={offer} />
        <span className="min-w-0">
          <span className="block break-words font-bold text-foreground">{offer.brand}</span>
          <span className="block break-words text-xs text-muted-foreground">{offer.category}</span>
        </span>
      </span>
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
        Zum Shop <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </a>
  );
}

/** Schmale Partnerkarte für die Desktop-Seitenleiste (Fallback ohne AdSense). */
export function AffiliateRailCard({ index }: { index: number }) {
  const offer = activeAffiliateOffers()[index];
  if (!offer) return null;
  return (
    <div data-testid="affiliate-rail" className="xl:pt-16">
      <OfferCard offer={offer} compact />
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
    </div>
  );
}

/** Sichtbarer Abschnitt unterhalb des Hauptinhalts. Während transaktionaler Schritte ausgeblendet. */
export function AffiliateOffersSection() {
  const suppressed = useAdsSuppressed();
  const offers = activeAffiliateOffers();
  if (suppressed || offers.length === 0) return null;
  return (
    <section
      data-testid="affiliate-section"
      aria-labelledby="affiliate-heading"
      className="border-t border-border px-4 py-10 sm:px-6"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {AFFILIATE_LABEL}
        </p>
        <h2 id="affiliate-heading" className="mt-1 text-xl font-bold text-foreground">
          Partnerangebote für unterwegs und zu Hause
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{AFFILIATE_DISCLOSURE}</p>
      </div>
    </section>
  );
}
