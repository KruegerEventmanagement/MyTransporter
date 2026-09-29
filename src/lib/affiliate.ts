/**
 * Awin-Partnerlinks (reine Linkwerbung, keine Scripts, kein Tracking beim Seitenaufruf).
 * Nur die im Awin-LinkBuilder erzeugten und verifizierten Links eintragen.
 */

export const AWIN_PUBLISHER_ID = "3102390";
export const AFFILIATE_TRACKING_HOSTS = ["www.awin1.com"] as const;
export const AFFILIATE_REL = "sponsored nofollow noopener noreferrer";
export const AFFILIATE_LABEL = "Anzeige · Partnerlink";
export const AFFILIATE_DISCLOSURE =
  "Bei einem Kauf über diese Links können wir eine Provision erhalten.";

export type AffiliateIcon = "tyre" | "sofa";

export interface AffiliateOffer {
  id: string;
  brand: string;
  category: string;
  advertiserId: string;
  destination: string;
  trackingUrl: string;
  icon: AffiliateIcon;
}

export const AFFILIATE_CONFIG: { enabled: boolean; offers: readonly AffiliateOffer[] } = {
  enabled: true,
  offers: [
    {
      id: "reifen-com",
      brand: "reifen.com",
      category: "Reifen und Felgen",
      advertiserId: "7605",
      destination: "https://www.reifen.com/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=7605&awinaffid=3102390&ued=https%3A%2F%2Fwww.reifen.com%2F",
      icon: "tyre",
    },
    {
      id: "finebuy",
      brand: "FineBuy",
      category: "Möbel und Wohnaccessoires",
      advertiserId: "53027",
      destination: "https://www.finebuy.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=53027&awinaffid=3102390&ued=https%3A%2F%2Fwww.finebuy.de%2F",
      icon: "sofa",
    },
  ],
};

export function activeAffiliateOffers(): readonly AffiliateOffer[] {
  return AFFILIATE_CONFIG.enabled ? AFFILIATE_CONFIG.offers : [];
}
