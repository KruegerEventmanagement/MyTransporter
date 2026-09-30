/**
 * Fahrzeugfakten für die Anzeige: nur hinterlegte Werte, keine Schätzungen.
 * Sonderhinweise werden per Fahrzeug-ID vergeben, nie pauschal je Klasse.
 */

/** Auf 100 km/h gedrosselt: ausschließlich LEO MY 102. */
export const SPEED_LIMITED_VEHICLE_IDS: ReadonlySet<string> = new Set([
  "02220fa6-9a77-4069-8a24-f7028365808b",
]);
export const SPEED_LIMIT_BADGE = "Auf 100 km/h gedrosselt";
export const SPEED_LIMIT_TEXT = "Dieser Transporter fährt maximal 100 km/h.";

export function isSpeedLimited(v: { id?: string | null } | null | undefined): boolean {
  return !!v?.id && SPEED_LIMITED_VEHICLE_IDS.has(v.id);
}

export type SpecField =
  | "payload_kg"
  | "cargo_height_cm"
  | "cargo_volume_m3"
  | "cargo_length_cm"
  | "cargo_width_cm"
  | "max_weight_kg"
  | "tank_liters"
  | "range_km"
  | "body"
  | "power_kw"
  | "first_registration";

/** Hinterlegte, aber noch nicht dokumentgeprüfte/unplausible Werte → „noch nicht bestätigt“. */
export const UNCONFIRMED_SPECS: Record<string, SpecField[]> = {
  // VW Crafter OF-DK 1234: seit 30.09.2026 per Fahrzeugschein bestätigt (lang, Hochdach) – kein Eintrag mehr.
};

/** Nutzlast rechnerisch aus Fahrzeugschein (zGG − max. Leergewicht), nicht Herstellerangabe. */
export const PAYLOAD_CALCULATED_IDS = new Set(["43261a5f-cd8a-4bd4-a3db-f89c4741c463"]);

export const UNCONFIRMED_LABEL = "noch nicht bestätigt";

export type SpecVehicle = {
  id: string;
  fuel_type?: string | null;
  power_kw?: number | null;
  seats?: number | null;
  max_weight_kg?: number | null;
  payload_kg?: number | null;
  trailer_load_braked_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  cargo_length_cm?: number | null;
  cargo_width_cm?: number | null;
  cargo_height_cm?: number | null;
  cargo_volume_m3?: number | null;
  cargo_width_between_arches_cm?: number | null;
  rear_door_width_cm?: number | null;
  rear_door_height_cm?: number | null;
  side_door_width_cm?: number | null;
  side_door_height_cm?: number | null;
  specs_status?: string | null;
  specs_source?: string | null;
  tank_liters?: number | null;
  range_km?: number | null;
  first_registration?: string | null;
  pickup_location?: string | null;
  pickup_address?: string | null;
};

export type SpecRow = { label: string; value: string; unconfirmed?: boolean };

const pos = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
/** cm (0,1-genau) → Meter mit bis zu 3 Nachkommastellen, ohne auf volle cm zu runden. */
const m = (cm: number) => `${(Number(cm) / 100).toLocaleString("de-DE", { maximumFractionDigits: 3 })} m`;
const kg = (n: number) => `${n.toLocaleString("de-DE")} kg`;

function fmtDate(iso: string): string | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return r ? `${r[3]}.${r[2]}.${r[1]}` : null;
}

