import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { Camera, X, RotateCcw, CheckCircle, AlertTriangle, Zap, ZapOff, Loader2, Image as ImageIcon, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTapFocus } from "@/hooks/useTapFocus";
import {
  canvasToJpegBlob,
  classifyCameraError,
  getUserMediaWithTimeout,
  normalizeImageFile,
  stopStream,
  waitForVideoFrame,
  imageExtension,
  type CameraErrorKind,
} from "@/lib/image-capture";

type ScanPhase = "idle" | "camera" | "capturing" | "preview" | "error" | "rejected";

export type ScanDocType = "id_front" | "id_back" | "license_front" | "license_back";

export const SCAN_DOC_LABELS: Record<ScanDocType, { title: string; hint: string }> = {
  id_front: { title: "Personalausweis · Vorderseite", hint: "Seite mit Foto" },
  id_back: { title: "Personalausweis · Rückseite", hint: "Seite mit Adresse" },
  license_front: { title: "Führerschein · Vorderseite", hint: "Seite mit Foto" },
  license_back: { title: "Führerschein · Rückseite", hint: "Seite mit Klassen" },
};

const withTimeout = async <T,>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

interface DocumentScannerProps {
  /** Exactly one side per field. */
  docType: ScanDocType;
  /** True when a photo for this side is already stored/buffered. */
  isComplete: boolean;
  onComplete: () => void | Promise<void>;
  /** Removes the currently stored photo for this side (called before a replacement). */
  onReset?: () => void | Promise<void>;
  /** Small thumbnail of the stored photo, if available. */
  previewUrl?: string | null;
  /**
   * "pending" buffers the capture locally (no account required) and hands it
   * to onCapture instead of uploading it to the backend.
   */
  mode?: "upload" | "pending";
  onCapture?: (docType: ScanDocType, blob: Blob) => void | Promise<void>;
  /** Zeitlimits (nur für Tests überschreibbar). */
  cameraTimeoutMs?: number;
  frameTimeoutMs?: number;
}

