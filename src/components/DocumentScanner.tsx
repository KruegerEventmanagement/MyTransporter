import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, RotateCcw, CheckCircle, Loader2, AlertTriangle, Zap, ZapOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { verifyIdDocument } from "@/lib/id-verify.functions";

type ScanSide = "front" | "back";
type ScanPhase =
  | "idle"
  | "camera"
  | "countdown"
  | "capturing"
  | "verifying"
  | "verified"
  | "error"
  | "rejected";

const REASON_MSG: Record<string, (side: ScanSide, docName: string, extracted?: string | null, profile?: string) => string> = {
  blurry: (side, name) => `Bild zu unscharf. Bitte ruhig halten, gutes Licht und ${side === "front" ? "Vorderseite" : "Rückseite"} vom ${name} erneut scannen.`,
  wrong_document_type: (_side, name) => `Das erkannte Dokument passt nicht. Bitte einen echten ${name} halten (keine andere Karte).`,
  wrong_side: (side, name) => `Falsche Seite. Bitte ${side === "front" ? "Vorderseite" : "Rückseite"} vom ${name} zeigen.`,
  not_authentic: (_side, name) => `Das Original-${name} wurde nicht eindeutig erkannt. Bitte echte Karte gerade, hell und vollständig in den Rahmen halten.`,
  name_mismatch: (_side, _name, extracted, profile) =>
    `Name auf dem Dokument (${extracted ?? "unbekannt"}) stimmt nicht mit deinem Profil (${profile ?? "?"}) überein.`,
  profile_incomplete: () => `Bitte ergänze zuerst Vor- und Nachname in deinem Profil.`,
  ai_error: () => `Die KI-Prüfung ist fehlgeschlagen. Bitte erneut versuchen.`,
};

interface DocumentScannerProps {
  documentType: "license" | "id";
  onComplete: () => void;
  isComplete: boolean;
}

const DOC_LABELS = {
  license: { name: "Führerschein", icon: "🪪" },
  id: { name: "Personalausweis", icon: "🪪" },
};

