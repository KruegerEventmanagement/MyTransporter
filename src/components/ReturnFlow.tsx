import { isPhysicalAddon } from "@/lib/custom-km";
import { DocumentationFeeNotice } from "./DocumentationFeeNotice";
import {
  EXCEPTION_KIND_LABEL,
  exceptionKind,
  stripExceptionKind,
  withExceptionKind,
  type ExceptionKind,
} from "@/lib/documentation-fee";
import { useState, useCallback, useEffect, useRef } from "react";
import { Camera, ChevronRight, Key, AlertTriangle, Plus, X, ScanLine, Fuel, CloudOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture, type SilhouetteVariant } from "./CameraCapture";
import { TripErrorBanner, TripPhotoThumb } from "./TripPhotoParts";
import {
  loadTripPhotos,
  saveTripPhoto,
  TripPhotoError,
  BookingUpdateError,
  updateBookingChecked,
  type StoredTripPhoto,
} from "@/lib/trip-photo-store";
import { useServerFn } from "@tanstack/react-start";
import { recognizeOdometer } from "@/lib/odometer-ai.functions";
import { reportReturn } from "@/lib/trip-return.functions";
import {
  evaluateReturnKm,
  validReason,
  MIN_REASON_LENGTH,
  RETURN_FUEL_TAG,
  RETURN_INTERIOR_TAG,
  RETURN_ODOMETER_TAG,
  RETURN_RECEIPT_TAG,
  type ExceptionKey,
  type ReturnExceptions,
} from "@/lib/trip-return";
import { loadReturnDraft, saveReturnDraft, type DraftStep } from "@/lib/return-draft";
import {
  enqueuePhoto,
  openIdbQueueStore,
  QueueUnavailableError,
  transferQueuedPhoto,
  type QueueStore,
} from "@/lib/photo-queue";

const TEST_MODE_ADMIN_EMAIL = "krueger.christian96@gmx.de";

export const RETURN_DOCUMENTATION_NOTICE =
  "Bitte dokumentiere die Rückgabe vollständig. Bei fehlenden oder unleserlichen Nachweisen kann eine zusätzliche Prüfung erforderlich sein. Nachvollziehbar belegte und rechtlich berechtigte Forderungen aus dem Mietvertrag können nach Prüfung mit deiner Kaution verrechnet werden.";

const PHOTO_SIDES = [
  { id: "post_front", label: "Vorne", icon: "⬆️", variant: "front" as SilhouetteVariant },
  { id: "post_front_right", label: "Vorne rechts", icon: "↗️", variant: "three-quarter-front-right" as SilhouetteVariant },
  { id: "post_right", label: "Rechte Seite", icon: "➡️", variant: "side-right" as SilhouetteVariant },
  { id: "post_back_right", label: "Hinten rechts", icon: "↘️", variant: "three-quarter-back-right" as SilhouetteVariant },
  { id: "post_back", label: "Hinten", icon: "⬇️", variant: "back" as SilhouetteVariant },
  { id: "post_back_left", label: "Hinten links", icon: "↙️", variant: "three-quarter-back-left" as SilhouetteVariant },
  { id: "post_left", label: "Linke Seite", icon: "⬅️", variant: "side-left" as SilhouetteVariant },
  { id: "post_front_left", label: "Vorne links", icon: "↖️", variant: "three-quarter-front-left" as SilhouetteVariant },
] as const;

interface ReturnFlowProps {
  bookingId: string;
  planId?: string;
  startKm?: number | null;
  freeKm?: number | null;
  kmPriceCents?: number | null;
  addons?: Array<{ id: string; label: string; price_cents: number }>;
  onComplete: (returnCode: string) => void;
  /** Für Entwurf + Foto-Warteschlange (pro Nutzer isoliert). Ohne: direkter Online-Upload. */
  userId?: string | null;
  /** Serverseitig bereits gespeicherter Rückgabecode (Status returning). */
  serverReturnCode?: string | null;
  /** Lädt den aktuellen Serverstand, falls ein Entwurfs-Update bereits überholt ist. */
  onBookingRefresh?: () => Promise<void>;
}

type CaptureTarget =
  | { kind: "side"; id: string }
  | { kind: "interior" }
  | { kind: "damage" }
  | { kind: "odometer" }
  | { kind: "fuel" }
  | { kind: "receipt" };

type ReturnStep = DraftStep | "done";
/** Nur Aufnahmen, deren IndexedDB-Transaktion abgeschlossen ist, erscheinen hier (dauerhaft lokal gesichert). */
type PendingState = { id: string; tag: string; status: "local" | "uploading" | "error"; preview: string | null; message?: string };

const tagOf = (t: CaptureTarget) =>
  t.kind === "side"
    ? t.id
    : t.kind === "interior"
      ? RETURN_INTERIOR_TAG
      : t.kind === "damage"
        ? "post_damage"
        : t.kind === "odometer"
          ? RETURN_ODOMETER_TAG
          : t.kind === "fuel"
            ? RETURN_FUEL_TAG
            : RETURN_RECEIPT_TAG;

const targetOfTag = (tag: string): CaptureTarget =>
  tag === RETURN_INTERIOR_TAG
    ? { kind: "interior" }
    : tag === "post_damage"
      ? { kind: "damage" }
      : tag === RETURN_ODOMETER_TAG
        ? { kind: "odometer" }
        : tag === RETURN_FUEL_TAG
          ? { kind: "fuel" }
          : tag === RETURN_RECEIPT_TAG
            ? { kind: "receipt" }
            : { kind: "side", id: tag };

