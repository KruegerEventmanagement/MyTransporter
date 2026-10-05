import { ADDRESS_LIMITS, type AddressInput } from "@/lib/address";

/** Optionale Anschrift-Felder, gemeinsam für Registrierung und Profil. */
export function AddressFields({
  value,
  onChange,
  inputClassName,
  idPrefix,
  disabled,
}: {
  value: AddressInput;
  onChange: (v: AddressInput) => void;
  inputClassName: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="space-y-2 min-w-0" disabled={disabled}>
      <legend className="mb-1 block text-xs font-medium text-muted-foreground">Anschrift (optional)</legend>
      <input id={`${idPrefix}-street`} aria-label="Straße und Hausnummer" placeholder="Straße und Hausnummer"
        autoComplete="street-address" maxLength={ADDRESS_LIMITS.street} value={value.street}
        onChange={set("street")} className={inputClassName} />
      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <input id={`${idPrefix}-postal`} aria-label="PLZ" placeholder="PLZ" autoComplete="postal-code"
          inputMode="numeric" maxLength={ADDRESS_LIMITS.postalCode} value={value.postalCode}
          onChange={set("postalCode")} className={inputClassName} />
        <input id={`${idPrefix}-city`} aria-label="Ort" placeholder="Ort" autoComplete="address-level2"
          maxLength={ADDRESS_LIMITS.city} value={value.city} onChange={set("city")} className={inputClassName} />
      </div>
      <input id={`${idPrefix}-country`} aria-label="Land" placeholder="Land" autoComplete="country-name"
        maxLength={ADDRESS_LIMITS.country} value={value.country} onChange={set("country")}
        className={inputClassName} />
    </fieldset>
  );
}
