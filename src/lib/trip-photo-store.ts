/**
 * Fahrtfotos (Abholung/Rückgabe): Erfolg erst nach bestätigtem Storage-Upload
 * UND geprüftem Datenbankeintrag. Vorschaubilder immer über signierte URLs,
 * nie über rohe private Storage-Pfade.
 */

export const TRIP_PHOTO_BUCKET = "trip-photos";
const SIGNED_URL_TTL = 60 * 60;

export function tripPhotoPath(bookingId: string, tag: string, mime = "image/jpeg"): string {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : /hei[cf]/i.test(mime) ? "heic" : "jpg";
  return `${bookingId}/${tag}_${id}.${extension}`;
}

async function bounded<T>(task: PromiseLike<T>, timeoutMs = 45000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(task), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("PHOTO_NETWORK_TIMEOUT")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

function photoFailure(error: unknown, fallback: string): string {
  const detail = error as { statusCode?: string | number; status?: number; message?: string; code?: string } | null;
  const status = String(detail?.statusCode ?? detail?.status ?? "");
  if (status === "401" || /jwt|token.*expired|not authenticated/i.test(detail?.message ?? "")) {
    return "Deine Anmeldung ist abgelaufen. Bitte erneut anmelden. Das Foto bleibt für einen erneuten Versuch erhalten.";
  }
  if (status === "413" || /maximum.*size|too large|exceeded.*size/i.test(detail?.message ?? "")) return "Das Foto ist für den Upload zu groß. Bitte mit der Geräte-Kamera neu aufnehmen.";
  if (status === "403" || detail?.code === "42501" || /row.level.security/i.test(detail?.message ?? "")) return "Das Foto wurde nicht freigegeben. Bitte die Anmeldung und die eigene Buchung prüfen und erneut versuchen.";
  return fallback;
}

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
    const { data, error } = await bounded(client.storage
      .from(TRIP_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL), 10000);
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
    timeoutMs?: number;
    onStage?: (stage: "upload" | "record" | "confirmed") => void;
  },
): Promise<StoredTripPhoto> {
  let path = args.uploadedPath ?? null;
  if (!path) {
    const candidate = args.path ?? tripPhotoPath(args.bookingId, args.tag, args.file.type);
    args.onStage?.("upload");
    let upErr: unknown = null;
    try {
      // Bytes avoid Safari's fragile Blob/FormData transport and preserve the
      // explicit MIME type (Storage SDK ignores contentType for Blob bodies).
      const bytes = new Uint8Array(await bounded(args.file.arrayBuffer(), args.timeoutMs));
      if (!bytes.byteLength) throw new Error("empty photo");
      const res = await bounded(client.storage
        .from(TRIP_PHOTO_BUCKET)
        .upload(candidate, bytes, {
          contentType: /^image\//.test(args.file.type) ? args.file.type : "image/jpeg",
          upsert: false,
        }), args.timeoutMs);
      upErr = res.error;
    } catch (e) {
      upErr = e;
    }
    // Verlorene Antwort beim ersten Versuch: Datei liegt schon unter genau diesem Pfad.
    // Nur als hochgeladen werten, wenn das Objekt unter genau diesem Kandidatenpfad
    // tatsächlich lesbar ist (Storage erlaubt kein Upsert/Überschreiben).
    let alreadyThere =
      !!args.path && !!upErr && /exist|duplicate/i.test(String((upErr as { message?: string })?.message ?? upErr));
    if (alreadyThere) alreadyThere = (await signTripPhoto(client, candidate)) !== null;
    if (upErr && !alreadyThere) {
      throw new TripPhotoError(
        photoFailure(upErr, "Das Foto konnte nicht hochgeladen werden. Bitte Internetverbindung prüfen und erneut versuchen."),
        "upload",
        null,
      );
    }
    path = candidate;
  }

  let recordOk = false;
  args.onStage?.("record");
  // Retry nach verlorener Antwort: gibt es den Eintrag für genau diesen Pfad schon?
  if (args.uploadedPath || args.path) {
    try {
      const { data: existing, error } = await bounded(client
        .from("trip_photos")
        .select("id")
        .eq("booking_id", args.bookingId)
        .eq("photo_url", path)
        .maybeSingle(), args.timeoutMs);
      if (!error && existing) { args.onStage?.("confirmed"); return { path, url: await signTripPhoto(client, path) }; }
    } catch {
      /* dann regulär eintragen */
    }
  }
  try {
    const { data, error } = await bounded(client
      .from("trip_photos")
      .insert({ booking_id: args.bookingId, photo_url: path, photo_type: args.tag })
      .select("id")
      .single(), args.timeoutMs);
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

  args.onStage?.("confirmed");
  return { path, url: await signTripPhoto(client, path) };
}

export interface TripPhotoRow {
  photo_type: string;
  photo_url: string;
}

export class BookingUpdateError extends Error {
  readonly kind: "locked" | "network" | "rejected";

  constructor(kind: "locked" | "network" | "rejected") {
    super(
      kind === "network"
        ? "Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen."
        : kind === "locked"
          ? "Der aktuelle Stand der Rückgabe wird neu geladen."
          : "Speichern wurde abgelehnt. Bitte erneut versuchen.",
    );
    this.name = "BookingUpdateError";
    this.kind = kind;
  }
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
  try {
    const { data, error } = await client
      .from("bookings")
      .update(values)
      .eq("id", bookingId)
      .select("id");
    if (error) {
      const detail = String((error as { code?: string; message?: string }).message ?? "");
      const code = String((error as { code?: string }).code ?? "");
      if (code === "42501" || detail.includes("TRIP_FIELD_LOCKED") || detail.includes("TRIP_STATUS_LOCKED")) {
        throw new BookingUpdateError("locked");
      }
      throw new BookingUpdateError("rejected");
    }
    if (!Array.isArray(data) || data.length === 0) throw new BookingUpdateError("rejected");
  } catch (error) {
    if (error instanceof BookingUpdateError) throw error;
    throw new BookingUpdateError("network");
  }
}
