import { DocumentationFeeNotice } from "./DocumentationFeeNotice";
import { useState, useCallback, useEffect } from "react";
import { Camera, ChevronRight, MessageSquare, Key, Plus, X, AlertTriangle, ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture, type SilhouetteVariant } from "./CameraCapture";
import { TripErrorBanner, TripPhotoThumb } from "./TripPhotoParts";
import {
  loadTripPhotos,
  saveTripPhoto,
  TripPhotoError,
  updateBookingChecked,
  type StoredTripPhoto,
} from "@/lib/trip-photo-store";
import { notifyAdmin } from "@/lib/admin-notify";
import { useServerFn } from "@tanstack/react-start";
import { recognizeOdometer } from "@/lib/odometer-ai.functions";

const TEST_MODE_ADMIN_EMAIL = "krueger.christian96@gmx.de";

const PHOTO_SIDES = [
  { id: "pre_front", label: "Vorne", icon: "⬆️", variant: "front" as SilhouetteVariant },
  { id: "pre_front_right", label: "Vorne rechts", icon: "↗️", variant: "three-quarter-front-right" as SilhouetteVariant },
  { id: "pre_right", label: "Rechte Seite", icon: "➡️", variant: "side-right" as SilhouetteVariant },
  { id: "pre_back_right", label: "Hinten rechts", icon: "↘️", variant: "three-quarter-back-right" as SilhouetteVariant },
  { id: "pre_back", label: "Hinten", icon: "⬇️", variant: "back" as SilhouetteVariant },
  { id: "pre_back_left", label: "Hinten links", icon: "↙️", variant: "three-quarter-back-left" as SilhouetteVariant },
  { id: "pre_left", label: "Linke Seite", icon: "⬅️", variant: "side-left" as SilhouetteVariant },
  { id: "pre_front_left", label: "Vorne links", icon: "↖️", variant: "three-quarter-front-left" as SilhouetteVariant },
] as const;

const INTERIOR_ID = "pre_interior";
const ODOMETER_ID = "pre_odometer";

type CaptureTarget =
  | { kind: "side"; id: string }
  | { kind: "interior" }
  | { kind: "damage" }
  | { kind: "odometer" };

interface PreDriveFlowProps {
  bookingId: string;
  pickupCode: string;
  onComplete: (startKm: number) => void;
}

