/**
 * Fahrtfotos (Abholung/Rückgabe): Erfolg erst nach bestätigtem Storage-Upload
 * UND geprüftem Datenbankeintrag. Vorschaubilder immer über signierte URLs,
 * nie über rohe private Storage-Pfade.
 */

export const TRIP_PHOTO_BUCKET = "trip-photos";
const SIGNED_URL_TTL = 60 * 60;

export interface StoredTripPhoto {
  /** Storage-Pfad im privaten Bucket. */
  path: string;
  /** Signierte Vorschau-URL; null, wenn die Vorschau gerade nicht ladbar ist. */
  url: string | null;
}

export class TripPhotoError extends Error {
  constructor(
    message: string,
    public readonly stage: "upload" | "record",
    /** Bereits hochgeladener Pfad – Retry trägt dann nur noch den DB-Eintrag nach. */
    public readonly uploadedPath: string | null,
  ) {
    super(message);
    this.name = "TripPhotoError";
  }
}

// Bewusst locker typisiert: nur die genutzten Methoden, damit Tests vollständig mocken können.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TripPhotoClient {
  from: (table: any) => any;
  storage: { from: (bucket: string) => any };
}
type Client = TripPhotoClient;

export async function signTripPhoto(client: Client, path: string): Promise<string | null> {
  if (/^(https?:|data:)/.test(path)) return path;
  try {
    const { data, error } = await client.storage
      .from(TRIP_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function saveTripPhoto(
  client: Client,
  args: {
    bookingId: string;
    tag: string;
    file: Blob;
    uploadedPath?: string | null;
    /** Stabiler Zielpfad (Warteschlange). Ein "existiert bereits" gilt dann als hochgeladen. */
    path?: string;
  },
): Promise<StoredTripPhoto> {
  let path = args.uploadedPath ?? null;
  if (!path) {
    const candidate = args.path ?? `${args.bookingId}/${args.tag}_${Date.now()}.jpg`;
    let upErr: unknown = null;
    try {
      const res = await client.storage
        .from(TRIP_PHOTO_BUCKET)
        .upload(candidate, args.file, { contentType: "image/jpeg", upsert: false });
      upErr = res.error;
    } catch (e) {
      upErr = e;
    }
    // Verlorene Antwort beim ersten Versuch: Datei liegt schon unter genau diesem Pfad.
    const alreadyThere =
      !!args.path && !!upErr && /exist|duplicate/i.test(String((upErr as { message?: string })?.message ?? upErr));
    if (upErr && !alreadyThere) {
      throw new TripPhotoError(
        "Das Foto konnte nicht hochgeladen werden. Bitte Internetverbindung prüfen und erneut versuchen.",
        "upload",
        null,
      );
    }
    path = candidate;
  }

  let recordOk = false;
  // Retry nach verlorener Antwort: gibt es den Eintrag für genau diesen Pfad schon?
  if (args.uploadedPath || args.path) {
    try {
      const { data: existing, error } = await client
        .from("trip_photos")
        .select("id")
        .eq("booking_id", args.bookingId)
        .eq("photo_url", path)
        .maybeSingle();
      if (!error && existing) return { path, url: await signTripPhoto(client, path) };
    } catch {
      /* dann regulär eintragen */
    }
  }
  try {
    const { data, error } = await client
      .from("trip_photos")
      .insert({ booking_id: args.bookingId, photo_url: path, photo_type: args.tag })
      .select("id")
      .single();
    recordOk = !error && !!data;
  } catch {
    recordOk = false;
  }
  if (!recordOk) {
    throw new TripPhotoError(
      "Das Foto wurde hochgeladen, aber nicht gespeichert. Bitte erneut versuchen.",
      "record",
      path,
    );
  }

  return { path, url: await signTripPhoto(client, path) };
}

export interface TripPhotoRow {
  photo_type: string;
  photo_url: string;
}

export async function loadTripPhotos(
  client: Client,
  bookingId: string,
  prefixes: string[],
): Promise<Array<TripPhotoRow & { url: string | null }>> {
  const { data, error } = await client
    .from("trip_photos")
    .select("photo_type, photo_url, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Gespeicherte Fotos konnten nicht geladen werden.");
  const rows = ((data ?? []) as TripPhotoRow[]).filter((r) =>
    prefixes.some((p) => r.photo_type.startsWith(p)),
  );
  return Promise.all(
    rows.map(async (r) => ({ ...r, url: await signTripPhoto(client, r.photo_url) })),
  );
}

/** Prüft, dass ein Buchungs-Update tatsächlich eine Zeile getroffen hat. */
export async function updateBookingChecked(
  client: Client,
  bookingId: string,
  values: Record<string, unknown>,
): Promise<void> {
  let ok = false;
  try {
    const { data, error } = await client
      .from("bookings")
      .update(values)
      .eq("id", bookingId)
      .select("id");
    ok = !error && Array.isArray(data) && data.length > 0;
  } catch {
    ok = false;
  }
  if (!ok)
    throw new Error(
      "Speichern fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.",
    );
}
