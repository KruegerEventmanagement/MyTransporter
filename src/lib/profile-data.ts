/**
 * Laden/Speichern der eigenen Stammdaten (Geburtsdatum, Anschrift).
 * Schutz vor Datenverlust: Gespeichert wird nur, wenn das Profil vorher
 * erfolgreich geladen wurde – sonst würden leere Formularwerte echte
 * Angaben mit NULL überschreiben.
 */
import { addressProfileColumns, EMPTY_ADDRESS, type AddressInput } from "@/lib/address";

export type ProfileLoadStatus = "loading" | "ok" | "missing" | "error";

export const PROFILE_SELECT =
  "first_name, last_name, email, phone, birth_date, address_street, address_postal_code, address_city, address_country";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadOwnProfile(db: any, userId: string): Promise<{ status: ProfileLoadStatus; row: any | null }> {
  try {
    const { data, error } = await db.from("profiles").select(PROFILE_SELECT).eq("id", userId).maybeSingle();
    if (error) return { status: "error", row: null };
    return data ? { status: "ok", row: data } : { status: "missing", row: null };
  } catch {
    return { status: "error", row: null };
  }
}

export function addressFromRow(row: any | null): AddressInput {
  if (!row) return EMPTY_ADDRESS;
  return {
    street: row.address_street ?? "",
    postalCode: row.address_postal_code ?? "",
    city: row.address_city ?? "",
    country: row.address_country ?? "",
  };
}

export type SaveResult =
  | { ok: true; patch: Record<string, string | null> }
  | { ok: false; message: string };

export async function saveOwnProfileData(
  db: any,
  userId: string | null | undefined,
  status: ProfileLoadStatus,
  birthDate: string,
  address: AddressInput,
): Promise<SaveResult> {
  if (status !== "ok") {
    return { ok: false, message: "Deine Daten wurden nicht geladen. Bitte erst erneut laden – es wurde nichts gespeichert." };
  }
  if (!userId) return { ok: false, message: "Sitzung abgelaufen. Bitte neu anmelden – es wurde nichts gespeichert." };
  const patch = { birth_date: birthDate || null, ...addressProfileColumns(address) };
  try {
    const { data, error } = await db.from("profiles").update(patch).eq("id", userId).select("id");
    if (error || !Array.isArray(data) || data.length === 0) {
      return { ok: false, message: "Speichern fehlgeschlagen. Bitte später erneut versuchen." };
    }
  } catch {
    return { ok: false, message: "Speichern fehlgeschlagen. Bitte später erneut versuchen." };
  }
  return { ok: true, patch };
}
