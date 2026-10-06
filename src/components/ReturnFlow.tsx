import { isPhysicalAddon } from "@/lib/custom-km";
import { DocumentationFeeNotice } from "./DocumentationFeeNotice";
import {
  EXCEPTION_KIND_LABEL,
  exceptionKind,
  stripExceptionKind,
  withExceptionKind,
  type ExceptionKind,
} from "@/lib/documentation-fee";
import { useState, useCallback, useEffect, useId, useRef } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Check,
  Key,
  Pencil,
  Image as ImageIcon,
  CloudOff,
  Loader2,
  ScanLine,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture, type SilhouetteVariant } from "./CameraCapture";
import { NativePhotoInputs } from "./NativePhotoInputs";
import { ReturnSlotOutline, type OutlineKind } from "./ReturnSlotOutline";
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
  RETURN_DASHBOARD_TAG,
  RETURN_FUEL_TAG,
  RETURN_INTERIOR_TAG,
  RETURN_ODOMETER_TAG,
  RETURN_RECEIPT_TAG,
  type ExceptionKey,
  type ReturnExceptions,
} from "@/lib/trip-return";
import { loadReturnDraft, saveReturnDraft } from "@/lib/return-draft";
import {
  enqueuePhoto,
  openIdbQueueStore,
  QueueUnavailableError,
  transferQueuedPhoto,
  type QueueStore,
} from "@/lib/photo-queue";
import { blobToImageFile, normalizeImageFile } from "@/lib/image-capture";

const TEST_MODE_ADMIN_EMAIL = "krueger.christian96@gmx.de";

export const RETURN_DOCUMENTATION_NOTICE =
  "Bitte dokumentiere die Rückgabe vollständig. Bei fehlenden oder unleserlichen Nachweisen kann eine zusätzliche Prüfung erforderlich sein. Nachvollziehbar belegte und rechtlich berechtigte Forderungen aus dem Mietvertrag können nach Prüfung mit deiner Kaution verrechnet werden.";

export const DASHBOARD_HINT =
  "Zündung einschalten. Kilometerstand und Tankstand müssen auf demselben Foto vollständig und gut erkennbar sein.";

export const RETURN_DONE_TITLE = "Die Buchung ist jetzt abgeschlossen.";
export const KEY_RETURN_HINT =
  "Bitte geben Sie den Schlüssel persönlich ab oder legen Sie ihn in die vereinbarte Schlüsselbox zurück.";

export interface ReturnSlot {
  tag: string;
  title: string;
  hint: string;
  outline: OutlineKind;
  camera: SilhouetteVariant;
  exKey: ExceptionKey;
}

/** Genau 6 Kernfotos; der Tankbeleg folgt nur, wenn der Kunde getankt hat. */
export const RETURN_CORE_SLOTS: readonly ReturnSlot[] = [
  { tag: "post_front", title: "Fahrzeug vorne", hint: "Stelle dich mittig vor das Fahrzeug. Die ganze Front muss im Bild sein.", outline: "front", camera: "front", exKey: "photos" },
  { tag: "post_back", title: "Fahrzeug hinten", hint: "Stelle dich mittig hinter das Fahrzeug. Das ganze Heck muss im Bild sein.", outline: "back", camera: "back", exKey: "photos" },
  { tag: "post_left", title: "Fahrzeug linke Seite", hint: "Die komplette linke Fahrzeugseite von vorne bis hinten aufnehmen.", outline: "left", camera: "side-left", exKey: "photos" },
  { tag: "post_right", title: "Fahrzeug rechte Seite", hint: "Die komplette rechte Fahrzeugseite von vorne bis hinten aufnehmen.", outline: "right", camera: "side-right", exKey: "photos" },
  { tag: RETURN_INTERIOR_TAG, title: "Innenraum", hint: "Fahrer- und Laderaum so aufnehmen, dass Sauberkeit und Zustand erkennbar sind.", outline: "interior", camera: "interior", exKey: "photos" },
  { tag: RETURN_DASHBOARD_TAG, title: "Kilometerstand und Tankstand", hint: DASHBOARD_HINT, outline: "dashboard", camera: "damage", exKey: "fuel" },
];

export const RETURN_RECEIPT_SLOT: ReturnSlot = {
  tag: RETURN_RECEIPT_TAG,
  title: "Tankbeleg",
  hint: "Den Tankbeleg flach und vollständig lesbar fotografieren.",
  outline: "receipt",
  camera: "receipt",
  exKey: "receipt",
};

export function returnSlots(refueled: boolean | null): ReturnSlot[] {
  return refueled ? [...RETURN_CORE_SLOTS, RETURN_RECEIPT_SLOT] : [...RETURN_CORE_SLOTS];
}

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

type Step = "intro" | "wizard" | "overview" | "code";
/** Nur Aufnahmen, deren IndexedDB-Transaktion abgeschlossen ist, erscheinen hier (dauerhaft lokal gesichert). */
type PendingState = { id: string; tag: string; status: "local" | "uploading" | "error"; preview: string | null; createdAt: number; message?: string };
type Candidate = { file: File; url: string | null; source: "camera" | "gallery" | "live" };

