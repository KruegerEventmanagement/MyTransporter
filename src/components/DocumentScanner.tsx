import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, RotateCcw, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

type ScanSide = "front" | "back";
type ScanPhase = "idle" | "camera" | "scanning" | "verifying" | "verified" | "error";

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
  const [verifyProgress, setVerifyProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const label = DOC_LABELS[documentType];

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const captureAndVerify = useCallback(() => {
    // Simulate capture
    setPhase("scanning");
    setTimeout(() => {
      stopCamera();
      setPhase("verifying");
      setVerifyProgress(0);
    }, 800);
  }, [stopCamera]);

  // AI verification progress simulation
  useEffect(() => {
    if (phase !== "verifying") return;
    const interval = setInterval(() => {
      setVerifyProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          if (!frontDone) {
            // Front done, need back
            setFrontDone(true);
            setSide("back");
            setPhase("idle");
          } else {
            // Both sides done
            setPhase("verified");
            onComplete();
          }
          return 100;
        }
        return p + Math.random() * 15 + 5;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [phase, frontDone, onComplete]);

  const handleClose = () => {
    stopCamera();
    setPhase(isComplete ? "verified" : "idle");
  };

  // Idle state — button
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
        <div className="w-10" />
      </div>

      {/* Camera view */}
      {(phase === "camera" || phase === "scanning") && (
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

              {/* Scanning line animation */}
              {phase === "scanning" && (
                <div className="absolute inset-x-2 h-0.5 bg-accent animate-scan-line" />
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
            <p className="text-white text-center text-lg font-medium mb-2">
              {phase === "scanning" 
                ? "Dokument wird erfasst..."
                : `Bitte ${side === "front" ? "Vorderseite" : "Rückseite"} des ${label.name}s in den Rahmen halten`}
            </p>
            <p className="text-white/60 text-center text-sm mb-6">
              {phase === "scanning" 
                ? "Bitte stillhalten"
                : "Bitte Ausweis langsam schwenken · KI prüft Echtheit"}
            </p>

            {phase === "camera" && (
              <div className="flex justify-center">
                <button
                  onClick={captureAndVerify}
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
      {phase === "verifying" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">KI-Verifizierung läuft</h3>
          <p className="text-white/60 text-center text-sm mb-8">
            {side === "front" ? "Vorderseite" : "Rückseite"} wird auf Echtheit geprüft...
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-xs bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-200"
              style={{ width: `${Math.min(verifyProgress, 100)}%` }}
            />
          </div>
          <p className="text-white/40 text-xs mt-3">{Math.min(Math.round(verifyProgress), 100)}%</p>

          <div className="mt-8 space-y-2 text-sm text-white/50">
            <p className={verifyProgress > 20 ? "text-white" : ""}>
              {verifyProgress > 20 ? "✓" : "○"} Dokument erkannt
            </p>
            <p className={verifyProgress > 50 ? "text-white" : ""}>
              {verifyProgress > 50 ? "✓" : "○"} Sicherheitsmerkmale prüfen
            </p>
            <p className={verifyProgress > 80 ? "text-white" : ""}>
              {verifyProgress > 80 ? "✓" : "○"} Echtheit bestätigt
            </p>
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