export function DocumentScanner({
  docType,
  isComplete,
  onComplete,
  previewUrl: storedPreviewUrl = null,
  mode = "upload",
  onCapture,
  cameraTimeoutMs = 12000,
  frameTimeoutMs = 6000,
}: DocumentScannerProps) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [rejectMsg, setRejectMsg] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  /** Speicherpfad, falls die aktuelle Aufnahme bereits hochgeladen wurde (Retry ohne Doppel-Upload). */
  const uploadedPathRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { focusPoint, handleTap } = useTapFocus(videoRef, streamRef);
  /** Zwei echte native Eingaben: Kamera (capture) und Galerie (ohne capture). */
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const lastPickerRef = useRef<"camera" | "gallery">("gallery");
  const inputIdBase = useId();
  const cameraInputId = `${inputIdBase}-camera`;
  const galleryInputId = `${inputIdBase}-gallery`;
  /** Live-Kamera nur anbieten, wenn der Browser sie grundsätzlich unterstützt (nach Hydration ermittelt). */
  const [liveSupported, setLiveSupported] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorKind | "native">("unsupported");
  /** Herkunft der aktuellen Vorschau: native Dateiauswahl oder Live-Kamera. */
  const sourceRef = useRef<"file" | "live" | null>(null);
  /** Erhöht sich bei jedem Start/Schließen – verspätete Ergebnisse werden verworfen. */
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  const shotUrlRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const replaceShotUrl = useCallback((next: string | null) => {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
    shotUrlRef.current = next;
    setShotUrl(next);
  }, []);

  const label = SCAN_DOC_LABELS[docType];

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!mountedRef.current) return;
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const startCamera = useCallback(async () => {
    const gen = ++genRef.current;
    const stale = () => gen !== genRef.current || !mountedRef.current;
    setRejectMsg("");
    stopCamera();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia || (typeof window !== "undefined" && window.isSecureContext === false)) {
      // e.g. iOS home-screen app / in-app browser without live camera API
      setCameraError("unsupported");
      setPhase("error");
      return;
    }
    setPhase("camera");
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await getUserMediaWithTimeout(
          md,
          {
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          },
          cameraTimeoutMs,
          stale,
        );
      } catch (first) {
        const kind = classifyCameraError(first);
        if (stale() || kind === "denied" || kind === "timeout") throw first;
        // Overconstrained / NotReadable on some iPhones: retry with minimal constraints.
        stream = await getUserMediaWithTimeout(md, { video: true, audio: false }, cameraTimeoutMs, stale);
      }
      if (stale()) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      let video = videoRef.current;
      for (let i = 0; !video && i < 60 && !stale(); i += 1) {
        await new Promise((r) => setTimeout(r, 16));
        video = videoRef.current;
      }
      if (stale()) {
        stopStream(stream);
        return;
      }
      if (!video) throw new DOMException("Kein Videoelement", "AbortError");
      video.srcObject = stream;
      // iOS may reject play() without breaking the stream – entscheidend ist ein echtes Bild.
      // play() nicht abwarten (kann nie auflösen); Bildbereitschaft hat eigene Deadline.
      try {
        void Promise.resolve(video.play()).catch(() => undefined);
      } catch {
        /* ignore */
      }
      await waitForVideoFrame(video, frameTimeoutMs);
      if (stale()) return;
      const track = stream.getVideoTracks()[0];
      try {
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
        const advanced: MediaTrackConstraintSet[] = [];
        if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        if (advanced.length) await track.applyConstraints({ advanced });
        if (caps.torch && !stale()) setTorchAvailable(true);
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (stale()) {
        stopStream(stream);
        return;
      }
      stopStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
      console.warn("Camera error:", (err as { name?: string })?.name);
      setCameraError(classifyCameraError(err));
      setPhase("error");
    }
  }, [stopCamera, cameraTimeoutMs, frameTimeoutMs]);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      // Abbruch der Auswahl: bisherige Vorschau/Phase bleibt unverändert.
      if (!file) return;
      const gen = ++genRef.current;
      stopCamera();
      try {
        // Normalize to JPEG (also converts HEIC on iOS, which decodes it natively).
        const blob = await normalizeImageFile(file);
        if (gen !== genRef.current || !mountedRef.current) return;
        pendingBlobRef.current = blob;
        uploadedPathRef.current = null;
        sourceRef.current = "file";
        setPreviewBroken(false);
        replaceShotUrl(URL.createObjectURL(blob));
        setRejectMsg("");
        setPhase("preview");
      } catch (err) {
        if (gen !== genRef.current || !mountedRef.current) return;
        setRejectMsg(err instanceof Error ? err.message : "Foto konnte nicht gelesen werden.");
        setPhase("rejected");
      }
    },
    [stopCamera, replaceShotUrl],
  );

  /**
   * Bewusster Wechsel zur nativen Kamera/Galerie: laufende oder noch startende
   * Live-Kamera beenden (sonst kann sie die Gerätekamera blockieren), dann
   * synchron im Nutzerklick öffnen. Eine vorhandene Vorschau bleibt erhalten.
   */
  const prepareNativePicker = (kind: "camera" | "gallery") => {
    lastPickerRef.current = kind;
    genRef.current += 1;
    stopCamera();
    if (phase === "camera" || phase === "error") {
      setCameraError("native");
      setPhase("error");
    }
  };

  /** Öffnet die native Auswahl synchron im Nutzerklick (kein await davor – sonst blockt iOS). */
  const openFilePicker = (kind: "camera" | "gallery" = lastPickerRef.current) => {
    prepareNativePicker(kind);
    (kind === "camera" ? cameraInputRef : galleryInputRef).current?.click();
  };

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    setLiveSupported(!!md?.getUserMedia && window.isSecureContext !== false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current += 1;
      stopCamera();
      if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
      shotUrlRef.current = null;
    };
  }, [stopCamera]);

  const runCapture = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const gen = genRef.current;
    setPhase("capturing");
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Kamera nicht bereit");
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const rect = video.getBoundingClientRect();

      // Crop exactly to the on-screen guide frame (85% width, max 360px, ID aspect).
      const guideW = Math.min(rect.width * 0.85, 360);
      const guideH = guideW / 1.586;
      // object-cover: displayed = source * s
      const s = Math.max(rect.width / vw, rect.height / vh) || 1;
      let cropW = Math.min(vw, guideW / s);
      let cropH = Math.min(vh, guideH / s);
      if (!isFinite(cropW) || cropW <= 0) cropW = vw;
      if (!isFinite(cropH) || cropH <= 0) cropH = vh;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      canvas.width = Math.round(cropW);
      canvas.height = Math.round(cropH);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-Kontext fehlt");
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToJpegBlob(canvas);
      if (!mountedRef.current || gen !== genRef.current) return;
      pendingBlobRef.current = blob;
      uploadedPathRef.current = null;
      sourceRef.current = "live";
      setPreviewBroken(false);
      replaceShotUrl(URL.createObjectURL(blob));
      setPhase("preview");
    } catch (err) {
      if (!mountedRef.current || gen !== genRef.current) return;
      console.error("Document capture error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    } finally {
      busyRef.current = false;
    }
  }, [replaceShotUrl]);


  const confirmUpload = useCallback(async () => {
    const blob = pendingBlobRef.current;
    if (!blob || busyRef.current) return;
    busyRef.current = true;
    const gen = genRef.current;
    const stale = () => !mountedRef.current || gen !== genRef.current;
    setPhase("capturing");
    try {
      if (mode === "pending") {
        if (onCapture) {
          await withTimeout(
            Promise.resolve(onCapture(docType, blob)),
            5_000,
            "Das Foto konnte nicht dauerhaft gespeichert werden. Bitte erneut versuchen.",
          );
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Nicht angemeldet");
        let path = uploadedPathRef.current;
        if (!path) {
          const contentType = blob.type || "image/jpeg";
          const candidate = `${user.id}/${docType}_${Date.now()}.${imageExtension(contentType)}`;
          const { error: upErr } = await supabase.storage
            .from("user-documents")
            .upload(candidate, blob, { contentType, upsert: false });
          if (upErr) throw upErr;
          path = candidate;
          uploadedPathRef.current = candidate;
        }
        // Retry nach verlorener Antwort: vorhandenen Eintrag genau dieses Pfads wiederverwenden.
        let inserted: { id: string } | null = null;
        const { data: existing } = await supabase
          .from("user_documents")
          .select("id")
          .eq("user_id", user.id)
          .eq("photo_url", path)
          .maybeSingle();
        if (existing?.id) {
          inserted = existing;
        } else {
          const { data, error: insErr } = await supabase
            .from("user_documents")
            .insert({
              user_id: user.id,
              doc_type: docType,
              photo_url: path,
              ai_verified: true,
              verified_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (insErr || !data) throw insErr ?? new Error("Eintrag nicht bestätigt");
          inserted = data;
        }
        // Erst wenn das neue Foto sicher gespeichert ist, ältere Aufnahmen
        // derselben Seite zurückziehen – so geht bei Uploadfehlern nichts verloren.
        if (isComplete && inserted?.id) {
          const { error: retireErr } = await supabase
            .from("user_documents")
            .update({ deleted_by_user_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("doc_type", docType)
            .is("deleted_by_user_at", null)
            .neq("id", inserted.id);
          if (retireErr) console.warn("Altes Dokument bleibt gespeichert:", retireErr.message);
        }
      }

      if (!mountedRef.current) return;
      if (stale()) {
        // Während des Speicherns geschlossen: Overlay nicht wieder öffnen,
        // gespeichertes Foto aber in der Übersicht aktualisieren.
        pendingBlobRef.current = null;
        uploadedPathRef.current = null;
        void Promise.resolve(onComplete()).catch(() => undefined);
        return;
      }
      pendingBlobRef.current = null;
      uploadedPathRef.current = null;
      sourceRef.current = null;
      replaceShotUrl(null);
      genRef.current += 1;
      stopCamera();
      setPhase("idle");
      // Refreshing thumbnails must never keep the scanner overlay open. The
      // photo itself is already stored at this point.
      void Promise.resolve(onComplete()).catch((error) => {
        console.warn("Document refresh error:", error);
      });
    } catch (err) {
      if (stale()) return;
      console.error("Document upload error:", err);
      setRejectMsg(
        err instanceof Error && err.message
          ? `Speichern fehlgeschlagen: ${err.message}`
          : "Speichern fehlgeschlagen. Bitte erneut versuchen.",
      );
      setPhase("rejected");
    } finally {
      busyRef.current = false;
    }
  }, [docType, isComplete, onComplete, stopCamera, replaceShotUrl, mode, onCapture]);

  const retakeFromPreview = useCallback(() => {
    if (sourceRef.current === "file") {
      // Datei-Vorschau: im selben Klick erneut die native Auswahl öffnen.
      // Bei Abbruch bleibt die bisherige Vorschau bestehen – kein Livekamerastart.
      openFilePicker();
      return;
    }
    pendingBlobRef.current = null;
    sourceRef.current = null;
    replaceShotUrl(null);
    const hasLiveStream = !!streamRef.current?.getVideoTracks().some((track) => track.readyState === "live");
    if (hasLiveStream) setPhase("camera");
    else void startCamera();
  }, [replaceShotUrl, startCamera]);

  const handleClose = () => {
    genRef.current += 1;
    stopCamera();
    pendingBlobRef.current = null;
    sourceRef.current = null;
    replaceShotUrl(null);
    setPhase("idle");
    setRejectMsg("");
  };

  const retryFromRejected = () => {
    setRejectMsg("");
    if (pendingBlobRef.current && shotUrlRef.current) {
      // Speichern fehlgeschlagen: dieselbe Aufnahme erneut anbieten.
      setPhase("preview");
      return;
    }
    const hasLiveStream = !!streamRef.current?.getVideoTracks().some((track) => track.readyState === "live");
    if (hasLiveStream) {
      setPhase("camera");
    } else if (sourceRef.current === "file") {
      openFilePicker();
    } else {
      void startCamera();
    }
  };

  // Reattach an existing MediaStream to the <video> whenever we (re)enter the
  // camera phase — otherwise a retry shows a black preview.
  useEffect(() => {
    if (phase !== "camera") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {
      /* ignore autoplay errors */
    });
  }, [phase]);

  // Echte, nur visuell versteckte Eingaben (kein display:none – iOS/Android öffnen sie so zuverlässig).
  // Aktivierung ausschließlich per <label htmlFor> bzw. synchronem click() im Nutzerklick.
  const fileInputs = (
    <>
      <input
        ref={cameraInputRef}
        id={cameraInputId}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="doc-camera-input"
        onChange={handleFilePicked}
      />
      <input
        ref={galleryInputRef}
        id={galleryInputId}
        type="file"
        accept="image/*,.heic,.heif"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="doc-gallery-input"
        onChange={handleFilePicked}
      />
    </>
  );

  const pickerLabels = (variant: "card" | "overlay") => {
    const base =
      variant === "card"
        ? "flex-1 cursor-pointer select-none py-2.5 text-xs font-medium text-foreground hover:bg-secondary/60 flex items-center justify-center gap-1.5"
        : "cursor-pointer select-none px-6 py-3 rounded-full font-medium flex items-center justify-center gap-2";
    return (
      <>
        <label
          htmlFor={cameraInputId}
          role="button"
          onClick={() => prepareNativePicker("camera")}
          className={variant === "card" ? `${base} border-r border-border` : `${base} bg-accent text-accent-foreground`}
        >
          <Camera className="w-4 h-4" /> Foto aufnehmen
        </label>
        <label
          htmlFor={galleryInputId}
          role="button"
          onClick={() => prepareNativePicker("gallery")}
          className={variant === "card" ? base : `${base} bg-white/15 text-white`}
        >
          <ImageIcon className="w-4 h-4" /> Aus Galerie auswählen
        </label>
      </>
    );
  };

  if (phase === "idle") {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {fileInputs}
        <div className="w-full p-3 flex items-center gap-3 text-left">
          <div className="w-16 h-11 shrink-0 rounded-lg bg-secondary border border-border overflow-hidden flex items-center justify-center">
            {isComplete && storedPreviewUrl ? (
              <img src={storedPreviewUrl} alt={label.title} className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm truncate">{label.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {isComplete ? "Gespeichert – unten ersetzen" : label.hint}
            </p>
          </div>
          {isComplete && <CheckCircle className="w-6 h-6 text-green-600 shrink-0" aria-label="Foto vorhanden" />}
        </div>
        <div className="flex border-t border-border">{pickerLabels("card")}</div>
        {liveSupported && (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="w-full border-t border-border py-2 text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
          >
            <ScanLine className="w-3.5 h-3.5" /> Live-Scanner mit Rahmen
          </button>
        )}
      </div>
    );
  }

  // Fullscreen camera / capture / preview overlay (portalled to <body> so no
  // transformed ancestor can trap the fixed layer inside the page).
  const overlay = (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] max-h-[100dvh] overflow-hidden bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={handleClose} aria-label="Schließen" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="text-center">
          <p className="text-white font-medium text-sm">{label.title}</p>
          <p className="text-white/70 text-xs">{label.hint}</p>
        </div>
        {torchAvailable ? (
          <button onClick={toggleTorch} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {torchOn ? <ZapOff className="w-5 h-5 text-white" /> : <Zap className="w-5 h-5 text-white" />}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Camera view */}
      {(phase === "camera" || phase === "capturing") && (
        <>
          <video
            ref={videoRef}
            onPointerDown={handleTap}
            className="h-full w-full min-h-0 object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {focusPoint && (
            <div
              className="absolute pointer-events-none w-16 h-16 -ml-8 -mt-8 border-2 border-white rounded-md transition-opacity duration-200"
              style={{
                left: `${focusPoint.x}%`,
                top: `${focusPoint.y}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
              }}
            />
          )}

          {/* Card overlay guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[85%] max-w-[360px] aspect-[1.586/1]">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <p className="text-white text-center text-lg font-medium mb-2">
              {phase === "capturing"
                ? "Bild wird aufgenommen..."
                : `Bitte ${label.title} in den Rahmen halten`}
            </p>
            <p className="text-white/60 text-center text-sm mb-6">
              Positionieren, dann Auslöser drücken
            </p>

            {phase === "camera" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={runCapture}
                  aria-label="Auslöser"
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-full border-4 border-black/10" />
                </button>
                <div className="flex gap-4 text-xs text-white/80">
                  <label htmlFor={cameraInputId} role="button" onClick={() => prepareNativePicker("camera")} className="cursor-pointer underline underline-offset-2">
                    Geräte-Kamera
                  </label>
                  <label htmlFor={galleryInputId} role="button" onClick={() => prepareNativePicker("gallery")} className="cursor-pointer underline underline-offset-2">
                    Aus Galerie
                  </label>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Saving state */}
      {phase === "capturing" && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Foto wird gespeichert</h3>
          <p className="text-white/60 text-center text-sm">{label.title}</p>
        </div>
      )}

      {/* Preview state — user must confirm or retake */}
      {phase === "preview" && shotUrl && (
        <div className="absolute inset-0 bg-black flex flex-col">
          <div className="flex-1 flex items-center justify-center p-4">
            {previewBroken ? (
              <p className="text-white/80 text-center text-sm max-w-xs">
                Vorschau in diesem Browser nicht möglich (z. B. HEIC-Foto). Das Foto wird trotzdem gespeichert.
              </p>
            ) : (
              <img
                src={shotUrl}
                alt="Aufgenommenes Dokument"
                onError={() => setPreviewBroken(true)}
                className="max-w-full max-h-full object-contain rounded-2xl"
              />
            )}
          </div>
          <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 to-transparent">
            <p className="text-white text-center text-base font-medium mb-4">
              Sieht das Bild gut aus?
            </p>
            <div className="flex gap-3">
              <button
                onClick={retakeFromPreview}
                className="flex-1 px-4 py-3 rounded-full bg-white/15 text-white font-medium flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Erneut
              </button>
              <button
                onClick={confirmUpload}
                className="flex-1 px-4 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejected state */}
      {phase === "rejected" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Bitte erneut scannen</h3>
          <p className="text-white/70 text-center text-sm mb-8 max-w-sm">{rejectMsg}</p>
          <div className="flex gap-3">
            <button onClick={handleClose} className="px-6 py-3 rounded-full bg-white/10 text-white font-medium">
              Abbrechen
            </button>
            <button
              onClick={retryFromRejected}
              className="px-6 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2 text-center">
            {cameraError === "denied"
              ? "Kamerazugriff nicht erlaubt"
              : cameraError === "busy"
                ? "Kamera wird gerade verwendet"
                : cameraError === "timeout"
                  ? "Live-Kamera startet nicht"
                  : cameraError === "native"
                    ? "Foto auswählen"
                    : "Live-Kamera nicht verfügbar"}
          </h3>
          <p className="text-white/60 text-center text-sm mb-8 max-w-sm">
            {cameraError === "denied"
              ? "Erlaube den Kamerazugriff (iPhone: „aA“ in der Adressleiste → Website-Einstellungen → Kamera → Erlauben) und tippe auf „Erneut versuchen“ – oder nimm das Foto direkt mit der iPhone-Kamera auf."
              : cameraError === "busy"
                ? "Schließe andere Apps, die die Kamera nutzen, und versuche es erneut – oder nimm das Foto direkt auf."
                : cameraError === "timeout"
                  ? "Die Kamera liefert kein Bild. Versuche es erneut – oder nimm das Foto direkt mit der Kamera deines Geräts auf."
                  : cameraError === "native"
                    ? "Nimm das Foto mit der Kamera deines Geräts auf oder wähle ein vorhandenes Foto aus der Galerie."
                    : "Nimm das Foto einfach direkt mit der Kamera deines Geräts auf oder wähle ein vorhandenes Foto."}
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {pickerLabels("overlay")}
            {cameraError !== "unsupported" && cameraError !== "native" && (
              <button
                onClick={() => void startCamera()}
                className="px-6 py-3 rounded-full bg-white/15 text-white font-medium flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Erneut versuchen
              </button>
            )}
            <button onClick={handleClose} className="px-6 py-3 rounded-full bg-white/10 text-white font-medium">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {fileInputs}
      {createPortal(overlay, document.body)}
    </>
  );
}