function makePreview(blob: Blob): string | null {
  try {
    return typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export function ReturnFlow({
  bookingId,
  planId,
  startKm,
  freeKm,
  kmPriceCents,
  addons: allAddons,
  onComplete,
  userId,
  serverReturnCode,
  onBookingRefresh,
}: ReturnFlowProps) {
  // Kilometerpaket ist kein physisches Zubehör und wird nicht "zurückgegeben".
  const addons = allAddons?.filter(isPhysicalAddon);
  const draft0 = useRef(userId ? loadReturnDraft(userId, bookingId) : null).current;
  const initialCode = serverReturnCode ?? draft0?.returnCode ?? null;
  const [returnStep, setReturnStep] = useState<ReturnStep>(initialCode ? "code" : (draft0?.step ?? "photos"));
  const [photos, setPhotos] = useState<Record<string, StoredTripPhoto>>({});
  const [interiorPhoto, setInteriorPhoto] = useState<StoredTripPhoto | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<StoredTripPhoto[]>([]);
  const [odometerPhoto, setOdometerPhoto] = useState<StoredTripPhoto | null>(null);
  const [fuelPhoto, setFuelPhoto] = useState<StoredTripPhoto | null>(null);
  const [endKm, setEndKm] = useState(draft0?.endKm ?? "");
  const [endKmManual, setEndKmManual] = useState(draft0?.endKmManual ?? false);
  const [receiptPhoto, setReceiptPhoto] = useState<StoredTripPhoto | null>(null);
  const [exceptions, setExceptions] = useState<ReturnExceptions>(draft0?.exceptions ?? {});
  const [openException, setOpenException] = useState<ExceptionKey | null>(null);
  const [photoError, setPhotoError] = useState<{
    message: string;
    target: CaptureTarget;
    file: Blob;
    uploadedPath: string | null;
    queueId?: string;
  } | null>(null);
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnCode, setReturnCode] = useState<string | null>(initialCode);
  const [reportPending, setReportPending] = useState(draft0?.reportPending ?? false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Erhöht sich nach jedem abgeschlossenen Warteschlangen-Durchlauf (Reconnect/Start). */
  const [syncTick, setSyncTick] = useState(0);
  const [kmLocalOnly, setKmLocalOnly] = useState(false);
  const [awaitingAdmin, setAwaitingAdmin] = useState(!!initialCode);
  const [isAdmin, setIsAdmin] = useState(false);
  const [aiRecognition, setAiRecognition] = useState<{ km: number | null; fuelPercent: number | null; confidence: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [endFuelPercent, setEndFuelPercent] = useState<string>(draft0?.endFuelPercent ?? "");
  const [fuelManual, setFuelManual] = useState(!!draft0?.endFuelPercent);
  const [addonsReturned, setAddonsReturned] = useState(draft0?.addonsReturned ?? false);
  const recognize = useServerFn(recognizeOdometer);
  const report = useServerFn(reportReturn);
  const [kmSummary, setKmSummary] = useState<ReturnType<typeof evaluateReturnKm> | null>(null);
  const [currentTarget, setCurrentTarget] = useState<CaptureTarget | null>(null);
  const storeRef = useRef<QueueStore | null>(null);
  const endKmManualRef = useRef(endKmManual);
  endKmManualRef.current = endKmManual;
  const fuelManualRef = useRef(fuelManual);
  fuelManualRef.current = fuelManual;

  // Entwurf fortlaufend sichern (nicht erst beim Verlassen).
  useEffect(() => {
    if (!userId || returnStep === "done") return;
    saveReturnDraft(userId, bookingId, {
      started: true,
      step: returnStep,
      endKm,
      endKmManual,
      endFuelPercent,
      exceptions,
      addonsReturned,
      returnCode,
      reportPending,
    });
  }, [userId, bookingId, returnStep, endKm, endKmManual, endFuelPercent, exceptions, addonsReturned, returnCode, reportPending]);

  // Server-Code hat Vorrang (z. B. nach verlorener Antwort).
  useEffect(() => {
    if (serverReturnCode && serverReturnCode !== returnCode) {
      setReturnCode(serverReturnCode);
      setReportPending(false);
      setAwaitingAdmin(true);
      setReturnStep("code");
    }
  }, [serverReturnCode, returnCode]);

  const applySaved = useCallback((tag: string, saved: StoredTripPhoto) => {
    const t = targetOfTag(tag);
    if (t.kind === "side") setPhotos((prev) => ({ ...prev, [t.id]: saved }));
    else if (t.kind === "interior") setInteriorPhoto(saved);
    else if (t.kind === "damage") setDamagePhotos((prev) => (prev.some((p) => p.path === saved.path) ? prev : [...prev, saved]));
    else if (t.kind === "odometer") setOdometerPhoto(saved);
    else if (t.kind === "fuel") setFuelPhoto(saved);
    else setReceiptPhoto(saved);
  }, []);

  // Bereits bestätigte Rückgabe-Fotos (inkl. Tacho, Tank, Beleg) wiederherstellen
  useEffect(() => {
    let mounted = true;
    setLoadError(null);
    (async () => {
      try {
        const rows = await loadTripPhotos(supabase, bookingId, ["post_", "tank_receipt"]);
        if (!mounted) return;
        const sides: Record<string, StoredTripPhoto> = {};
        const damages: StoredTripPhoto[] = [];
        let interior: StoredTripPhoto | null = null;
        let odometer: StoredTripPhoto | null = null;
        let fuel: StoredTripPhoto | null = null;
        let receipt: StoredTripPhoto | null = null;
        for (const row of rows) {
          const photo = { path: row.photo_url, url: row.url };
          if (row.photo_type === RETURN_INTERIOR_TAG) interior = photo;
          else if (row.photo_type === RETURN_ODOMETER_TAG) odometer = photo;
          else if (row.photo_type === RETURN_FUEL_TAG) fuel = photo;
          else if (row.photo_type === RETURN_RECEIPT_TAG) receipt = photo;
          else if (row.photo_type === "post_damage") damages.push(photo);
          else sides[row.photo_type] = photo;
        }
        if (Object.keys(sides).length) setPhotos((prev) => ({ ...sides, ...prev }));
        if (interior) setInteriorPhoto((prev) => prev ?? interior);
        if (odometer) setOdometerPhoto((prev) => prev ?? odometer);
        if (fuel) setFuelPhoto((prev) => prev ?? fuel);
        if (receipt) setReceiptPhoto((prev) => prev ?? receipt);
        if (damages.length) setDamagePhotos((prev) => (prev.length ? prev : damages.slice(-4)));
      } catch (err) {
        if (mounted) setLoadError(err instanceof Error ? err.message : "Gespeicherte Fotos konnten nicht geladen werden.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bookingId, loadAttempt]);

  const pendingTags = useRef<Record<string, string>>({});
  const transfer = useCallback(
    async (id: string, tag: string) => {
      const store = storeRef.current;
      if (!store) return;
      setPending((p) => (p[id] ? { ...p, [id]: { ...p[id]!, status: "uploading" } } : p));
      try {
        const saved = await transferQueuedPhoto(supabase, store, id);
        delete pendingTags.current[id];
        setPending((p) => {
          const { [id]: done, ...rest } = p;
          if (done?.preview) URL.revokeObjectURL?.(done.preview);
          return rest;
        });
        applySaved(tag, saved);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Übertragung fehlgeschlagen.";
        setPending((p) => (p[id] ? { ...p, [id]: { ...p[id]!, status: "error", message } } : p));
      }
    },
    [applySaved],
  );

  /** Überträgt alle lokal gesicherten Aufnahmen; löst erst auf, wenn alle Versuche beendet sind. */
  const transferAll = useCallback(async () => {
    await Promise.allSettled(Object.entries(pendingTags.current).map(([id, tag]) => transfer(id, tag)));
  }, [transfer]);

  // Warteschlange öffnen, offene Aufnahmen anzeigen und übertragen; bei online erneut.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const store = await openIdbQueueStore();
      if (!alive) return;
      storeRef.current = store;
      if (!store) {
        setQueueNotice("Fotos können auf diesem Gerät nicht zwischengespeichert werden. Sie werden direkt online übertragen – bitte mit Verbindung aufnehmen.");
        return;
      }
      const items = await store.list(userId, bookingId).catch(() => []);
      if (!alive) return;
      const next: Record<string, PendingState> = {};
      for (const it of items) {
        pendingTags.current[it.id] = it.tag;
        next[it.id] = { id: it.id, tag: it.tag, status: "local", preview: makePreview(it.blob) };
      }
      setPending((p) => ({ ...next, ...p }));
      await transferAll();
      if (alive) setSyncTick((n) => n + 1);
    })();
    // Reconnect: ERST die Warteschlange abarbeiten, dann ggf. die beauftragte Meldung wiederholen.
    const onOnline = () => {
      void transferAll().then(() => {
        if (alive) setSyncTick((n) => n + 1);
      });
    };
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
    };
  }, [userId, bookingId, transfer, transferAll]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted || !userData.user) return;
      setIsAdmin(userData.user.email?.toLowerCase() === TEST_MODE_ADMIN_EMAIL.toLowerCase());
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auf Admin-Bestätigung warten: Realtime + Fallback-Polling auf bookings.status
  useEffect(() => {
    if (!awaitingAdmin || !returnCode) return;
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      onComplete(returnCode);
    };
    const check = async () => {
      const { data } = await supabase.from("bookings").select("status").eq("id", bookingId).maybeSingle();
      if (data?.status === "completed") finish();
    };
    check();
    const poll = setInterval(check, 5000);
    const channel = supabase
      .channel(`booking-status-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        (payload) => {
          const next = (payload.new as { status?: string } | null)?.status;
          if (next === "completed") finish();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [awaitingAdmin, returnCode, bookingId, onComplete]);

  // Lokal DAUERHAFT gesicherte Aufnahmen erlauben das Weitergehen im Entwurf.
  // Serverseitig zählen weiterhin nur bestätigte Storage+DB-Fotos (report_trip_return).
  const localTags = new Set(Object.values(pending).map((p) => p.tag));
  const allSidesTaken = PHOTO_SIDES.every((s) => photos[s.id] || localTags.has(s.id));
  const interiorTaken = !!interiorPhoto || localTags.has(RETURN_INTERIOR_TAG);
  const photosException = validReason(exceptions.photos);
  const photosReady = (allSidesTaken && interiorTaken) || photosException;
  const pendingCount = Object.keys(pending).length;

  const fillTestPhotos = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`,
      );
    const test = { path: "admin-test", url: placeholder };
    const next: Record<string, StoredTripPhoto> = {};
    PHOTO_SIDES.forEach((s) => (next[s.id] = test));
    setPhotos(next);
    setInteriorPhoto(test);
  };

  const fillTestKm = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`,
      );
    setOdometerPhoto({ path: "admin-test", url: placeholder });
    setFuelPhoto({ path: "admin-test", url: placeholder });
    if (!endKm) setEndKm("42920");
  };

  const runOdometerAi = useCallback(
    async (path: string) => {
      setAiBusy(true);
      setAiRecognition(null);
      try {
        const result = await recognize({ data: { photoPath: path, bookingId, phase: "end" } });
        setAiRecognition({ km: result.km, fuelPercent: result.fuelPercent, confidence: result.confidence });
        // KI ist nur ein Vorschlag: manuelle Eingaben werden nie überschrieben.
        if (result.km !== null && result.confidence !== "low" && !endKmManualRef.current) setEndKm(String(result.km));
        if (result.fuelPercent !== null && result.confidence !== "low" && !fuelManualRef.current)
          setEndFuelPercent(String(result.fuelPercent));
      } catch (err) {
        console.warn("Odometer-KI nicht verfügbar", err);
      } finally {
        setAiBusy(false);
      }
    },
    [bookingId, recognize],
  );

  const savePhoto = useCallback(
    async (file: Blob, target: CaptureTarget, uploadedPath: string | null = null) => {
      setUploading(true);
      setPhotoError(null);
      const tag = tagOf(target);
      const store = storeRef.current;
      // Mit Warteschlange: erst sicher auf dem Gerät ablegen, dann übertragen.
      if (store && userId && !uploadedPath) {
        try {
          const item = await enqueuePhoto(store, { userId, bookingId, tag, blob: file });
          pendingTags.current[item.id] = tag;
          setPending((p) => ({ ...p, [item.id]: { id: item.id, tag, status: "local", preview: makePreview(file) } }));
          setCurrentTarget(null);
          setUploading(false);
          try {
            const saved = await transferQueuedPhoto(supabase, store, item.id);
            delete pendingTags.current[item.id];
            setPending((p) => {
              const { [item.id]: done, ...rest } = p;
              if (done?.preview) URL.revokeObjectURL?.(done.preview);
              return rest;
            });
            applySaved(tag, saved);
            if (target.kind === "odometer") void runOdometerAi(saved.path);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Übertragung fehlgeschlagen.";
            setPending((p) => (p[item.id] ? { ...p, [item.id]: { ...p[item.id]!, status: "error", message } } : p));
          }
          setSyncTick((n) => n + 1);
          return;
        } catch (err) {
          if (!(err instanceof QueueUnavailableError)) throw err;
          setQueueNotice(err.message);
          // ehrlich: kein Gerätespeicher → direkter Online-Upload
        }
      }
      try {
        // Erfolg erst nach Storage-Upload UND bestätigtem Datenbankeintrag.
        const saved = await saveTripPhoto(supabase, { bookingId, tag, file, uploadedPath });
        setCurrentTarget(null);
        applySaved(tag, saved);
        if (target.kind === "odometer") void runOdometerAi(saved.path);
      } catch (err) {
        console.error("Upload error:", err);
        setCurrentTarget(null);
        setPhotoError({
          message: err instanceof Error ? err.message : "Das Foto konnte nicht gespeichert werden.",
          target,
          file,
          uploadedPath: err instanceof TripPhotoError ? err.uploadedPath : uploadedPath,
        });
      } finally {
        setUploading(false);
      }
    },
    [bookingId, userId, applySaved, runOdometerAi],
  );

  const handleCapture = useCallback(
    async (file: File) => {
      if (!file || !currentTarget) return;
      await savePhoto(file, currentTarget);
    },
    [currentTarget, savePhoto],
  );

  const openCamera = (target: CaptureTarget) => {
    setPhotoError(null);
    setCurrentTarget(target);
  };

  const pendingList = Object.values(pending);
  const photoBanners = (
    <>
      {loadError && (
        <TripErrorBanner message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} retryLabel="Neu laden" />
      )}
      {queueNotice && <TripErrorBanner message={queueNotice} onDismiss={() => setQueueNotice(null)} />}
      {photoError && (
        <TripErrorBanner
          message={photoError.message}
          busy={uploading}
          onRetry={() => void savePhoto(photoError.file, photoError.target, photoError.uploadedPath)}
          onDismiss={() => setPhotoError(null)}
        />
      )}
      {pendingList.length > 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-secondary/60 p-4" data-testid="photo-queue">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <CloudOff className="w-4 h-4" /> {pendingList.length} Foto(s) noch nicht übertragen
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pendingList.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                {p.status === "uploading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3 rounded-full border border-foreground inline-block" />}
                <span>
                  {p.status === "uploading"
                    ? "Wird übertragen"
                    : p.status === "error"
                      ? `Auf diesem Gerät gespeichert · Übertragung fehlgeschlagen`
                      : "Auf diesem Gerät gespeichert"}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={transferAll}
            className="mt-3 min-h-11 rounded-full bg-foreground px-4 text-xs font-semibold text-background"
          >
            Jetzt übertragen
          </button>
        </div>
      )}
    </>
  );

  const notice = (
    <>
    <p className="mb-4 rounded-2xl border border-border p-3 text-xs leading-relaxed text-muted-foreground" data-testid="return-notice">
      {RETURN_DOCUMENTATION_NOTICE}
    </p>
    <DocumentationFeeNotice />
    </>
  );

  const exceptionBox = (key: ExceptionKey, label: string) => {
    const value = exceptions[key] ?? "";
    const open = openException === key || value.length > 0;
    const kind = exceptionKind(value);
    return (
      <div className="mb-4">
        {!open ? (
          <button type="button" onClick={() => setOpenException(key)} className="min-h-11 text-xs font-medium underline">
            {label}
          </button>
        ) : (
          <div className="rounded-2xl border border-border p-3" data-testid={`exception-${key}`}>
            <p className="text-xs font-medium text-foreground">{label} – was trifft zu?</p>
            <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={`${label}: Einordnung`}>
              {(["technical", "not_provided"] as ExceptionKind[]).map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-2 text-xs text-foreground">
                  <input
                    type="radio"
                    name={`ex-kind-${key}`}
                    checked={kind === k}
                    onChange={() => setExceptions((x) => ({ ...x, [key]: withExceptionKind(k, x[key] ?? "") }))}
                  />
                  {EXCEPTION_KIND_LABEL[k]}
                </label>
              ))}
            </div>
            {kind === "technical" && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid={`exception-${key}-technical`}>
                Technische Probleme lösen keine Bearbeitungspauschale aus. MyTransporter prüft den Fall manuell.
              </p>
            )}
            {kind === "not_provided" && (
              <div className="mt-2" data-testid={`exception-${key}-fee`}>
                <DocumentationFeeNotice compact />
              </div>
            )}
            {kind && (
              <>
                <label className="mt-2 block text-xs font-medium text-foreground" htmlFor={`ex-${key}`}>
                  Bitte kurz begründen (mind. {MIN_REASON_LENGTH} Zeichen). MyTransporter prüft das manuell.
                </label>
                <textarea
                  id={`ex-${key}`}
                  value={stripExceptionKind(value)}
                  maxLength={460}
                  onChange={(e) => setExceptions((x) => ({ ...x, [key]: withExceptionKind(kind, e.target.value) }))}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-2 text-sm"
                  rows={2}
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const cameraOpen = currentTarget !== null;
  const cameraVariant: SilhouetteVariant = (() => {
    if (!currentTarget) return "front";
    if (currentTarget.kind === "interior") return "interior";
    if (currentTarget.kind === "damage") return "damage";
    if (currentTarget.kind === "odometer" || currentTarget.kind === "fuel") return "damage";
    if (currentTarget.kind === "receipt") return "receipt";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.variant ?? "front";
  })();
  const cameraTitle: string = (() => {
    if (!currentTarget) return "";
    if (currentTarget.kind === "interior") return "Innenraum aufnehmen";
    if (currentTarget.kind === "damage") return "Schaden aufnehmen";
    if (currentTarget.kind === "odometer") return "Tacho / Kilometerstand fotografieren";
    if (currentTarget.kind === "fuel") return "Tankanzeige fotografieren";
    if (currentTarget.kind === "receipt") return "Tankbeleg scannen";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.label ?? "Foto aufnehmen";
  })();
  const cameraHint =
    currentTarget?.kind === "receipt"
      ? "Beleg in den Rahmen legen, wird automatisch gescannt"
      : currentTarget?.kind === "fuel"
        ? "Tankanzeige gut lesbar mittig aufnehmen"
        : "Richte das Fahrzeug an der Vorlage aus";

  const camera = (
    <CameraCapture
      open={cameraOpen}
      title={cameraTitle}
      hint={cameraHint}
      variant={cameraVariant}
      scanMode={currentTarget?.kind === "receipt"}
      onClose={() => setCurrentTarget(null)}
      onCapture={(file) => handleCapture(file)}
    />
  );

  const handleSubmitKm = async () => {
    if (saving) return;
    const end = Number(endKm);
    if (endKm.trim() === "" || !Number.isInteger(end) || end < 0) {
      setActionError("Bitte einen gültigen Kilometerstand eintragen.");
      return;
    }
    const km = evaluateReturnKm({ planId, startKm, endKm: end, freeKm, kmPriceCents });
    setSaving(true);
    setActionError(null);
    try {
      // Nur Entwurfsfelder, die der DB-Schutz während der Miete erlaubt.
      // Mehrkilometer/Preis werden ausschließlich serverseitig bei der Rückgabemeldung
      // aus den unveränderten Buchungs-Snapshots gesetzt.
      await updateBookingChecked(supabase, bookingId, {
        end_km: end,
        end_km_manual: endKmManual,
        ...(endFuelPercent !== "" ? { ai_end_fuel_percent: parseInt(endFuelPercent) } : {}),
      });
    } catch (err) {
      const offline =
        (typeof navigator !== "undefined" && navigator.onLine === false) ||
        (err instanceof BookingUpdateError && err.kind === "network");
      if (offline) {
        // Wert liegt im lokalen Entwurf; die Rückgabemeldung überträgt den Endstand ohnehin.
        setKmLocalOnly(true);
        setSaving(false);
        setKmSummary(km);
        setReturnStep("receipt");
        return;
      }
      if (err instanceof BookingUpdateError && err.kind === "locked" && onBookingRefresh) {
        try {
          await onBookingRefresh();
        } catch {
          // Die sichere Fehlermeldung unten bleibt bedienbar, auch wenn das Neuladen scheitert.
        }
      }
      setActionError(err instanceof Error ? `Kilometerstand nicht gespeichert. ${err.message}` : "Kilometerstand nicht gespeichert.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setKmLocalOnly(false);
    setKmSummary(km);
    setReturnStep("receipt");
  };

  const submittingRef = useRef(false);
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;

  /** Nur nach Nutzeraktion „Schlüssel zurückgeben“ (setzt reportPending) bzw. deren automatischer Wiederholung. */
  const submitReport = useCallback(async () => {
    if (submittingRef.current) return; // Doppelklick/parallele Auslöser im selben Tab
    setActionError(null);
    setReportPending(true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setActionError("Keine Verbindung. Die Rückgabe ist noch NICHT gemeldet und wird automatisch gesendet, sobald du wieder online bist.");
      return;
    }
    if (pendingCountRef.current > 0) {
      // Erst Fotos übertragen; danach wiederholt der Sync-Effekt die Meldung automatisch.
      setActionError("Fotos werden zuerst übertragen. Die Rückgabe wird danach automatisch gemeldet – noch NICHT bestätigt.");
      void transferAll().then(() => setSyncTick((n) => n + 1));
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const fuel = endFuelPercent === "" ? null : parseInt(endFuelPercent);
      const res = await report({
        data: { bookingId, endKm: Number(endKm), endFuelPercent: fuel, endKmManual, exceptions },
      });
      if (!res || (res as { ok?: boolean }).ok !== true) {
        const r = res as { error?: string } | null;
        // Serverseitige Ablehnung (z. B. fehlende bestätigte Nachweise): Auftrag beenden, kein Endlos-Retry.
        setReportPending(false);
        setActionError(`Rückgabe nicht gespeichert. ${r?.error ?? ""}`.trim());
        return;
      }
      const ok = res as { returnCode: string; reviewReason: string | null };
      setReportPending(false);
      setReviewNote(ok.reviewReason);
      setReturnCode(ok.returnCode);
      setAwaitingAdmin(true);
      setReturnStep("code");
    } catch (err) {
      // Netz-/Serverfehler: Auftrag bleibt bestehen und wird beim nächsten Sync wiederholt.
      setActionError(
        err instanceof Error
          ? `Rückgabe noch NICHT gemeldet. ${err.message} Wir versuchen es automatisch erneut.`
          : "Rückgabe noch NICHT gemeldet. Wir versuchen es automatisch erneut.",
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }, [report, bookingId, endKm, endFuelPercent, endKmManual, exceptions, transferAll]);

  // Beauftragte Meldung nach abgeschlossenem Warteschlangen-Durchlauf automatisch wiederholen –
  // je Durchlauf höchstens einmal, nur wenn keine Fotos mehr offen sind.
  const lastAutoTick = useRef(-1);
  useEffect(() => {
    if (!reportPending || returnCode || pendingCount > 0) return;
    if (lastAutoTick.current === syncTick) return;
    lastAutoTick.current = syncTick;
    void submitReport();
  }, [syncTick, reportPending, returnCode, pendingCount, submitReport]);

  if (returnStep === "photos") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        {camera}
        <h3 className="text-xl font-bold text-foreground mb-2">Fahrzeug-Rückgabe dokumentieren</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Fotografiere das Fahrzeug von allen 8 Seiten und den Innenraum, bevor du den Schlüssel abgibst.
        </p>
        {notice}

        {isAdmin && (
          <button
            onClick={fillTestPhotos}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Admin-Testmodus: alle Fotos überspringen
          </button>
        )}

        {photoBanners}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PHOTO_SIDES.map((side) => (
            <button
              key={side.id}
              onClick={() => openCamera({ kind: "side", id: side.id })}
              disabled={!!photos[side.id] || localTags.has(side.id) || uploading}
              className={`p-4 rounded-2xl border-2 text-center transition-all ${
                photos[side.id] ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
              }`}
            >
              {photos[side.id] ? (
                <div className="mb-2">
                  <TripPhotoThumb photo={photos[side.id]} alt={side.label} className="w-full h-20" />
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center mb-2">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <p className="text-sm font-medium text-foreground">
                {side.icon} {side.label}
              </p>
              {photos[side.id] && <p className="text-[10px] text-muted-foreground">Übertragen</p>}
              {!photos[side.id] && localTags.has(side.id) && (
                <p className="text-[10px] text-muted-foreground" data-testid={`local-${side.id}`}>Auf diesem Gerät gespeichert</p>
              )}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-foreground mb-2">Innenraum & Sauberkeit</p>
          <button
            onClick={() => openCamera({ kind: "interior" })}
            disabled={uploading}
            className={`w-full p-4 rounded-2xl border-2 text-center transition-all ${
              interiorPhoto ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
            }`}
          >
            {interiorPhoto ? (
              <div className="mb-2">
                <TripPhotoThumb photo={interiorPhoto} alt="Innenraum" className="w-full h-32" />
              </div>
            ) : (
              <div className="h-24 flex flex-col items-center justify-center gap-1">
                <Camera className="w-8 h-8 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Foto vom Innenraum aufnehmen</span>
              </div>
            )}
          </button>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Schäden?
          </p>
          <p className="text-xs text-muted-foreground mb-3">Optional, bis zu 4 Fotos von neuen Schäden</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, idx) => {
              const photo = damagePhotos[idx];
              if (photo) {
                return (
                  <div key={idx} className="relative">
                    <TripPhotoThumb photo={photo} alt={`Schaden ${idx + 1}`} className="w-full h-20 border border-border" />
                    <button
                      onClick={() => setDamagePhotos((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center"
                      aria-label="Foto entfernen"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={idx}
                  onClick={() => openCamera({ kind: "damage" })}
                  disabled={uploading || idx > damagePhotos.length}
                  className="h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-accent/50 transition-all disabled:opacity-40"
                >
                  <Plus className="w-5 h-5" />
                </button>
              );
            })}
          </div>
        </div>

        {!(allSidesTaken && interiorTaken) && exceptionBox("photos", "Foto oder Kamera funktioniert nicht?")}

        <button
          disabled={!photosReady}
          onClick={() => setReturnStep("km")}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight className="w-5 h-5 inline" />
        </button>

        {!photosReady && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Bitte alle 8 Außenfotos und das Innenraum-Foto aufnehmen
            {pendingCount > 0 ? " – noch nicht übertragene Fotos zählen erst nach der Übertragung" : ""}
          </p>
        )}
      </div>
    );
  }

  if (returnStep === "km") {
    const kmReady = endKm.trim() !== "" && (!!odometerPhoto || localTags.has(RETURN_ODOMETER_TAG) || photosException);
    const fuelReady = !!fuelPhoto || localTags.has(RETURN_FUEL_TAG) || validReason(exceptions.fuel);
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        {camera}
        <h3 className="text-xl font-bold text-foreground mb-2">Kilometer- und Tankstand (Ende)</h3>
        <p className="text-sm text-muted-foreground mb-6">Trage den aktuellen Kilometerstand ein.</p>
        {photoBanners}
        {isAdmin && (
          <button
            onClick={fillTestKm}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Admin-Testmodus: Kilometerstand & Tacho-Foto fiktiv ausfüllen
          </button>
        )}
        <input
          type="number"
          inputMode="numeric"
          value={endKm}
          onChange={(e) => {
            setEndKm(e.target.value);
            setEndKmManual(true);
          }}
          placeholder="z.B. 42920"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent mb-6"
        />

        <p className="text-xs text-muted-foreground mb-2">Pflicht: Foto vom Tacho mit aktuellem Kilometerstand.</p>
        <button
          onClick={() => openCamera({ kind: "odometer" })}
          disabled={uploading}
          className={`w-full mb-6 p-4 rounded-2xl border-2 text-center transition-all ${
            odometerPhoto ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
          }`}
        >
          {odometerPhoto ? (
            <TripPhotoThumb photo={odometerPhoto} alt="Tacho" className="w-full h-32" />
          ) : (
            <div className="h-20 flex flex-col items-center justify-center gap-1">
              <Camera className="w-7 h-7 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Foto vom Tacho aufnehmen</span>
            </div>
          )}
        </button>

        {aiBusy && <p className="text-xs text-muted-foreground -mt-4 mb-4">🤖 KI analysiert Tacho…</p>}
        {!aiBusy && aiRecognition && (
          <p className="text-xs text-muted-foreground -mt-4 mb-4">
            🤖 KI-Vorschlag:&nbsp;
            {aiRecognition.km !== null ? `${aiRecognition.km.toLocaleString("de-DE")} km` : "Kilometerstand nicht lesbar"}
            {aiRecognition.fuelPercent !== null ? ` · Tank ${aiRecognition.fuelPercent}%` : ""}
            {aiRecognition.confidence === "low" ? " (unsicher – bitte prüfen)" : " – bitte prüfen"}
            {endKmManual ? " · deine Eingabe bleibt erhalten" : ""}
          </p>
        )}

        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
          <Fuel className="w-3.5 h-3.5" /> Pflicht: Foto der Tankanzeige.
        </p>
        <button
          onClick={() => openCamera({ kind: "fuel" })}
          disabled={uploading}
          className={`w-full mb-4 p-4 rounded-2xl border-2 text-center transition-all ${
            fuelPhoto ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
          }`}
        >
          {fuelPhoto ? (
            <TripPhotoThumb photo={fuelPhoto} alt="Tankanzeige" className="w-full h-32" />
          ) : (
            <div className="h-20 flex flex-col items-center justify-center gap-1">
              <Fuel className="w-7 h-7 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Foto der Tankanzeige aufnehmen</span>
            </div>
          )}
        </button>
        {!fuelPhoto && exceptionBox("fuel", "Tankanzeige lässt sich nicht fotografieren?")}

        <label className="text-sm font-medium text-foreground">Tankstand (Ende, in %)</label>
        <input
          type="number"
          min={0}
          max={100}
          value={endFuelPercent}
          onChange={(e) => {
            setEndFuelPercent(e.target.value);
            setFuelManual(true);
          }}
          placeholder="z.B. 75"
          className="mt-1 mb-6 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {actionError && <TripErrorBanner message={actionError} onRetry={() => void handleSubmitKm()} busy={saving} />}
        <button
          disabled={!kmReady || !fuelReady || saving || uploading}
          onClick={handleSubmitKm}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight className="w-5 h-5 inline" />
        </button>
      </div>
    );
  }

  if (returnStep === "receipt") {
    const receiptReady = !!receiptPhoto || localTags.has(RETURN_RECEIPT_TAG) || validReason(exceptions.receipt);
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        {camera}
        <h3 className="text-xl font-bold text-foreground mb-2">Tankbeleg scannen</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Lege den Tankbeleg gut sichtbar in den Rahmen, das Foto wird automatisch wie ein Scan in S/W aufbereitet.
        </p>

        {kmSummary && (
          <div className="mb-6 p-4 rounded-2xl border border-border bg-secondary/50">
            <p className="text-sm font-medium text-foreground mb-2">Kilometer-Abrechnung</p>
            {kmSummary.reviewReason ? (
              <p className="text-sm text-muted-foreground">
                {kmSummary.reviewReason} Es wird nichts automatisch berechnet.
              </p>
            ) : (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Gefahren</span>
                  <span className="text-foreground">{kmSummary.driven} km</span>
                </div>
                {kmSummary.free > 0 && (
                  <div className="flex justify-between">
                    <span>Inklusive Freikilometer</span>
                    <span className="text-foreground">{kmSummary.free} km</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{planId === "km" ? "Berechnete Kilometer" : "Mehrkilometer"}</span>
                  <span className="text-foreground">{kmSummary.extra} km</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t border-border">
                  <span className="text-foreground">
                    {(kmSummary.extra ?? 0) > 0
                      ? `Aufpreis (${(kmSummary.pricePerKmCents / 100).toFixed(2).replace(".", ",")} €/km)`
                      : "Aufpreis"}
                  </span>
                  <span className="text-foreground">{((kmSummary.chargeCents ?? 0) / 100).toFixed(2)} €</span>
                </div>
              </div>
            )}
            {(kmSummary.chargeCents ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Der Betrag wird nach Bestätigung der Rückgabe von der Kaution einbehalten bzw. separat über deine hinterlegte Zahlungsmethode abgerechnet.
              </p>
            )}
          </div>
        )}

        {isAdmin && (
          <button
            onClick={() => {
              const placeholder =
                "data:image/svg+xml;utf8," +
                encodeURIComponent(
                  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'><rect width='200' height='280' fill='%23ffffff'/><text x='50%' y='40%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='14' fill='%23000'>TEST-TANKBELEG</text><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='12' fill='%23000'>Admin-Modus</text></svg>`,
                );
              setReceiptPhoto({ path: "admin-test", url: placeholder });
            }}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Admin-Testmodus: Tankbeleg fiktiv eingeben
          </button>
        )}

        {photoBanners}
        {receiptPhoto ? (
          <div className="mb-6">
            <div className="relative">
              {receiptPhoto.url ? (
                <img src={receiptPhoto.url} alt="Tankbeleg" className="w-full max-h-[60vh] object-contain rounded-2xl border border-border bg-secondary" />
              ) : (
                <TripPhotoThumb photo={receiptPhoto} alt="Tankbeleg" className="w-full h-40" />
              )}
              <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-foreground text-background text-[10px] font-semibold flex items-center gap-1">
                <ScanLine className="w-3 h-3" /> Gescannt
              </div>
            </div>
            <button
              onClick={() => openCamera({ kind: "receipt" })}
              className="mt-3 w-full rounded-full border border-foreground py-2.5 text-sm font-medium hover:bg-secondary"
            >
              Erneut scannen
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => openCamera({ kind: "receipt" })}
              disabled={uploading}
              className="w-full p-8 rounded-2xl border-2 border-dashed border-border hover:border-accent/50 text-center mb-4 transition-all"
            >
              <ScanLine className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Tankbeleg scannen</p>
              <p className="text-[11px] text-muted-foreground mt-1">CamScanner-Modus aktiv</p>
            </button>
            {exceptionBox("receipt", "Kein Tankbeleg vorhanden?")}
          </>
        )}

        {addons && addons.length > 0 && (
          <div className="mb-4 rounded-2xl border border-border bg-secondary/50 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Gebuchtes Zubehör zurückgeben</p>
            <ul className="text-xs text-muted-foreground space-y-1 mb-3">
              {addons.map((a) => (
                <li key={a.id}>• {a.label}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={addonsReturned} onChange={(e) => setAddonsReturned(e.target.checked)} className="mt-0.5" />
              <span>Zubehör vollständig &amp; unbeschädigt zurückgegeben</span>
            </label>
          </div>
        )}

        {pendingCount > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Es sind noch Fotos nur auf diesem Gerät. Sie zählen erst als Nachweis, wenn sie übertragen sind; die Rückgabe wird danach gemeldet.
          </p>
        )}
        {kmLocalOnly && (
          <p className="mb-3 text-xs text-muted-foreground" data-testid="km-local">
            Kilometer- und Tankstand sind auf diesem Gerät gespeichert und werden mit der Rückgabemeldung übertragen.
          </p>
        )}
        {reportPending && !returnCode && (
          <p className="mb-3 rounded-2xl border border-foreground p-3 text-xs font-medium" data-testid="report-pending">
            Rückgabe ausstehend – noch nicht serverseitig bestätigt.
          </p>
        )}
        {actionError && <TripErrorBanner message={actionError} onRetry={() => void submitReport()} busy={saving} />}
        <button
          disabled={saving || uploading || !receiptReady || (!!addons && addons.length > 0 && !addonsReturned)}
          onClick={() => void submitReport()}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Schlüssel zurückgeben <Key className="w-5 h-5 inline" />
        </button>
      </div>
    );
  }

  if (returnStep === "code") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
          <Key className="w-10 h-10 text-foreground" />
        </div>
        <p className="inline-block mb-3 rounded-full border border-foreground px-3 py-1 text-xs font-semibold">
          Rückgabe gemeldet · Bestätigung durch MyTransporter ausstehend
        </p>
        <h3 className="text-2xl font-bold text-foreground mb-2">Schlüssel abgeben</h3>
        <p className="text-muted-foreground mb-2">
          Gehe zur <span className="font-medium text-foreground">Römerstraße 36</span> und nenne diesen Code:
        </p>

        <div className="my-8 p-6 rounded-2xl bg-primary text-primary-foreground">
          <p className="text-xs opacity-70 mb-2">Dein Rückgabecode</p>
          <p className="text-4xl font-mono font-bold tracking-[0.3em]">{returnCode}</p>
        </div>

        {reviewNote && (
          <p className="mb-6 text-xs text-muted-foreground">Hinweis: Deine Rückgabe wird zusätzlich geprüft ({reviewNote}).</p>
        )}

        <p className="text-xs text-muted-foreground mb-8">
          Nenne diesen Code dem Mitarbeiter. Erst wenn er die Schlüsselübergabe bestätigt, ist deine Fahrt beendet.
        </p>

        <button
          disabled
          className="w-full rounded-full bg-secondary py-4 text-muted-foreground font-medium text-lg flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <span className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
          Warte auf Bestätigung des Mitarbeiters…
        </button>

        <p className="text-xs text-muted-foreground mt-4">
          Sobald MyTransporter den Schlüssel entgegennimmt und bestätigt, wird die Fahrt automatisch als abgeschlossen markiert und diese Seite aktualisiert.
        </p>
      </div>
    );
  }

  return null;
}
