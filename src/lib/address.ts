/**
 * Optionale Kundenanschrift (Profil + Registrierungs-Metadaten).
 * Alle Felder sind freiwilliger Text; PLZ bleibt Text, kein Standard-Land.
 */
export type AddressInput = { street: string; postalCode: string; city: string; country: string };

export const EMPTY_ADDRESS: AddressInput = { street: "", postalCode: "", city: "", country: "" };

export const ADDRESS_LIMITS = { street: 160, postalCode: 20, city: 120, country: 80 } as const;

const t = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max);

/** Registrierungs-Metadaten; leere Werte werden vom Profil-Trigger zu NULL. */
export function addressSignUpMetadata(a: AddressInput) {
  return {
    address_street: t(a.street, ADDRESS_LIMITS.street),
    address_postal_code: t(a.postalCode, ADDRESS_LIMITS.postalCode),
    address_city: t(a.city, ADDRESS_LIMITS.city),
    address_country: t(a.country, ADDRESS_LIMITS.country),
  };
}

/** Spalten für ein Profil-Update; leer → NULL (bewusstes Löschen). */
export function addressProfileColumns(a: AddressInput) {
  const m = addressSignUpMetadata(a);
  return {
    address_street: m.address_street || null,
    address_postal_code: m.address_postal_code || null,
    address_city: m.address_city || null,
    address_country: m.address_country || null,
  };
}
