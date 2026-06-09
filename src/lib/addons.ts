export type AddonId = "sicher_transport" | "profi_umzug";

export type Addon = {
  id: AddonId;
  name: string;
  priceEur: number;
  badge: string;
  description: string;
  items: string[];
};

export const ADDONS: Addon[] = [
  {
    id: "sicher_transport",
    name: "Sicher-Transport Paket",
    priceEur: 19,
    badge: "Beliebtestes Zusatzpaket",
    description:
      "Ideal, wenn du Möbel, Kartons, einen Kühlschrank, eine Waschmaschine oder empfindliche Gegenstände sicher transportieren möchtest.",
    items: [
      "1 Eurobox für Kleinteile",
      "4 Spanngurte / Zurrgurte zur Ladungssicherung",
      "2–4 kleine Gurte für kleinere Gegenstände",
      "4 Umzugsdecken zum Schutz von Möbeln",
      "1 Paar Arbeitshandschuhe",
    ],
  },
  {
    id: "profi_umzug",
    name: "Profi-Umzug Paket",
    priceEur: 49,
    badge: "Bester Komfort",
    description:
      "Das Rundum-sorglos-Paket für größere Umzüge, Entrümpelungen oder Transporte mit mehreren schweren Gegenständen.",
    items: [
      "1 Möbelroller / Rollbrett",
      "8–10 Umzugsdecken",
      "6 Spanngurte / Zurrgurte",
      "Klebeband",
      "Cutter",
      "1–2 Paar Arbeitshandschuhe",
      "Müllbeutel für Verpackungsmüll oder Kleinteile",
    ],
  },
];

export const ADDON_NOTE =
  "Alle Pakete sind optional und nur nach Verfügbarkeit buchbar. Zubehör muss vollständig und unbeschädigt zurückgegeben werden. Bei Verlust oder Beschädigung können Ersatzkosten entstehen.";

export const ADDON_TRUST =
  "Viele große Anbieter bieten Umzugszubehör nur als Extra oder über separate Mietoptionen an. Bei MyTransporter bekommst du auf Wunsch direkt ein passendes Zubehörpaket dazu – einfach, praktisch und fair.";

export function getAddonById(id: string): Addon | undefined {
  return ADDONS.find((a) => a.id === id);
}

export function sumAddonsCents(ids: string[]): number {
  return ids.reduce((sum, id) => {
    const a = getAddonById(id);
    return a ? sum + a.priceEur * 100 : sum;
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
    .map((id) => getAddonById(id))
    .filter((a): a is Addon => !!a)
    .map((a) => ({ id: a.id, label: a.name, price_cents: a.priceEur * 100 }));
}