export function PreDriveFlow({ bookingId, pickupCode, onComplete }: PreDriveFlowProps) {
  const [photos, setPhotos] = useState<Record<string, StoredTripPhoto>>({});
  const [interiorPhoto, setInteriorPhoto] = useState<StoredTripPhoto | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<StoredTripPhoto[]>([]);
  const [odometerPhoto, setOdometerPhoto] = useState<StoredTripPhoto | null>(null);
  const [photoError, setPhotoError] = useState<{
    message: string;
    target: CaptureTarget;
    file: File;
    uploadedPath: string | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [startKm, setStartKm] = useState("");
  const [codeShown, setCodeShown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isTestAdmin, setIsTestAdmin] = useState(false);
  const [aiRecognition, setAiRecognition] = useState<{ km: number | null; fuelPercent: number | null; confidence: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const recognize = useServerFn(recognizeOdometer);
  const [currentTarget, setCurrentTarget] = useState<CaptureTarget | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsTestAdmin(
        data.user?.email?.toLowerCase() === TEST_MODE_ADMIN_EMAIL.toLowerCase()
      );
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Bereits gespeicherte Fotos für diese Buchung laden (Vorschau per signierter URL)
  useEffect(() => {
    let mounted = true;
    setLoadError(null);
    (async () => {
      try {
        const rows = await loadTripPhotos(supabase, bookingId, ["pre_"]);
        if (!mounted) return;
        const sides: Record<string, StoredTripPhoto> = {};
        const damages: StoredTripPhoto[] = [];
        let interior: StoredTripPhoto | null = null;
        let odometer: StoredTripPhoto | null = null;
        for (const row of rows) {
          const photo = { path: row.photo_url, url: row.url };
          if (row.photo_type === INTERIOR_ID) interior = photo;
          else if (row.photo_type === ODOMETER_ID) odometer = photo;
          else if (row.photo_type === "pre_damage") damages.push(photo);
          else sides[row.photo_type] = photo;
        }
        if (Object.keys(sides).length) setPhotos((prev) => ({ ...sides, ...prev }));
        if (interior) setInteriorPhoto((prev) => prev ?? interior);
        if (odometer) setOdometerPhoto((prev) => prev ?? odometer);
        if (damages.length) setDamagePhotos((prev) => (prev.length ? prev : damages.slice(-4)));
      } catch (err) {
        if (mounted) setLoadError(err instanceof Error ? err.message : "Gespeicherte Fotos konnten nicht geladen werden.");
      }
    })();
    return () => { mounted = false; };
  }, [bookingId, loadAttempt]);

  const allSidesTaken = PHOTO_SIDES.every((s) => photos[s.id]);
  const interiorTaken = !!interiorPhoto;
  const readyToStart = allSidesTaken && interiorTaken && !!odometerPhoto;

  const fillTestPhotos = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`
      );
    const test = { path: "admin-test", url: placeholder };
    const next: Record<string, StoredTripPhoto> = {};
    PHOTO_SIDES.forEach((s) => (next[s.id] = test));
    setPhotos(next);
    setInteriorPhoto(test);
    setOdometerPhoto(test);
    // kein Auto-Prefill mehr – der Nutzer muss echten Tachostand eintragen
  };

  const savePhoto = useCallback(
    async (file: File, target: CaptureTarget, uploadedPath: string | null = null) => {
      setUploading(true);
      setPhotoError(null);
      const tag =
        target.kind === "side"
          ? target.id
          : target.kind === "interior"
          ? INTERIOR_ID
          : target.kind === "odometer"
          ? ODOMETER_ID
          : "pre_damage";
      try {
        // Erfolg erst nach Storage-Upload UND bestätigtem Datenbankeintrag.
        const saved = await saveTripPhoto(supabase, { bookingId, tag, file, uploadedPath });
        setCurrentTarget(null);
        if (target.kind === "side") {
          setPhotos((prev) => ({ ...prev, [target.id]: saved }));
        } else if (target.kind === "interior") {
          setInteriorPhoto(saved);
        } else if (target.kind === "odometer") {
          setOdometerPhoto(saved);
          // KI-Erkennung im Hintergrund starten
          setAiBusy(true);
          setAiRecognition(null);
          try {
            const result = await recognize({ data: { photoPath: saved.path, bookingId, phase: "start" } });
            setAiRecognition({ km: result.km, fuelPercent: result.fuelPercent, confidence: result.confidence });
            if (result.km !== null && result.confidence !== "low") {
              setStartKm(String(result.km));
            }
          } catch (err) {
            console.warn("Odometer-KI nicht verfügbar", err);
          } finally {
            setAiBusy(false);
          }
        } else {
          setDamagePhotos((prev) => [...prev, saved]);
        }
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
    [bookingId, recognize]
  );

  const handleCapture = useCallback(
    async (file: File) => {
      if (!file || !currentTarget) return;
      await savePhoto(file, currentTarget);
    },
    [currentTarget, savePhoto]
  );

  const openCamera = (target: CaptureTarget) => {
    setPhotoError(null);
    setCurrentTarget(target);
  };

  const cameraOpen = currentTarget !== null;
  const cameraVariant: SilhouetteVariant = (() => {
    if (!currentTarget) return "front";
    if (currentTarget.kind === "interior") return "interior";
    if (currentTarget.kind === "damage") return "damage";
    if (currentTarget.kind === "odometer") return "damage";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.variant ?? "front";
  })();
  const cameraTitle: string = (() => {
    if (!currentTarget) return "";
    if (currentTarget.kind === "interior") return "Innenraum aufnehmen";
    if (currentTarget.kind === "damage") return "Schaden aufnehmen";
    if (currentTarget.kind === "odometer") return "Tacho / Kilometerstand fotografieren";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.label ?? "Foto aufnehmen";
  })();

  const handleStartDrive = async () => {
    if (!startKm || starting) return;
    const kmNum = parseInt(startKm);
    if (!Number.isFinite(kmNum) || kmNum < 0) {
      setStartError("Bitte einen gültigen Kilometerstand eintragen.");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      await updateBookingChecked(supabase, bookingId, {
        start_km: kmNum,
        remarks: remarks || null,
        status: "active",
      });
    } catch (err) {
      setStartError(
        err instanceof Error ? `Fahrt konnte nicht gestartet werden. ${err.message}` : "Fahrt konnte nicht gestartet werden.",
      );
      setStarting(false);
      return;
    }
    notifyAdmin({
      type: "trip_started",
      title: "Fahrt gestartet",
      body: `Buchung ${bookingId.slice(0, 8)} · Start-KM ${startKm}`,
      bookingId,
    });
    setStarting(false);
    onComplete(kmNum);
  };

  return (
    <div className="max-w-lg mx-auto animate-fade-in-up">
      <div className="mb-4">
        <Link
          to="/profil"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Zurück zum Profil
        </Link>
      </div>

      <CameraCapture
        open={cameraOpen}
        title={cameraTitle}
        hint="Richte das Fahrzeug an der Vorlage aus"
        variant={cameraVariant}
        onClose={() => setCurrentTarget(null)}
        onCapture={(file) => handleCapture(file)}
      />

      {/* Step 1: Pickup Code */}
      {!codeShown ? (
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
            <Key className="w-10 h-10 text-foreground" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-2">Schlüssel abholen</h3>
          <p className="text-muted-foreground mb-2">
            Komme zur <span className="font-medium text-foreground">Römerstraße 36</span> und nenne einem Mitarbeiter diesen Code:
          </p>

          <div className="my-8 p-6 rounded-2xl bg-primary text-primary-foreground">
            <p className="text-xs opacity-70 mb-2">Dein Abholcode</p>
            <p className="text-4xl font-mono font-bold tracking-[0.3em]">{pickupCode}</p>
          </div>

          <p className="text-xs text-muted-foreground mb-8">
            Gebe diesen Code einem Mitarbeiter von MyTransporter an, um die Schlüssel zu erhalten.
          </p>

          <button
            onClick={() => setCodeShown(true)}
            className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
          >
            Schlüssel erhalten, weiter <ChevronRight className="w-5 h-5 inline" />
          </button>
        </div>
      ) : (
        <>
          {/* Step 2: Vehicle Photos */}
          <h3 className="text-xl font-bold text-foreground mb-2">Fahrzeug dokumentieren</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Fotografiere das Fahrzeug von allen 4 Seiten, bevor du losfährst.
          </p>
          <p className="text-xs text-muted-foreground mb-6 rounded-2xl border border-border p-3 leading-relaxed">
            Bitte dokumentiere den Zustand vor Fahrtbeginn vollständig, vorhandene Schäden eingeschlossen. Diese Fotos dienen bei der
            Rückgabe als Vergleich; bei fehlenden oder unleserlichen Nachweisen kann eine zusätzliche Prüfung erforderlich sein.
          </p>
          <DocumentationFeeNotice />

          {isTestAdmin && (
            <button
              onClick={fillTestPhotos}
              className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              🧪 Admin-Testmodus: alle Fotos überspringen
            </button>
          )}

          {loadError && (
            <TripErrorBanner message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} retryLabel="Neu laden" />
          )}
          {photoError && (
            <TripErrorBanner
              message={photoError.message}
              busy={uploading}
              onRetry={() => void savePhoto(photoError.file, photoError.target, photoError.uploadedPath)}
              onDismiss={() => setPhotoError(null)}
            />
          )}

          <div className="grid grid-cols-2 gap-3 mb-6">
            {PHOTO_SIDES.map((side) => (
              <button
                key={side.id}
                onClick={() => openCamera({ kind: "side", id: side.id })}
                disabled={!!photos[side.id] || uploading}
                className={`p-4 rounded-2xl border-2 text-center transition-all ${
                  photos[side.id]
                    ? "border-foreground bg-secondary"
                    : "border-border hover:border-accent/50"
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
                <p className="text-sm font-medium text-foreground">{side.icon} {side.label}</p>
              </button>
            ))}
          </div>

          {/* Innenraum / Sauberkeit */}
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

          {/* Schäden */}
          <div className="mb-6">
            <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Schäden am Fahrzeug
            </p>
            <p className="text-xs text-muted-foreground mb-3">Optional, bis zu 4 Fotos</p>
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

          {/* Kilometerstand */}
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground">Kilometerstand (Start)</label>
            <input
              type="number"
              value={startKm}
              onChange={(e) => setStartKm(e.target.value)}
              placeholder="z.B. 42850"
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-xs text-muted-foreground mt-2 mb-2">
              Pflicht: Foto vom Tacho mit aktuellem Kilometerstand.
            </p>
            <button
              onClick={() => openCamera({ kind: "odometer" })}
              disabled={uploading}
              className={`w-full p-4 rounded-2xl border-2 text-center transition-all ${
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
            {aiBusy && (
              <p className="text-xs text-muted-foreground mt-2">🤖 KI analysiert Tacho…</p>
            )}
            {!aiBusy && aiRecognition && (
              <p className="text-xs text-muted-foreground mt-2">
                🤖 KI hat erkannt:&nbsp;
                {aiRecognition.km !== null ? `${aiRecognition.km.toLocaleString("de-DE")} km` : "Kilometerstand nicht lesbar"}
                {aiRecognition.fuelPercent !== null ? ` · Tank ${aiRecognition.fuelPercent}%` : ""}
                {aiRecognition.confidence === "low" ? " (unsicher – bitte prüfen)" : " – bitte prüfen"}
              </p>
            )}
          </div>

          {/* Remarks */}
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Anmerkungen (optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="z.B. Kratzer an der Stoßstange, Geruch im Innenraum..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {startError && <TripErrorBanner message={startError} onRetry={() => void handleStartDrive()} busy={starting} />}

          <button
            disabled={!readyToStart || !startKm || starting || uploading}
            onClick={handleStartDrive}
            className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Fahrt starten 🚛
          </button>

          {!readyToStart && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Bitte alle 8 Außenfotos, das Innenraum-Foto und die Schadensangabe ausfüllen
            </p>
          )}
        </>
      )}
    </div>
  );
}