export function DocumentScanner({ documentType, onComplete, isComplete }: DocumentScannerProps) {
  const [phase, setPhase] = useState<ScanPhase>(isComplete ? "verified" : "idle");
  const [side, setSide] = useState<ScanSide>("front");
  const [frontDone, setFrontDone] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [progressStep, setProgressStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [rejectMsg, setRejectMsg] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const verifyFn = useServerFn(verifyIdDocument);
  const runCaptureRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const label = DOC_LABELS[documentType];

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
      // Autofokus + Torch-Erkennung (best effort)
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

  // Schärfe-Heuristik: Laplacian-Varianz auf zentralem 200×200-Ausschnitt.
  const checkSharpness = useCallback((canvas: HTMLCanvasElement): number => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const size = 200;
    const cx = Math.max(0, Math.floor((canvas.width - size) / 2));
    const cy = Math.max(0, Math.floor((canvas.height - size) / 2));
    const img = ctx.getImageData(cx, cy, size, size);
    const gray = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const r = img.data[i * 4];
      const g = img.data[i * 4 + 1];
      const b = img.data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const lap = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - size] + gray[i + size];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  }, []);

  const runCapture = useCallback(async () => {
    setPhase("capturing");
    setProgressStep(1);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        throw new Error("Kamera nicht bereit");
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-Kontext fehlt");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const sharpness = checkSharpness(canvas);
      // Die lokale Schärfe-Heuristik darf nicht zu streng sein: echte Handy-
      // Fotos mit Hologrammen/Reflexionen fallen sonst durch, obwohl die KI sie
      // lesen kann. Nur wirklich komplett verwaschene Bilder werden lokal
      // blockiert; alles andere geht in die KI-Prüfung.
      if (sharpness < 12) {
        setRejectMsg("Bild zu unscharf. Bitte näher ran, gutes Licht nutzen und erneut auslösen.");
        setPhase("rejected");
        return;
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      const base64Only = dataUrl.split(",")[1] ?? "";

      setProgressStep(2);
      const result = await verifyFn({ data: { imageBase64: base64Only, docType: documentType, side } });

      setProgressStep(3);

      if (!result.ok) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user
          ? await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle()
          : { data: null as { first_name: string | null; last_name: string | null } | null };
        const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || undefined;
        const fn = REASON_MSG[result.reason ?? "ai_error"] ?? REASON_MSG.ai_error;
        setRejectMsg(fn(side, label.name, result.extractedName, profileName));
        setPhase("rejected");
        return;
      }

      // OK: Upload + DB-Insert
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
      if (!blob) throw new Error("Bild konnte nicht erstellt werden");
      const docTypeKey = `${documentType}_${side}`;
      const path = `${user.id}/${docTypeKey}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("user-documents")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      await supabase.from("user_documents").insert({
        user_id: user.id,
        doc_type: docTypeKey,
        photo_url: path,
        ai_verified: true,
        ai_document_class: result.documentClass,
        ai_extracted_name: result.extractedName,
        ai_reason: null,
        verified_at: new Date().toISOString(),
      });

      setProgressStep(4);
      stopCamera();

      if (!frontDone) {
        setFrontDone(true);
        setSide("back");
        setPhase("idle");
      } else {
        setPhase("verified");
        onComplete();
      }
    } catch (err) {
      console.error("Document verify error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    }
  }, [checkSharpness, verifyFn, documentType, side, frontDone, label.name, onComplete, stopCamera]);

  // Halte die aktuelle runCapture-Referenz stabil erreichbar, damit der
  // Countdown-Effekt sie nicht in seinen Dependencies führen muss.
  useEffect(() => {
    runCaptureRef.current = runCapture;
  }, [runCapture]);

  // Countdown-Steuerung: einmaliges Interval pro Countdown-Phase, unabhängig
  // von der Identität von runCapture (die sich bei jedem Render ändern kann).
  useEffect(() => {
    if (phase !== "countdown") return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          void runCaptureRef.current?.();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const startCountdown = () => {
    setCountdown(3);
    setPhase("countdown");
  };

  const handleClose = () => {
    stopCamera();
    setPhase(isComplete ? "verified" : "idle");
    setRejectMsg("");
  };

  const retryFromRejected = () => {
    setRejectMsg("");
    setProgressStep(0);
    if (streamRef.current) {
      setPhase("camera");
    } else {
      void startCamera();
    }
  };

  // Reattach an existing MediaStream to the <video> whenever we (re)enter
  // the camera phase. Without this, retry after a rejection remounts the
  // <video> element but never re-binds srcObject, leaving a black preview.
  useEffect(() => {
    if (phase !== "camera") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.play().catch(() => {
      /* ignore autoplay errors */
    });
  }, [phase]);

  // Idle state, button
  if (phase === "idle" || phase === "verified") {
    return (
      <button
        onClick={() => {
          if (phase !== "verified") startCamera();
        }}
        disabled={phase === "verified"}
        className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all ${
          phase === "verified"
            ? "border-border bg-secondary"
            : "border-border bg-card hover:border-accent/50 hover:shadow-sm"
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          phase === "verified" ? "bg-muted" : "bg-accent/10"
        }`}>
          {phase === "verified" ? (
            <CheckCircle className="w-5 h-5 text-foreground" />
          ) : (
            <Camera className="w-5 h-5 text-accent" />
          )}
        </div>
        <div className="flex-1 text-left">
          <p className="font-medium text-foreground">{label.name} scannen</p>
          <p className="text-sm text-muted-foreground">
            {phase === "verified"
              ? "✓ Vorder- & Rückseite verifiziert"
              : frontDone
                ? "Rückseite noch ausstehend"
                : "Vorder- und Rückseite fotografieren"}
          </p>
        </div>
        {phase !== "verified" && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
            {frontDone ? "Weiter" : "Scannen"}
          </span>
        )}
      </button>
    );
  }

  // Fullscreen camera / scanning / verifying overlay
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={handleClose} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="text-center">
          <p className="text-white font-medium text-sm">{label.name}</p>
          <p className="text-white/70 text-xs">{side === "front" ? "Vorderseite" : "Rückseite"}</p>
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
      {(phase === "camera" || phase === "countdown" || phase === "capturing") && (
        <>
          <video
            ref={videoRef}
            className="flex-1 object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Card overlay guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Darkened corners */}
            <div className="relative w-[85%] max-w-[360px] aspect-[1.586/1]">
              {/* Card border */}
              <div className="absolute inset-0 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              
              {/* Corner marks */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />

              {/* Countdown */}
              {phase === "countdown" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-8xl font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                    {countdown > 0 ? countdown : "📸"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
            <p className="text-white text-center text-lg font-medium mb-2">
              {phase === "capturing"
                ? "Bild wird aufgenommen..."
                : phase === "countdown"
                  ? "Ruhig halten..."
                  : `Bitte ${side === "front" ? "Vorderseite" : "Rückseite"} des ${label.name}s in den Rahmen halten`}
            </p>
            <p className="text-white/60 text-center text-sm mb-6">
              {phase === "camera"
                ? "Scharfstellen lassen, dann auslösen · KI prüft Dokument & Namen"
                : "Bitte stillhalten für scharfes Bild"}
            </p>

            {phase === "camera" && (
              <div className="flex justify-center">
                <button
                  onClick={startCountdown}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-full border-4 border-black/10" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Verifying state */}
      {(phase === "capturing" || phase === "verifying") && progressStep >= 1 && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">KI-Prüfung läuft</h3>
          <p className="text-white/60 text-center text-sm mb-8">
            {side === "front" ? "Vorderseite" : "Rückseite"} wird analysiert.
          </p>
          <div className="space-y-2 text-sm text-white/50">
            <p className={progressStep >= 1 ? "text-white" : ""}>
              {progressStep >= 1 ? "✓" : "○"} Bild aufgenommen
            </p>
            <p className={progressStep >= 2 ? "text-white" : ""}>
              {progressStep >= 2 ? "✓" : "○"} KI analysiert Dokument
            </p>
            <p className={progressStep >= 3 ? "text-white" : ""}>
              {progressStep >= 3 ? "✓" : "○"} Namensabgleich mit Profil
            </p>
            <p className={progressStep >= 4 ? "text-white" : ""}>
              {progressStep >= 4 ? "✓" : "○"} Verifiziert
            </p>
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
              onClick={startCamera}
              className="px-6 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}