/** Steckbrief-Zeilen: leere Werte ausgeblendet, unbestätigte als solche markiert. */
export function vehicleSpecRows(v: SpecVehicle): SpecRow[] {
  const unc = new Set(UNCONFIRMED_SPECS[v.id] ?? []);
  const rows: SpecRow[] = [];
  const add = (label: string, value: string | null, fields: SpecField[] = []) => {
    if (!value) return;
    if (fields.some((f) => unc.has(f))) rows.push({ label, value: UNCONFIRMED_LABEL, unconfirmed: true });
    else rows.push({ label, value });
  };
  add("Ladefläche (L × B)", pos(v.cargo_length_cm) && pos(v.cargo_width_cm) ? `${m(v.cargo_length_cm)} × ${m(v.cargo_width_cm)}` : null, ["cargo_length_cm", "cargo_width_cm"]);
  add("Breite zwischen Radkästen", pos(v.cargo_width_between_arches_cm) ? m(v.cargo_width_between_arches_cm) : null, ["body"]);
  add("Innenhöhe", pos(v.cargo_height_cm) ? m(v.cargo_height_cm) : null, ["cargo_height_cm"]);
  add("Ladevolumen", pos(v.cargo_volume_m3) ? `${Number(v.cargo_volume_m3).toLocaleString("de-DE")} m³` : null, ["cargo_volume_m3"]);
  add("Hecktüröffnung (B × H)", pos(v.rear_door_width_cm) && pos(v.rear_door_height_cm) ? `${m(v.rear_door_width_cm)} × ${m(v.rear_door_height_cm)}` : null, ["body"]);
  add("Schiebetüröffnung (B × H)", pos(v.side_door_width_cm) && pos(v.side_door_height_cm) ? `${m(v.side_door_width_cm)} × ${m(v.side_door_height_cm)}` : null, ["body"]);
  add("Außenmaße (L × B ohne Spiegel × H)", pos(v.length_cm) && pos(v.width_cm) && pos(v.height_cm) ? `${m(v.length_cm)} × ${m(v.width_cm)} × ${m(v.height_cm)}` : null, ["body"]);
  add("Nutzlast", pos(v.payload_kg) ? (PAYLOAD_CALCULATED_IDS.has(v.id) ? `ca. ${kg(v.payload_kg)} (rechnerisch aus Fahrzeugschein)` : kg(v.payload_kg)) : null, ["payload_kg"]);
  add("Zul. Gesamtgewicht", pos(v.max_weight_kg) ? kg(v.max_weight_kg) : null, ["max_weight_kg"]);
  add("Tankgröße", pos(v.tank_liters) ? `${v.tank_liters} l` : null, ["tank_liters"]);
  add("Reichweite", pos(v.range_km) ? `ca. ${v.range_km.toLocaleString("de-DE")} km` : null, ["range_km"]);
  add("Kraftstoff", v.fuel_type?.trim() || null);
  add("Leistung", pos(v.power_kw) ? `${v.power_kw} kW (${Math.round(v.power_kw * 1.36)} PS)` : null, ["power_kw"]);
  add("Sitzplätze", pos(v.seats) ? String(v.seats) : null);
  add("Anhängelast (gebremst)", pos(v.trailer_load_braked_kg) ? kg(v.trailer_load_braked_kg) : null);
  add("Erstzulassung", v.first_registration ? fmtDate(v.first_registration) : null, ["first_registration"]);
  add("Abholort", v.pickup_address?.trim() || v.pickup_location?.trim() || null);
  return rows;
}

/** Hinweis zur Herkunft der Maße (unter dem Steckbrief). */
export function vehicleSpecNote(v: SpecVehicle): string | null {
  if (UNCONFIRMED_SPECS[v.id]?.includes("body") || v.specs_status === "unbestaetigt") {
    return "Karosserievariante und Maße dieses Transporters sind noch nicht anhand der Fahrzeugpapiere bestätigt.";
  }
  if (v.specs_status === "werksangabe_modellvariante") {
    return `Werksmaße der Modellvariante${v.specs_source ? ` (Quelle: ${v.specs_source})` : ""}. Innenverkleidung/Ausbau können nutzbare Maße verringern. Bei passgenauer Ladung bitte nachmessen. Die Außenhöhe schwankt je nach Fahrwerk und Bereifung und ist keine garantierte Durchfahrtshöhe.`;
  }
  return null;
}
