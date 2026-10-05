import {
  ArrowUpRight,
  Bike,
  Box,
  BriefcaseBusiness,
  Camera,
  CarFront,
  CircleDot,
  Flame,
  Gem,
  Gift,
  House,
  ShoppingBag,
  Sofa,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  AFFILIATE_DISCLOSURE,
  AFFILIATE_LABEL,
  AFFILIATE_REL,
  affiliateOffersForRail,
  affiliateTrackingUrl,
  type AffiliateOffer,
  type AffiliateRail,
} from "@/lib/affiliate";

function OfferIcon({ offer }: { offer: AffiliateOffer }) {
  const icons: Record<AffiliateOffer["icon"], LucideIcon> = {
    bike: Bike,
    box: Box,
    briefcase: BriefcaseBusiness,
    camera: Camera,
    car: CarFront,
    flame: Flame,
    gem: Gem,
    gift: Gift,
    house: House,
    "shopping-bag": ShoppingBag,
    sofa: Sofa,
    tyre: CircleDot,
    zap: Zap,
  };
  const Icon = icons[offer.icon];
  return <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />;
}

function OfferCard({ offer, rail }: { offer: AffiliateOffer; rail: AffiliateRail }) {
  return (
    <a
      href={affiliateTrackingUrl(offer, rail)}
      target="_blank"
      rel={AFFILIATE_REL}
      data-affiliate={offer.id}
      className="group flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="break-words text-[10px] font-semibold uppercase text-muted-foreground">
        {AFFILIATE_LABEL}
      </span>
      <span className="flex min-w-0 items-start gap-2">
        <OfferIcon offer={offer} />
        <span className="min-w-0">
          <span className="block break-words [overflow-wrap:anywhere] text-sm font-bold leading-tight text-foreground">
            {offer.brand}
          </span>
          <span className="mt-1 block break-words text-[11px] leading-snug text-muted-foreground">
            {offer.category}
          </span>
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground underline underline-offset-2">
        Zum Anbieter <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </span>
      <span className="block break-words border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">
        {AFFILIATE_DISCLOSURE}
      </span>
    </a>
  );
}

/** Acht Partnerkarten für eine der beiden reinen Desktop-Seitenleisten. */
export function AffiliateRail({ rail }: { rail: AffiliateRail }) {
  const offers = affiliateOffersForRail(rail);
  if (offers.length === 0) return null;
  return (
    <div data-testid={`affiliate-rail-${rail}`} data-rail={rail} className="flex min-w-0 flex-col gap-3 py-8">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} rail={rail} />
      ))}
    </div>
  );
}
