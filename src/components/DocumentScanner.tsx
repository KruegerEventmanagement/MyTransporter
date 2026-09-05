import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera, X, RotateCcw, CheckCircle, AlertTriangle, Zap, ZapOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTapFocus } from "@/hooks/useTapFocus";

type ScanPhase = "idle" | "camera" | "capturing" | "preview" | "error" | "rejected";

export type ScanDocType = "id_front" | "id_back" | "license_front" | "license_back";

export const SCAN_DOC_LABELS: Record<ScanDocType, { title: string; hint: string }> = {
  id_front: { title: "Personalausweis · Vorderseite", hint: "Seite mit Foto" },
  id_back: { title: "Personalausweis · Rückseite", hint: "Seite mit Adresse" },
  license_front: { title: "Führerschein · Vorderseite", hint: "Seite mit Foto" },
  license_back: { title: "Führerschein · Rückseite", hint: "Seite mit Klassen" },
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, encoded] = dataUrl.split(",");
  if (!header || !encoded) throw new Error("Bild konnte nicht erstellt werden");
  const mime = header.match(/^data:(.*?);base64$/)?.[1] ?? "image/jpeg";
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

const canvasToJpegBlob = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  // Some iOS/WebKit versions never invoke canvas.toBlob's callback for a
  // camera frame. Never leave the user on an endless saving screen.
  if (typeof canvas.toBlob === "function") {
    const blob = await Promise.race<Blob | null>([
      new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9)),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 1200)),
    ]);
    if (blob) return blob;
  }

  return dataUrlToBlob(canvas.toDataURL("image/jpeg", 0.9));
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
}

export function DocumentScanner({
  docType,
  isComplete,
  onComplete,
  onReset,
  previewUrl: storedPreviewUrl = null,
  mode = "upload",
  onCapture,
}: DocumentScannerProps) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [rejectMsg, setRejectMsg] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { focusPoint, handleTap } = useTapFocus(videoRef, streamRef);

  const label = SCAN_DOC_LABELS[docType];

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("camera");
    setRejectMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      try {
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
        const advanced: MediaTrackConstraintSet[] = [];
        if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        if (advanced.length) await track.applyConstraints({ advanced });
        if (caps.torch) setTorchAvailable(true);
      } catch {
        /* ignore */
      }
    } catch {
      setPhase("error");
    }
  }, []);

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
    return () => stopCamera();
  }, [stopCamera]);

  const runCapture = useCallback(async () => {
    setPhase("capturing");
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
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
      pendingBlobRef.current = blob;
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      setShotUrl(URL.createObjectURL(blob));
      setPhase("preview");
    } catch (err) {
      console.error("Document capture error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    }
  }, [shotUrl]);


  const confirmUpload = useCallback(async () => {
    const blob = pendingBlobRef.current;
    if (!blob) return;
    setPhase("capturing");
    try {
      if (mode === "pending") {
        await onCapture?.(docType, blob);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Nicht angemeldet");
        // Replacing an existing side: retire the old photo first.
        if (isComplete && onReset) await onReset();
        const path = `${user.id}/${docType}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("user-documents")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("user_documents").insert({
          user_id: user.id,
          doc_type: docType,
          photo_url: path,
          ai_verified: true,
          verified_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;
      }

      pendingBlobRef.current = null;
      if (shotUrl) {
        URL.revokeObjectURL(shotUrl);
        setShotUrl(null);
      }
      stopCamera();
      setPhase("idle");
      await onComplete();
    } catch (err) {
      console.error("Document upload error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    }
  }, [docType, isComplete, onReset, onComplete, stopCamera, shotUrl, mode, onCapture]);

  const retakeFromPreview = useCallback(() => {
    pendingBlobRef.current = null;
    if (shotUrl) {
      URL.revokeObjectURL(shotUrl);
      setShotUrl(null);
    }
    setPhase("camera");
  }, [shotUrl]);

  const handleClose = () => {
    stopCamera();
    pendingBlobRef.current = null;
    if (shotUrl) {
      URL.revokeObjectURL(shotUrl);
      setShotUrl(null);
    }
    setPhase("idle");
    setRejectMsg("");
  };

  const retryFromRejected = () => {
    setRejectMsg("");
    const hasLiveStream = !!streamRef.current?.getVideoTracks().some((track) => track.readyState === "live");
    if (hasLiveStream) {
      setPhase("camera");
    } else {
      stopCamera();
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

  // Single field: tap to capture, tap again to replace
  if (phase === "idle") {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => startCamera()}
          className="w-full p-3 flex items-center gap-3 text-left hover:bg-secondary/60 transition-colors"
        >
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
              {isComplete ? "Gespeichert – tippen zum Ändern" : `Foto aufnehmen (${label.hint})`}
            </p>
          </div>
          {isComplete ? (
            <CheckCircle className="w-6 h-6 text-green-600 shrink-0" aria-label="Foto vorhanden" />
          ) : (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground shrink-0">
              Foto
            </span>
          )}
        </button>
        {isComplete && (
          <button
            type="button"
            onClick={() => startCamera()}
            className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 py-2 border-t border-border"
          >
            Neu aufnehmen
          </button>
        )}
      </div>
    );
  }

  // Fullscreen camera / capture / preview overlay (portalled to <body> so no
  // transformed ancestor can trap the fixed layer inside the page).
  const overlay = (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={handleClose} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
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
            className="flex-1 object-cover"
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
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
            <p className="text-white text-center text-lg font-medium mb-2">
              {phase === "capturing"
                ? "Bild wird aufgenommen..."
                : `Bitte ${label.title} in den Rahmen halten`}
            </p>
            <p className="text-white/60 text-center text-sm mb-6">
              Positionieren, dann Auslöser drücken
            </p>

            {phase === "camera" && (
              <div className="flex justify-center">
                <button
                  onClick={runCapture}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-full border-4 border-black/10" />
                </button>
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
            <img
              src={shotUrl}
              alt="Aufgenommenes Dokument"
              className="max-w-full max-h-full object-contain rounded-2xl"
            />
          </div>
          <div className="p-6 pb-10 bg-gradient-to-t from-black/90 to-transparent">
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
          <h3 className="text-white text-xl font-bold mb-2">Kamera nicht verfügbar</h3>
          <p className="text-white/60 text-center text-sm mb-8">
            Bitte erlaube den Kamerazugriff oder verwende ein Gerät mit Kamera.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-3 rounded-full bg-white/10 text-white font-medium"
            >
              Abbrechen
            </button>
            <button
              onClick={() => void startCamera()}
              className="px-6 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
