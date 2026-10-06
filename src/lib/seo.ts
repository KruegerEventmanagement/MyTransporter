/**
 * Zentrale SEO-/Seitenmetadaten für MyTransporter.
 *
 * - Einzige kanonische Herkunft: https://mytransporter.org (ohne www).
 * - Jede öffentliche Seite nutzt `pageHead()`; private Seiten `privateHead()`.
 * - Sitemap und Tests lesen `PUBLIC_PAGES` – eine Quelle, keine Abweichung.
 */

export const SITE_URL = "https://mytransporter.org";
export const SITE_NAME = "MyTransporter";
/** Echtes Marken-Icon (512×512) statt veraltetem Builder-Screenshot. */
export const SHARE_IMAGE = `${SITE_URL}/icons/icon-512.png`;

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const LEONBERG_PLACE_ID = `${SITE_URL}/#abholung-leonberg`;
export const GRUNBACH_PLACE_ID = `${SITE_URL}/#abholung-grunbach`;

export const BUSINESS = {
  phone: "+4915236230118",
  phoneDisplay: "0152 3623 0118",
  email: "info@mytransporter.org",
  leonberg: {
    street: "Römerstraße 36",
    postalCode: "71229",
    locality: "Leonberg",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=R%C3%B6merstra%C3%9Fe+36%2C+71229+Leonberg",
  },
  grunbach: {
    street: "Calwer Straße 29",
    postalCode: "75331",
    locality: "Engelsbrand-Grunbach",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=Calwer+Stra%C3%9Fe+29%2C+75331+Engelsbrand",
  },
} as const;

/** Öffentliche, indexierbare Seiten (Sitemap + Tests). */
export const PUBLIC_PAGES = [
  "/",
  "/preise",
  "/langzeitmiete",
  "/umzug",
  "/umzugstransporter-mieten",
  "/transporter-mieten-pforzheim-calw",
  "/faq",
  "/kontakt",
  "/ueber-uns",
  "/werbung",
  "/impressum",
  "/agb",
  "/datenschutz",
] as const;

/** Private Bereiche: serverseitig noindex (keine Sicherheitsmaßnahme!). */
export const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/profil",
  "/buchung/",
  "/trip/",
  "/auth/confirm",
  "/checkout/return",
] as const;

export function absoluteUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** JSON sicher für <script type="application/ld+json"> (kein `</script>`-Ausbruch). */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(crumbs[crumbs.length - 1].path)}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export type PageHeadInput = {
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article";
  breadcrumbs?: Crumb[];
  /** Zusätzliche schema.org-Knoten (ohne @context), werden in einen @graph gelegt. */
  schema?: Record<string, unknown>[];
  webPageType?: string;
  /** Zusätzliche Felder direkt am WebPage-Knoten (z. B. mainEntity bei FAQPage). */
  webPageExtra?: Record<string, unknown>;
};

export function pageHead(input: PageHeadInput) {
  const url = absoluteUrl(input.path);
  const webPage: Record<string, unknown> = {
    "@type": input.webPageType ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.title,
    description: input.description,
    inLanguage: "de-DE",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    ...(input.webPageExtra ?? {}),
  };
  const graph: Record<string, unknown>[] = [webPage];
  if (input.breadcrumbs && input.breadcrumbs.length > 1) {
    webPage.breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push(breadcrumbJsonLd(input.breadcrumbs));
  }
  if (input.schema) graph.push(...input.schema);

  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      { name: "robots", content: "index,follow" },
      { property: "og:type", content: input.ogType ?? "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "de_DE" },
      { property: "og:url", content: url },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:image", content: SHARE_IMAGE },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: input.title },
      { name: "twitter:description", content: input.description },
      { name: "twitter:image", content: SHARE_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: safeJsonLd({ "@context": "https://schema.org", "@graph": graph }),
      },
    ],
  };
}

export function privateHead(title: string) {
  return {
    meta: [{ title }, { name: "robots", content: "noindex,nofollow" }],
  };
}

/** Sitewide Organisation + Website (einmal im Root, per @id referenziert). */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AutoRental",
        "@id": ORG_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: SHARE_IMAGE,
        image: SHARE_IMAGE,
        telephone: BUSINESS.phone,
        email: BUSINESS.email,
        priceRange: "€€",
        address: {
          "@type": "PostalAddress",
          streetAddress: BUSINESS.leonberg.street,
          postalCode: BUSINESS.leonberg.postalCode,
          addressLocality: BUSINESS.leonberg.locality,
          addressRegion: "BW",
          addressCountry: "DE",
        },
        openingHoursSpecification: {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          opens: "08:00",
          closes: "22:00",
        },
        areaServed: ["Leonberg", "Stuttgart", "Böblingen", "Sindelfingen", "Ludwigsburg", "Pforzheim", "Calw"],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        inLanguage: "de-DE",
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}
