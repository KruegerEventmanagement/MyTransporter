export type AddonId = "umzugspaket";

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
];

export const ADDON_NOTE =
  "Das Umzugspaket ist optional und nur nach Verfügbarkeit buchbar. Das Zubehör muss vollständig und unbeschädigt zurückgegeben werden. Bei Verlust oder Beschädigung können Ersatzkosten entstehen.";

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
