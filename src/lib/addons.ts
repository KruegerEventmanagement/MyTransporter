export type AddonId = "umzugspaket" | "fahrer_helfer";

export type Addon = {
  id: AddonId;
  name: string;
  /** Fixpreis pro Buchung (bei Stundenpaketen: Preis pro Stunde) */
  priceEur: number;
  badge: string;
  description: string;
  items: string[];
  /** Wenn gesetzt: Preis gilt pro Stunde, Auswahl über Stundenanzahl */
  hourly?: { minHours: number; maxHours: number };
};

export const ADDONS: Addon[] = [
  {
    id: "umzugspaket",
    name: "Umzugspaket",
    priceEur: 29,
    badge: "Praktisches Umzugspaket",
    description:
      "Ideal, wenn du Möbel, Kartons, einen Kühlschrank, eine Waschmaschine oder empfindliche Gegenstände sicher transportieren möchtest.",
    items: [
      "2 dicke Spanngurte",
      "4 dünne Zurrgurte",
      "1 neue Rolle Klebeband / Panzertape",
      "1 Paar Arbeitshandschuhe",
      "5 Umzugsdecken für Möbeltransport",
    ],
  },
  {
    id: "fahrer_helfer",
    name: "Fahrer / Umzugshelfer",
    priceEur: 50,
    badge: "Hilfe dazubuchen",
    description:
      "Du entscheidest vor Ort, wie geholfen wird: nur fahren, fahren und mit anpacken oder ausschließlich beim Umzug helfen. Der Preis kommt zum Mietpreis dazu.",
    items: [
      "50 € pro Stunde",
      "Mindestabnahme 3 Stunden",
      "Optional als Fahrer einsetzbar",
      "Hilft beim Tragen, Ein- und Ausladen",
    ],
    hourly: { minHours: 3, maxHours: 10 },
  },
];

export const ADDON_NOTE =
  "Die Pakete sind optional und nur nach Verfügbarkeit buchbar. Zubehör muss vollständig und unbeschädigt zurückgegeben werden. Bei Verlust oder Beschädigung können Ersatzkosten entstehen. Fahrer / Umzugshelfer werden ab Mietbeginn stundenweise berechnet, Mindestabnahme 3 Stunden.";

export const ADDON_TRUST =
  "Viele große Anbieter bieten Umzugszubehör oder Hilfe nur als teures Extra an. Bei MyTransporter bekommst du beides direkt zur Miete dazu – einfach, praktisch und fair.";

/** Basis-ID aus einer Auswahl-ID wie "fahrer_helfer:4" */
export function addonBaseId(id: string): string {
  return id.split(":")[0] ?? id;
}

export function getAddonById(id: string): Addon | undefined {
  const base = addonBaseId(id);
  return ADDONS.find((a) => a.id === base);
}

export type AddonSelection = {
  addon: Addon;
  hours: number | null;
  priceCents: number;
  label: string;
};

/** Löst eine Auswahl-ID (optional mit Stunden) in Preis und Label auf. */
export function resolveAddonSelection(id: string): AddonSelection | null {
  const addon = getAddonById(id);
  if (!addon) return null;
  if (!addon.hourly) {
    return { addon, hours: null, priceCents: addon.priceEur * 100, label: addon.name };
  }
  const parsed = Number.parseInt(id.split(":")[1] ?? "", 10);
  const hours = Math.min(
    addon.hourly.maxHours,
    Math.max(addon.hourly.minHours, Number.isFinite(parsed) ? parsed : addon.hourly.minHours),
  );
  return {
    addon,
    hours,
    priceCents: addon.priceEur * 100 * hours,
    label: `${addon.name} (${hours} Std.)`,
  };
}

export function makeAddonSelectionId(addon: Addon, hours: number): string {
  return addon.hourly ? `${addon.id}:${hours}` : addon.id;
}

export function sumAddonsCents(ids: string[]): number {
  return ids.reduce((sum, id) => {
    const sel = resolveAddonSelection(id);
    return sel ? sum + sel.priceCents : sum;
  }, 0);
}

export function sumAddonsEur(ids: string[]): number {
  return sumAddonsCents(ids) / 100;
}

export type BookingAddonSnapshot = {
  id: string;
  label: string;
  price_cents: number;
};

export function buildAddonSnapshot(ids: string[]): BookingAddonSnapshot[] {
  return ids
    .map((id) => ({ id, sel: resolveAddonSelection(id) }))
    .filter((x): x is { id: string; sel: AddonSelection } => !!x.sel)
    .map(({ id, sel }) => ({ id, label: sel.label, price_cents: sel.priceCents }));
}
