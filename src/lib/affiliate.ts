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

export type AffiliateIcon =
  | "bike"
  | "box"
  | "briefcase"
  | "camera"
  | "car"
  | "flame"
  | "gem"
  | "gift"
  | "house"
  | "shopping-bag"
  | "sofa"
  | "tyre"
  | "zap";

export type AffiliateRail = "left" | "right";

export interface AffiliateOffer {
  id: string;
  brand: string;
  /** Fehlt bei Original-Textlinks des Advertisers (keine erfundene Beschreibung). */
  category?: string;
  advertiserId: string;
  /** Fehlt, wenn der Advertiser das Ziel dynamisch verwaltet (awclick.php-Werbemittel). */
  destination?: string;
  trackingUrl: string;
  icon?: AffiliateIcon;
  rail: AffiliateRail;
  /** Unveränderter, vom Advertiser bereitgestellter Linktext; Karte zeigt nur diesen Text im Link. */
  originalText?: string;
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
      rail: "left",
    },
    {
      id: "reifendirekt",
      brand: "ReifenDirekt",
      category: "Reifen und Autozubehör",
      advertiserId: "11823",
      destination: "https://www.reifendirekt.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=11823&awinaffid=3102390&ued=https%3A%2F%2Fwww.reifendirekt.de%2F",
      icon: "tyre",
      rail: "left",
    },
    {
      id: "carshine",
      brand: "Carshine",
      category: "Autopflege und Zubehör",
      advertiserId: "78152",
      destination: "https://www.carshine-direct.com/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=78152&awinaffid=3102390&ued=https%3A%2F%2Fwww.carshine-direct.com%2F",
      icon: "car",
      rail: "left",
    },
    {
      id: "reifen-de",
      brand: "reifen.de",
      category: "Reifen- und Felgenvergleich",
      advertiserId: "10719",
      destination: "https://www.reifen.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=10719&awinaffid=3102390&ued=https%3A%2F%2Fwww.reifen.de%2F",
      icon: "tyre",
      rail: "left",
    },
    {
      id: "evercross",
      brand: "Evercross",
      category: "E-Scooter, E-Bikes und Zubehör",
      advertiserId: "129787",
      destination: "https://evercross.eu/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=129787&awinaffid=3102390&ued=https%3A%2F%2Fevercross.eu%2F",
      icon: "bike",
      rail: "left",
    },
    {
      id: "primavolt",
      brand: "Primavolt",
      category: "Energie- und Telekommunikationstarife",
      advertiserId: "124474",
      destination: "https://www.primavolt.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=124474&awinaffid=3102390&ued=https%3A%2F%2Fwww.primavolt.de%2F",
      icon: "zap",
      rail: "left",
    },
    {
      id: "druckdichdrauf",
      brand: "druckdichdrauf",
      category: "Textildruck und Fotogeschenke",
      advertiserId: "11609",
      destination: "https://www.druckdichdrauf.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=11609&awinaffid=3102390&ued=https%3A%2F%2Fwww.druckdichdrauf.de%2F",
      icon: "gift",
      rail: "left",
    },
    {
      id: "mindebox",
      brand: "MindeBox",
      category: "Eventfotos und Videos per QR-Code",
      advertiserId: "130403",
      destination: "https://mindebox.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=130403&awinaffid=3102390&ued=https%3A%2F%2Fmindebox.de%2F",
      icon: "camera",
      rail: "left",
    },
    {
      id: "tesa",
      brand: "tesa",
      advertiserId: "117567",
      trackingUrl:
        "https://www.awin1.com/awclick.php?gid=583198&mid=117567&awinaffid=3102390&linkid=4535956&clickref=",
      rail: "left",
      originalText: "tesa",
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
      rail: "right",
    },
    {
      id: "dublino-moebel",
      brand: "Dublino Möbel",
      category: "Möbel für Wohnen, Garten und Gastronomie",
      advertiserId: "50865",
      destination: "https://www.dublino-moebel.com/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=50865&awinaffid=3102390&ued=https%3A%2F%2Fwww.dublino-moebel.com%2F",
      icon: "sofa",
      rail: "right",
    },
    {
      id: "lunzo",
      brand: "Lunzo",
      category: "Haushalt, Garten und Alltagszubehör",
      advertiserId: "69786",
      destination: "https://www.lunzo.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=69786&awinaffid=3102390&ued=https%3A%2F%2Fwww.lunzo.de%2F",
      icon: "house",
      rail: "right",
    },
    {
      id: "electricsun",
      brand: "ElectricSun",
      category: "Elektrokamine und Heizgeräte",
      advertiserId: "129151",
      destination: "https://electricsun.de/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=129151&awinaffid=3102390&ued=https%3A%2F%2Felectricsun.de%2F",
      icon: "flame",
      rail: "right",
    },
    {
      id: "brickzonehub",
      brand: "brickzonehub",
      category: "Vitrinen für Klemmbausteinmodelle · UK-Shop",
      advertiserId: "121692",
      destination: "https://brickzonehub.co.uk/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=121692&awinaffid=3102390&ued=https%3A%2F%2Fbrickzonehub.co.uk%2F",
      icon: "box",
      rail: "right",
    },
    {
      id: "hey-happiness",
      brand: "Hey Happiness",
      category: "Schmuck und Accessoires",
      advertiserId: "111366",
      destination: "https://www.heyhappiness.com",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=111366&awinaffid=3102390&ued=https%3A%2F%2Fwww.heyhappiness.com",
      icon: "gem",
      rail: "right",
    },
    {
      id: "world-businesses-for-sale",
      brand: "World Businesses for Sale",
      category: "Unternehmensmarktplatz · Englisch",
      advertiserId: "116725",
      destination: "https://worldbusinessesforsale.com/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=116725&awinaffid=3102390&ued=https%3A%2F%2Fworldbusinessesforsale.com%2F",
      icon: "briefcase",
      rail: "right",
    },
    {
      id: "braingood",
      brand: "braingood",
      category: "Nahrungsergänzungsmittel",
      advertiserId: "127589",
      destination: "https://braingood.com/",
      trackingUrl:
        "https://www.awin1.com/cread.php?awinmid=127589&awinaffid=3102390&ued=https%3A%2F%2Fbraingood.com%2F",
      icon: "shopping-bag",
      rail: "right",
    },
  ],
};

export function activeAffiliateOffers(): readonly AffiliateOffer[] {
  return AFFILIATE_CONFIG.enabled ? AFFILIATE_CONFIG.offers : [];
}

export function affiliateOffersForRail(rail: AffiliateRail): readonly AffiliateOffer[] {
  return activeAffiliateOffers().filter((offer) => offer.rail === rail);
}

/** Ergänzt ausschließlich einen festen, nicht personenbezogenen Platzierungswert. */
export function affiliateTrackingUrl(offer: AffiliateOffer, rail: AffiliateRail): string {
  const ref = `mytransporter_${rail}`;
  // Original-Werbemittel enthalten bereits einen leeren clickref: befüllen statt doppelt anhängen.
  if (offer.trackingUrl.endsWith("&clickref=")) return `${offer.trackingUrl}${ref}`;
  return `${offer.trackingUrl}&clickref=${ref}`;
}