function makePreview(blob: Blob): string | null {
  try {
    return typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function initialStep(code: string | null, step: string | undefined): Step {
  if (code) return "code";
  if (step === "overview") return "overview";
  if (step === "wizard" || step === "photos" || step === "km" || step === "receipt") return "wizard";
  return "intro";
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
  const [step, setStep] = useState<Step>(initialStep(initialCode, draft0?.step));
  const [refueled, setRefueled] = useState<boolean | null>(draft0?.refueled ?? null);
  const slots = returnSlots(refueled);
  const [slide, setSlide] = useState(() => Math.max(0, Math.min(draft0?.slide ?? 0, 6)));
  const [dir, setDir] = useState<"next" | "prev">("next");
  /** Aus der Übersicht bearbeitetes Foto: nach Bestätigung zurück zur Übersicht. */
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [photos, setPhotos] = useState<Record<string, StoredTripPhoto>>({});
  const [damagePhotos, setDamagePhotos] = useState<StoredTripPhoto[]>([]);
  const [endKm, setEndKm] = useState(draft0?.endKm ?? "");
  const [endKmManual, setEndKmManual] = useState(draft0?.endKmManual ?? false);
  const [exceptions, setExceptions] = useState<ReturnExceptions>(draft0?.exceptions ?? {});
  const [openException, setOpenException] = useState<ExceptionKey | null>(null);
  const [photoError, setPhotoError] = useState<{ message: string; tag: string; file: Blob; uploadedPath: string | null } | null>(null);
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
  const storeRef = useRef<QueueStore | null>(null);
  const endKmManualRef = useRef(endKmManual);
  endKmManualRef.current = endKmManual;
  const fuelManualRef = useRef(fuelManual);
  fuelManualRef.current = fuelManual;
  const uid = useId();
  const cameraInputId = `ret-cam-${uid}`;
  const galleryInputId = `ret-gal-${uid}`;

  // Entwurf fortlaufend sichern (nicht erst beim Verlassen).
  useEffect(() => {
    if (!userId || step === "code") return;
    saveReturnDraft(userId, bookingId, {
      started: true,
      step,
      slide,
      refueled,
      endKm,
      endKmManual,
      endFuelPercent,
      exceptions,
      addonsReturned,
      returnCode,
      reportPending,
    });
  }, [userId, bookingId, step, slide, refueled, endKm, endKmManual, endFuelPercent, exceptions, addonsReturned, returnCode, reportPending]);

  // Server-Code hat Vorrang (z. B. nach verlorener Antwort).
  useEffect(() => {
    if (serverReturnCode && serverReturnCode !== returnCode) {
      setReturnCode(serverReturnCode);
      setReportPending(false);
      setAwaitingAdmin(true);
      setStep("code");
    }
  }, [serverReturnCode, returnCode]);

  const applySaved = useCallback((tag: string, saved: StoredTripPhoto) => {
    if (tag === "post_damage") setDamagePhotos((prev) => (prev.some((p) => p.path === saved.path) ? prev : [...prev, saved]));
    else setPhotos((prev) => ({ ...prev, [tag]: saved }));
  }, []);

  // Bereits bestätigte Rückgabe-Fotos wiederherstellen (neueste je Typ gewinnt; alte bleiben erhalten).
  useEffect(() => {
    let mounted = true;
    setLoadError(null);
    (async () => {
      try {
        const rows = await loadTripPhotos(supabase, bookingId, ["post_", "tank_receipt"]);
        if (!mounted) return;
        const byTag: Record<string, StoredTripPhoto> = {};
        const damages: StoredTripPhoto[] = [];
        for (const row of rows) {
          const photo = { path: row.photo_url, url: row.url };
          if (row.photo_type === "post_damage") damages.push(photo);
          else byTag[row.photo_type] = photo;
        }
        if (Object.keys(byTag).length) setPhotos((prev) => ({ ...byTag, ...prev }));
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
        next[it.id] = { id: it.id, tag: it.tag, status: "local", preview: makePreview(it.blob), createdAt: it.createdAt };
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

  // ---------- Status je Foto ----------
  const pendingList = Object.values(pending);
  const pendingCount = pendingList.length;
  const localTags = new Set(pendingList.map((p) => p.tag));
  const hasPhoto = (tag: string) =>
    !!photos[tag] ||
    localTags.has(tag) ||
    (tag === RETURN_DASHBOARD_TAG && !!photos[RETURN_ODOMETER_TAG] && !!photos[RETURN_FUEL_TAG]);
  /** Ausnahme zählt nur mit Einordnung (technisch / nicht bereitgestellt) und Begründung. */
  const exceptionValid = (key: ExceptionKey) => validReason(exceptions[key]) && exceptionKind(exceptions[key]) !== null;
  const slotDone = (s: ReturnSlot) => hasPhoto(s.tag) || exceptionValid(s.exKey);
  /** Neueste Ansicht je Foto: noch nicht übertragene, neuere lokale Aufnahme vor Serverfoto. */
  const latestLocal = (tag: string) =>
    pendingList.filter((p) => p.tag === tag).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  const kmValid = endKm.trim() !== "" && Number.isInteger(Number(endKm)) && Number(endKm) >= 0;
  const allDone = slots.every(slotDone) && kmValid && refueled !== null;

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

  /** Speichert ein BESTÄTIGTES Foto: erst dauerhaft lokal (IndexedDB-Commit), dann Übertragung. */
  const savePhoto = useCallback(
    async (file: Blob, tag: string, uploadedPath: string | null = null): Promise<boolean> => {
      setUploading(true);
      setPhotoError(null);
      const store = storeRef.current;
      if (store && userId && !uploadedPath) {
        try {
          const item = await enqueuePhoto(store, { userId, bookingId, tag, blob: file });
          pendingTags.current[item.id] = tag;
          setPending((p) => ({ ...p, [item.id]: { id: item.id, tag, status: "local", preview: makePreview(file), createdAt: item.createdAt } }));
          setUploading(false);
          void (async () => {
            try {
              const saved = await transferQueuedPhoto(supabase, store, item.id);
              delete pendingTags.current[item.id];
              setPending((p) => {
                const { [item.id]: done, ...rest } = p;
                if (done?.preview) URL.revokeObjectURL?.(done.preview);
                return rest;
              });
              applySaved(tag, saved);
              if (tag === RETURN_DASHBOARD_TAG) void runOdometerAi(saved.path);
            } catch (err) {
              const message = err instanceof Error ? err.message : "Übertragung fehlgeschlagen.";
              setPending((p) => (p[item.id] ? { ...p, [item.id]: { ...p[item.id]!, status: "error", message } } : p));
            }
            setSyncTick((n) => n + 1);
          })();
          return true;
        } catch (err) {
          if (!(err instanceof QueueUnavailableError)) {
            setUploading(false);
            setPhotoError({ message: "Das Foto konnte auf diesem Gerät nicht gespeichert werden. Bitte erneut versuchen.", tag, file, uploadedPath: null });
            return false;
          }
          setQueueNotice(err.message);
          // ehrlich: kein Gerätespeicher → direkter Online-Upload
        }
      }
      try {
        // Erfolg erst nach Storage-Upload UND bestätigtem Datenbankeintrag.
        const saved = await saveTripPhoto(supabase, { bookingId, tag, file, uploadedPath });
        applySaved(tag, saved);
        if (tag === RETURN_DASHBOARD_TAG) void runOdometerAi(saved.path);
        return true;
      } catch (err) {
        console.error("Upload error:", err);
        setPhotoError({
          message: err instanceof Error ? err.message : "Das Foto konnte nicht gespeichert werden.",
          tag,
          file,
          uploadedPath: err instanceof TripPhotoError ? err.uploadedPath : uploadedPath,
        });
        return false;
      } finally {
        setUploading(false);
      }
    },
    [bookingId, userId, applySaved, runOdometerAi],
  );

  // ---------- Kandidat (Vorschau vor Bestätigung, nur im Arbeitsspeicher) ----------
  // Jede Auswahl/Freigabe erhöht den Zähler: eine verspätet fertig gewordene Konvertierung
  // (z. B. HEIC) darf einen bereits bestätigten oder verworfenen Slot nie wieder überschreiben.
  const pickSeq = useRef(0);
  const clearCandidate = useCallback(() => {
    pickSeq.current += 1;
    setCandidate((c) => {
      if (c?.url) URL.revokeObjectURL?.(c.url);
      return null;
    });
  }, []);

  const acceptFile = useCallback(async (file: File, source: Candidate["source"]) => {
    setPickError(null);
    const seq = ++pickSeq.current;
    try {
      const blob = await normalizeImageFile(file);
      const out = blobToImageFile(blob, "photo");
      if (seq !== pickSeq.current) return;
      setCandidate((c) => {
        if (c?.url) URL.revokeObjectURL?.(c.url);
        return { file: out, url: makePreview(out), source };
      });
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Foto konnte nicht gelesen werden. Bitte erneut versuchen.");
    }
  }, []);

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const source = e.target.id === cameraInputId ? "camera" : "gallery";
    e.target.value = ""; // gleiche Datei erneut wählbar
    if (file) void acceptFile(file, source);
  };

  const goTo = (index: number, direction: "next" | "prev") => {
    clearCandidate();
    setPickError(null);
    setPhotoError(null);
    setOpenException(null);
    setActionError(null);
    setDir(direction);
    setSlide(index);
  };

  const current = slots[Math.min(slide, slots.length - 1)]!;

  const confirmCandidate = async () => {
    if (!candidate || uploading) return;
    const ok = await savePhoto(candidate.file, current.tag);
    if (!ok) return;
    clearCandidate();
    if (editingTag === current.tag) {
      setEditingTag(null);
      setStep("overview");
    }
  };

  /** Kilometer-/Tankwerte als Entwurf am Server sichern (offline: lokal, später mit der Meldung). */
  const saveKmDraft = async (): Promise<boolean> => {
    const end = Number(endKm);
    if (!kmValid) {
      setActionError("Bitte einen gültigen Kilometerstand eintragen.");
      return false;
    }
    setSaving(true);
    setActionError(null);
    try {
      await updateBookingChecked(supabase, bookingId, {
        end_km: end,
        end_km_manual: endKmManual,
        ...(endFuelPercent !== "" ? { ai_end_fuel_percent: parseInt(endFuelPercent) } : {}),
      });
      setKmLocalOnly(false);
      return true;
    } catch (err) {
      const offline =
        (typeof navigator !== "undefined" && navigator.onLine === false) ||
        (err instanceof BookingUpdateError && err.kind === "network");
      if (offline) {
        setKmLocalOnly(true);
        return true;
      }
      if (err instanceof BookingUpdateError && err.kind === "locked" && onBookingRefresh) {
        try {
          await onBookingRefresh();
        } catch {
          // Die sichere Fehlermeldung unten bleibt bedienbar, auch wenn das Neuladen scheitert.
        }
      }
      setActionError(err instanceof Error ? `Kilometerstand nicht gespeichert. ${err.message}` : "Kilometerstand nicht gespeichert.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (!slotDone(current)) return;
    if (current.tag === RETURN_DASHBOARD_TAG) {
      if (refueled === null) return;
      if (!(await saveKmDraft())) return;
    }
    if (editingTag) {
      setEditingTag(null);
      clearCandidate();
      setStep("overview");
      return;
    }
    if (slide + 1 >= slots.length) {
      clearCandidate();
      setStep("overview");
      return;
    }
    goTo(slide + 1, "next");
  };

  const back = () => {
    if (editingTag) {
      setEditingTag(null);
      clearCandidate();
      setStep("overview");
      return;
    }
    if (slide === 0) {
      clearCandidate();
      setStep("intro");
      return;
    }
    goTo(slide - 1, "prev");
  };

  const editSlot = (tag: string) => {
    const idx = slots.findIndex((s) => s.tag === tag);
    if (idx < 0) return;
    setEditingTag(tag);
    goTo(idx, "next");
    setStep("wizard");
  };

  const fillTestPhotos = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`,
      );
    const test = { path: "admin-test", url: placeholder };
    const next: Record<string, StoredTripPhoto> = {};
    returnSlots(true).forEach((s) => (next[s.tag] = test));
    setPhotos((p) => ({ ...p, ...next }));
    if (!endKm) setEndKm("42920");
    if (refueled === null) setRefueled(false);
  };

  // ---------- Rückgabemeldung ----------
  const submittingRef = useRef(false);
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;

  /** Nur nach Nutzeraktion „Buchung abschließen“ (setzt reportPending) bzw. deren automatischer Wiederholung. */
  const submitReport = useCallback(async () => {
    if (submittingRef.current) return; // Doppelklick/parallele Auslöser im selben Tab
    setActionError(null);
    setReportPending(true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setActionError("Keine Verbindung. Die Buchung ist noch NICHT abgeschlossen und wird automatisch gesendet, sobald du wieder online bist.");
      return;
    }
    if (pendingCountRef.current > 0) {
      // Erst Fotos übertragen; danach wiederholt der Sync-Effekt die Meldung automatisch.
      setActionError("Fotos werden zuerst übertragen. Die Buchung wird danach automatisch abgeschlossen – noch NICHT bestätigt.");
      void transferAll().then(() => setSyncTick((n) => n + 1));
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const fuel = endFuelPercent === "" ? null : parseInt(endFuelPercent);
      const res = await report({
        data: {
          bookingId,
          endKm: Number(endKm),
          endFuelPercent: fuel,
          endKmManual,
          exceptions,
          mode: { flow: "v2", refueled: refueled === true },
        },
      });
      if (!res || (res as { ok?: boolean }).ok !== true) {
        const r = res as { error?: string } | null;
        // Serverseitige Ablehnung (z. B. fehlende bestätigte Nachweise): Auftrag beenden, kein Endlos-Retry.
        setReportPending(false);
        setActionError(`Buchung nicht abgeschlossen. ${r?.error ?? ""}`.trim());
        return;
      }
      const ok = res as { returnCode: string; reviewReason: string | null };
      setReportPending(false);
      setReviewNote(ok.reviewReason);
      setReturnCode(ok.returnCode);
      setAwaitingAdmin(true);
      setStep("code");
    } catch (err) {
      // Netz-/Serverfehler: Auftrag bleibt bestehen und wird beim nächsten Sync wiederholt.
      setActionError(
        err instanceof Error
          ? `Buchung noch NICHT abgeschlossen. ${err.message} Wir versuchen es automatisch erneut.`
          : "Buchung noch NICHT abgeschlossen. Wir versuchen es automatisch erneut.",
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }, [report, bookingId, endKm, endFuelPercent, endKmManual, exceptions, refueled, transferAll]);

  // Beauftragte Meldung nach abgeschlossenem Warteschlangen-Durchlauf automatisch wiederholen –
  // je Durchlauf höchstens einmal, nur wenn keine Fotos mehr offen sind.
  const lastAutoTick = useRef(-1);
  useEffect(() => {
    if (!reportPending || returnCode || pendingCount > 0) return;
    if (lastAutoTick.current === syncTick) return;
    lastAutoTick.current = syncTick;
    void submitReport();
  }, [syncTick, reportPending, returnCode, pendingCount, submitReport]);

  // ---------- Bausteine ----------
  const photoBanners = (
    <>
      {loadError && <TripErrorBanner message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} retryLabel="Neu laden" />}
      {queueNotice && <TripErrorBanner message={queueNotice} onDismiss={() => setQueueNotice(null)} />}
      {photoError && (
        <TripErrorBanner
          message={photoError.message}
          busy={uploading}
          onRetry={() => void savePhoto(photoError.file, photoError.tag, photoError.uploadedPath).then((ok) => ok && clearCandidate())}
          onDismiss={() => setPhotoError(null)}
        />
      )}
      {pendingCount > 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-secondary/60 p-4" data-testid="photo-queue">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <CloudOff className="w-4 h-4" /> {pendingCount} Foto(s) noch nicht übertragen
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pendingList.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                {p.status === "uploading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3 rounded-full border border-foreground inline-block" />}
                <span>
                  {p.status === "uploading"
                    ? "Wird übertragen"
                    : p.status === "error"
                      ? "Auf diesem Gerät gespeichert · Übertragung fehlgeschlagen"
                      : "Auf diesem Gerät gespeichert"}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={transferAll} className="mt-3 min-h-11 rounded-full bg-foreground px-4 text-xs font-semibold text-background">
            Jetzt übertragen
          </button>
        </div>
      )}
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
            {key === "photos" && (
              <p className="mt-1 text-[11px] text-muted-foreground">Gilt für alle Fahrzeug- und Innenraumfotos.</p>
            )}
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
            {(kind || value.length > 0) && (
              <>
                <label className="mt-2 block text-xs font-medium text-foreground" htmlFor={`ex-${key}`}>
                  Bitte kurz begründen (mind. {MIN_REASON_LENGTH} Zeichen). MyTransporter prüft das manuell.
                </label>
                <textarea
                  id={`ex-${key}`}
                  value={stripExceptionKind(value)}
                  maxLength={460}
                  onChange={(e) => setExceptions((x) => ({ ...x, [key]: kind ? withExceptionKind(kind, e.target.value) : e.target.value }))}
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

  const exceptionLabel = (s: ReturnSlot) =>
    s.exKey === "receipt"
      ? "Kein Tankbeleg vorhanden?"
      : s.exKey === "fuel"
        ? "Foto der Anzeige nicht möglich?"
        : "Foto nicht möglich?";

  const thumbFor = (tag: string, alt: string, cls: string) => {
    const local = latestLocal(tag);
    if (local?.preview) return <img src={local.preview} alt={alt} className={`${cls} object-cover rounded-xl`} />;
    if (local) return <div className={`${cls} rounded-xl bg-secondary flex items-center justify-center text-[11px] text-muted-foreground`}>Auf diesem Gerät gespeichert</div>;
    const p = photos[tag] ?? (tag === RETURN_DASHBOARD_TAG ? photos[RETURN_ODOMETER_TAG] : undefined);
    if (p) return <TripPhotoThumb photo={p} alt={alt} className={cls} />;
    return null;
  };

  // ---------- Erfolgsansicht ----------
  if (step === "code") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up text-center" data-testid="return-done">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-foreground" />
        </div>
        <p className="inline-block mb-3 rounded-full border border-foreground px-3 py-1 text-xs font-semibold">Rückgabe gemeldet</p>
        <h3 className="text-2xl font-bold text-foreground mb-3">{RETURN_DONE_TITLE}</h3>
        <p className="text-muted-foreground mb-2" data-testid="key-return-hint">
          {KEY_RETURN_HINT}
        </p>

        <div className="my-8 p-6 rounded-2xl bg-primary text-primary-foreground">
          <p className="text-xs opacity-70 mb-2">Dein Rückgabecode</p>
          <p className="text-4xl font-mono font-bold tracking-[0.3em]">{returnCode}</p>
        </div>
        <p className="text-xs text-muted-foreground mb-6">Bei persönlicher Abgabe nenne diesen Code.</p>

        {reviewNote && <p className="mb-6 text-xs text-muted-foreground">Hinweis: Deine Rückgabe wird zusätzlich geprüft ({reviewNote}).</p>}

        <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-2">
          <Key className="w-3.5 h-3.5" /> Sobald MyTransporter den Schlüssel bestätigt, wird die Fahrt automatisch beendet und diese Seite aktualisiert.
        </p>
      </div>
    );
  }

  // ---------- Start ----------
  if (step === "intro") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        <h3 className="text-xl font-bold text-foreground mb-2">Fahrzeug-Rückgabe dokumentieren</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Du wirst Schritt für Schritt durch {RETURN_CORE_SLOTS.length} kurze Fotos geführt: vorne, hinten, links, rechts, Innenraum sowie Kilometer- und Tankstand.
        </p>
        <p className="mb-4 rounded-2xl border border-border p-3 text-xs leading-relaxed text-muted-foreground" data-testid="return-notice">
          {RETURN_DOCUMENTATION_NOTICE}
        </p>
        <DocumentationFeeNotice />
        {photoBanners}
        <button
          type="button"
          onClick={() => {
            setStep("wizard");
            goTo(0, "next");
          }}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
        >
          <Camera className="w-5 h-5 inline mr-1" /> Jetzt Fotos hochladen
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">„Buchung abschließen“ ist erst nach der Fotodokumentation möglich.</p>
      </div>
    );
  }

  // ---------- Übersicht ----------
  if (step === "overview") {
    const km = kmValid ? evaluateReturnKm({ planId, startKm, endKm: Number(endKm), freeKm, kmPriceCents }) : null;
    const addonsOk = !addons || addons.length === 0 || addonsReturned;
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up" data-testid="return-overview">
        <CameraCapture
          open={damageOpen}
          title="Schaden aufnehmen"
          hint="Schaden gut erkennbar aufnehmen"
          variant="damage"
          onClose={() => setDamageOpen(false)}
          onCapture={async (file) => {
            setDamageOpen(false);
            await savePhoto(file, "post_damage");
          }}
        />
        <h3 className="text-xl font-bold text-foreground mb-2">Übersicht</h3>
        <p className="text-sm text-muted-foreground mb-4">Prüfe deine Fotos. Über den Stift kannst du ein Foto ersetzen.</p>
        {photoBanners}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {slots.map((s) => {
            const done = slotDone(s);
            const thumb = thumbFor(s.tag, s.title, "w-full h-24");
            return (
              <div key={s.tag} className={`rounded-2xl border-2 p-2 ${done ? "border-foreground" : "border-dashed border-border"}`} data-testid={`card-${s.tag}`}>
                {thumb ?? (
                  <div className="w-full h-24 rounded-xl bg-secondary flex items-center justify-center text-[11px] text-muted-foreground text-center px-2">
                    {exceptionValid(s.exKey) ? "Problem gemeldet – wird geprüft" : "Fehlt noch"}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-foreground leading-tight">{s.title}</p>
                  <button
                    type="button"
                    onClick={() => editSlot(s.tag)}
                    aria-label={`${s.title} bearbeiten`}
                    className="min-h-9 min-w-9 rounded-full border border-border flex items-center justify-center"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!photos[s.tag] && localTags.has(s.tag) && (
                  <p className="text-[10px] text-muted-foreground" data-testid={`local-${s.tag}`}>Auf diesem Gerät gespeichert</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mb-6 rounded-2xl border border-border p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Kilometerstand</span><span className="text-foreground">{kmValid ? `${Number(endKm).toLocaleString("de-DE")} km` : "fehlt"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tankstand</span><span className="text-foreground">{endFuelPercent !== "" ? `${endFuelPercent} %` : "–"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Getankt</span><span className="text-foreground">{refueled === null ? "–" : refueled ? "Ja" : "Nein"}</span></div>
          {km && (
            <div className="mt-3 pt-3 border-t border-border" data-testid="km-summary">
              {km.reviewReason ? (
                <p className="text-xs text-muted-foreground">{km.reviewReason} Es wird nichts automatisch berechnet.</p>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gefahren</span><span className="text-foreground">{km.driven} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{planId === "km" ? "Berechnete Kilometer" : "Mehrkilometer"}</span><span className="text-foreground">{km.extra} km</span></div>
                  {(km.chargeCents ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Voraussichtlich {((km.chargeCents ?? 0) / 100).toFixed(2).replace(".", ",")} € – endgültig nach Prüfung durch MyTransporter.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <button type="button" onClick={() => editSlot(RETURN_DASHBOARD_TAG)} className="mt-3 min-h-11 text-xs font-medium underline">
            Werte bearbeiten
          </button>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Neue Schäden? (optional)</p>
          <div className="grid grid-cols-4 gap-2">
            {damagePhotos.slice(0, 4).map((p, i) => (
              <TripPhotoThumb key={p.path} photo={p} alt={`Schaden ${i + 1}`} className="w-full h-16 border border-border" />
            ))}
            {damagePhotos.length < 4 && (
              <button type="button" onClick={() => setDamageOpen(true)} disabled={uploading} aria-label="Schaden fotografieren" className="h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground disabled:opacity-40">
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {addons && addons.length > 0 && (
          <div className="mb-4 rounded-2xl border border-border bg-secondary/50 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Gebuchtes Zubehör zurückgeben</p>
            <ul className="text-xs text-muted-foreground space-y-1 mb-3">
              {addons.map((a) => <li key={a.id}>• {a.label}</li>)}
            </ul>
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={addonsReturned} onChange={(e) => setAddonsReturned(e.target.checked)} className="mt-0.5" />
              <span>Zubehör vollständig &amp; unbeschädigt zurückgegeben</span>
            </label>
          </div>
        )}

        <DocumentationFeeNotice />
        {pendingCount > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">Es sind noch Fotos nur auf diesem Gerät. Sie zählen erst als Nachweis, wenn sie übertragen sind; der Abschluss wird danach gesendet.</p>
        )}
        {kmLocalOnly && (
          <p className="mb-3 text-xs text-muted-foreground" data-testid="km-local">Kilometer- und Tankstand sind auf diesem Gerät gespeichert und werden mit dem Abschluss übertragen.</p>
        )}
        {reportPending && !returnCode && (
          <p className="mb-3 rounded-2xl border border-foreground p-3 text-xs font-medium" data-testid="report-pending">Abschluss ausstehend – noch nicht serverseitig bestätigt.</p>
        )}
        {actionError && <TripErrorBanner message={actionError} onRetry={() => void submitReport()} busy={saving} />}
        <button
          type="button"
          disabled={!allDone || !addonsOk || saving || uploading}
          onClick={() => void submitReport()}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Buchung abschließen
        </button>
        {!allDone && <p className="mt-3 text-center text-xs text-muted-foreground">Bitte zuerst alle Pflichtfotos und den Kilometerstand erfassen.</p>}
        <button type="button" onClick={() => { setStep("wizard"); goTo(slots.length - 1, "prev"); }} className="mt-3 w-full min-h-11 text-sm font-medium flex items-center justify-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
      </div>
    );
  }

  // ---------- Wizard (eine Aufgabe pro Folie) ----------
  const done = slotDone(current);
  const isDashboard = current.tag === RETURN_DASHBOARD_TAG;
  const confirmedThumb = !candidate ? thumbFor(current.tag, current.title, "w-full h-56") : null;
  const canNext = done && (!isDashboard || (refueled !== null && kmValid)) && !saving && !uploading;

  return (
    <div className="max-w-lg mx-auto overflow-hidden" data-testid="return-wizard">
      <CameraCapture
        open={liveOpen}
        title={current.title}
        hint={current.hint}
        variant={current.camera}
        scanMode={current.tag === RETURN_RECEIPT_TAG}
        onClose={() => setLiveOpen(false)}
        onCapture={async (file) => {
          setLiveOpen(false);
          setCandidate((c) => {
            if (c?.url) URL.revokeObjectURL?.(c.url);
            return { file, url: makePreview(file), source: "live" };
          });
        }}
      />
      <NativePhotoInputs cameraId={cameraInputId} galleryId={galleryInputId} onChange={onPicked} cameraTestId="return-camera-input" galleryTestId="return-gallery-input" />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground" data-testid="wizard-progress" aria-live="polite">
          {Math.min(slide, slots.length - 1) + 1} von {slots.length}
        </p>
        {isAdmin && (
          <button type="button" onClick={fillTestPhotos} className="rounded-full border border-dashed border-foreground px-3 py-1 text-[11px] font-medium">
            🧪 Admin-Testmodus: alle Fotos überspringen
          </button>
        )}
      </div>
      <div className="mb-4 flex gap-1" aria-hidden="true">
        {slots.map((s, i) => (
          <span key={s.tag} className={`h-1 flex-1 rounded-full ${i <= slide ? "bg-foreground" : "bg-border"}`} />
        ))}
      </div>

      <div key={`${current.tag}-${slide}`} className={dir === "next" ? "animate-slide-in-right" : "animate-slide-in-left"} data-testid={`slide-${current.tag}`}>
        <h3 className="text-xl font-bold text-foreground mb-1">{current.title}</h3>
        <p className={`text-sm mb-4 ${isDashboard ? "font-semibold text-foreground rounded-2xl border-2 border-foreground p-3" : "text-muted-foreground"}`} data-testid="slide-hint">
          {current.hint}
        </p>

        {photoBanners}

        {candidate ? (
          <div className="mb-4" data-testid="candidate-preview">
            {candidate.url ? (
              <img src={candidate.url} alt={`Vorschau ${current.title}`} className="w-full max-h-[55vh] object-contain rounded-2xl border border-border bg-secondary" />
            ) : (
              <div className="w-full h-56 rounded-2xl border border-border bg-secondary flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
                Foto ausgewählt. Dieses Format kann hier nicht angezeigt werden, wird aber gespeichert.
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Noch nicht gespeichert – bitte prüfen und bestätigen.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void confirmCandidate()} disabled={uploading} className="flex-1 min-h-12 rounded-full bg-foreground text-background font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Bestätigen
              </button>
              {candidate.source === "gallery" ? (
                <label htmlFor={galleryInputId} role="button" className="flex-1 min-h-12 cursor-pointer select-none rounded-full border border-foreground font-medium flex items-center justify-center gap-2 text-sm">
                  <ImageIcon className="w-4 h-4" /> Andere auswählen
                </label>
              ) : (
                <label htmlFor={cameraInputId} role="button" className="flex-1 min-h-12 cursor-pointer select-none rounded-full border border-foreground font-medium flex items-center justify-center gap-2 text-sm">
                  <Camera className="w-4 h-4" /> Erneut aufnehmen
                </label>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`mb-4 rounded-2xl border-2 p-3 ${done ? "border-foreground" : "border-dashed border-border"}`}>
              {confirmedThumb ?? <ReturnSlotOutline kind={current.outline} className="max-h-56" />}
              {done && (
                <p className="mt-2 text-xs font-semibold text-foreground flex items-center gap-1" data-testid="slot-confirmed">
                  <Check className="w-4 h-4" /> {hasPhoto(current.tag) ? (photos[current.tag] ? "Bestätigt und übertragen" : "Bestätigt – auf diesem Gerät gespeichert") : "Problem gemeldet – wird geprüft"}
                </p>
              )}
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label htmlFor={cameraInputId} role="button" onClick={() => setPickError(null)} className="min-h-12 cursor-pointer select-none rounded-full bg-foreground text-background font-semibold flex items-center justify-center gap-2 text-sm">
                <Camera className="w-4 h-4" /> Foto aufnehmen
              </label>
              <label htmlFor={galleryInputId} role="button" onClick={() => setPickError(null)} className="min-h-12 cursor-pointer select-none rounded-full border border-foreground font-semibold flex items-center justify-center gap-2 text-sm">
                <ImageIcon className="w-4 h-4" /> Aus Galerie auswählen
              </label>
            </div>
            <button type="button" onClick={() => setLiveOpen(true)} className="mb-4 w-full min-h-11 text-xs text-muted-foreground underline flex items-center justify-center gap-1">
              {current.tag === RETURN_RECEIPT_TAG ? <ScanLine className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />} Live-Kamera mit Rahmen verwenden
            </button>
          </>
        )}
        {pickError && <p role="alert" className="mb-4 text-xs text-foreground">{pickError}</p>}

        {isDashboard && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="ret-endkm">Kilometerstand (Ende)</label>
              <input
                id="ret-endkm"
                type="number"
                inputMode="numeric"
                value={endKm}
                onChange={(e) => {
                  setEndKm(e.target.value);
                  setEndKmManual(true);
                }}
                placeholder="z.B. 42920"
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="ret-fuel">Tankstand (Ende, in %)</label>
              <input
                id="ret-fuel"
                type="number"
                min={0}
                max={100}
                value={endFuelPercent}
                onChange={(e) => {
                  setEndFuelPercent(e.target.value);
                  setFuelManual(true);
                }}
                placeholder="z.B. 75"
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {aiBusy && <p className="text-xs text-muted-foreground">🤖 KI liest Kilometer- und Tankstand…</p>}
            {!aiBusy && aiRecognition && (
              <p className="text-xs text-muted-foreground">
                🤖 KI-Vorschlag: {aiRecognition.km !== null ? `${aiRecognition.km.toLocaleString("de-DE")} km` : "Kilometerstand nicht lesbar"}
                {aiRecognition.fuelPercent !== null ? ` · Tank ${aiRecognition.fuelPercent}%` : ""}
                {aiRecognition.confidence === "low" ? " (unsicher – bitte prüfen)" : " – bitte prüfen"}
              </p>
            )}
            <fieldset className="rounded-2xl border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">Hast du während der Miete getankt?</legend>
              <div className="mt-1 flex gap-2">
                {[true, false].map((v) => (
                  <label key={String(v)} className={`flex-1 min-h-11 rounded-full border flex items-center justify-center gap-2 text-sm cursor-pointer ${refueled === v ? "border-foreground bg-secondary font-semibold" : "border-border"}`}>
                    <input type="radio" name="ret-refueled" className="sr-only" checked={refueled === v} onChange={() => setRefueled(v)} />
                    {v ? "Ja" : "Nein"}
                  </label>
                ))}
              </div>
              {refueled === true && <p className="mt-2 text-xs text-muted-foreground">Im nächsten Schritt fotografierst du den Tankbeleg.</p>}
            </fieldset>
          </div>
        )}

        {!hasPhoto(current.tag) && exceptionBox(current.exKey, exceptionLabel(current))}

        {actionError && <TripErrorBanner message={actionError} onRetry={() => void next()} busy={saving} />}
      </div>

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={back} className="min-h-12 px-5 rounded-full border border-border font-medium flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => void next()}
          className={`flex-1 min-h-12 rounded-full font-semibold flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${done ? "bg-accent text-accent-foreground shadow-lg" : "bg-secondary text-foreground"}`}
        >
          {editingTag ? "Zur Übersicht" : slide + 1 >= slots.length ? "Zur Übersicht" : "Weiter"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
