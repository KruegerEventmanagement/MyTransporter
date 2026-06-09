import { useState, useCallback, useEffect } from "react";
import { Camera, Check, ChevronRight, Key, AlertTriangle, Plus, X, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture, type SilhouetteVariant } from "./CameraCapture";
import { useServerFn } from "@tanstack/react-start";
import { recognizeOdometer } from "@/lib/odometer-ai.functions";

const TEST_MODE_ADMIN_EMAIL = "krueger.christian96@gmx.de";

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

const POST_INTERIOR_ID = "post_interior";
const POST_ODOMETER_ID = "post_odometer";

interface ReturnFlowProps {
  bookingId: string;
  planId?: string;
  startKm?: number | null;
  freeKm?: number | null;
  kmPriceCents?: number | null;
  onComplete: (returnCode: string) => void;
}

type ReturnStep = "photos" | "km" | "receipt" | "code" | "done";

export function ReturnFlow({ bookingId, planId, startKm, freeKm, kmPriceCents, onComplete }: ReturnFlowProps) {
  const [returnStep, setReturnStep] = useState<ReturnStep>("photos");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [interiorPhoto, setInteriorPhoto] = useState<string | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  const [endKm, setEndKm] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [returnCode, setReturnCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [aiRecognition, setAiRecognition] = useState<{ km: number | null; fuelPercent: number | null; confidence: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [endFuelPercent, setEndFuelPercent] = useState<string>("");
  const recognize = useServerFn(recognizeOdometer);
  const [kmSummary, setKmSummary] = useState<{
    driven: number;
    free: number;
    extra: number;
    chargeCents: number;
  } | null>(null);
  const [currentTarget, setCurrentTarget] = useState<
    | { kind: "side"; id: string }
    | { kind: "interior" }
    | { kind: "damage" }
    | { kind: "odometer" }
    | { kind: "receipt" }
    | null
  >(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted || !userData.user) return;
      if (mounted) {
        setIsAdmin(
          userData.user.email?.toLowerCase() === TEST_MODE_ADMIN_EMAIL.toLowerCase()
        );
      }
    })();
    return () => { mounted = false; };
  }, []);

  const allSidesTaken = PHOTO_SIDES.every((s) => photos[s.id]);
  const interiorTaken = !!interiorPhoto;
  const photosReady = allSidesTaken && interiorTaken;

  const fillTestPhotos = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`
      );
    const next: Record<string, string> = {};
    PHOTO_SIDES.forEach((s) => (next[s.id] = placeholder));
    setPhotos(next);
    setInteriorPhoto(placeholder);
  };

  const fillTestKm = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='#e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#333'>TEST</text></svg>`
      );
    setOdometerPhoto(placeholder);
    if (!endKm) setEndKm("42920");
  };

  const handleCapture = useCallback(
    async (file: File) => {
      if (!file || !currentTarget) return;
      setUploading(true);
      try {
        const tag =
          currentTarget.kind === "side"
            ? currentTarget.id
            : currentTarget.kind === "interior"
            ? POST_INTERIOR_ID
            : currentTarget.kind === "damage"
            ? "post_damage"
            : currentTarget.kind === "odometer"
            ? POST_ODOMETER_ID
            : "tank_receipt";
        const path = `${bookingId}/${tag}_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("trip-photos").upload(path, file);
        if (error) throw error;
        const { data: signed } = await supabase.storage
          .from("trip-photos")
          .createSignedUrl(path, 60 * 60);
        const viewUrl = signed?.signedUrl ?? "";
        await supabase.from("trip_photos").insert({
          booking_id: bookingId,
          photo_url: path,
          photo_type: tag,
        });
        if (currentTarget.kind === "side") {
          setPhotos((prev) => ({ ...prev, [currentTarget.id]: viewUrl }));
        } else if (currentTarget.kind === "interior") {
          setInteriorPhoto(viewUrl);
        } else if (currentTarget.kind === "damage") {
          setDamagePhotos((prev) => [...prev, viewUrl]);
        } else if (currentTarget.kind === "odometer") {
          setOdometerPhoto(viewUrl);
          setAiBusy(true);
          setAiRecognition(null);
          try {
            const result = await recognize({ data: { photoPath: path, bookingId, phase: "end" } });
            setAiRecognition({ km: result.km, fuelPercent: result.fuelPercent, confidence: result.confidence });
            if (result.km !== null && result.confidence !== "low") {
              setEndKm(String(result.km));
            }
            if (result.fuelPercent !== null && result.confidence !== "low") {
              setEndFuelPercent(String(result.fuelPercent));
            }
          } catch (err) {
            console.warn("Odometer-KI nicht verfügbar", err);
          } finally {
            setAiBusy(false);
          }
        } else {
          setReceiptUrl(viewUrl);
        }
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        setCurrentTarget(null);
      }
    },
    [bookingId, currentTarget]
  );

  const cameraOpen = currentTarget !== null;
  const cameraVariant: SilhouetteVariant = (() => {
    if (!currentTarget) return "front";
    if (currentTarget.kind === "interior") return "interior";
    if (currentTarget.kind === "damage") return "damage";
    if (currentTarget.kind === "odometer") return "damage";
    if (currentTarget.kind === "receipt") return "receipt";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.variant ?? "front";
  })();
  const cameraTitle: string = (() => {
    if (!currentTarget) return "";
    if (currentTarget.kind === "interior") return "Innenraum aufnehmen";
    if (currentTarget.kind === "damage") return "Schaden aufnehmen";
    if (currentTarget.kind === "odometer") return "Tacho / Kilometerstand fotografieren";
    if (currentTarget.kind === "receipt") return "Tankbeleg scannen";
    const side = PHOTO_SIDES.find((s) => s.id === currentTarget.id);
    return side?.label ?? "Foto aufnehmen";
  })();
  const cameraHint =
    currentTarget?.kind === "receipt"
      ? "Beleg in den Rahmen legen, wird automatisch gescannt"
      : "Richte das Fahrzeug an der Vorlage aus";

  const handleSubmitKm = async () => {
    const end = parseInt(endKm);
    const start = typeof startKm === "number" ? startKm : 0;
    const free = typeof freeKm === "number" ? freeKm : planId === "6h" ? 300 : planId === "24h" ? 500 : 0;
    const pricePerKmCents = typeof kmPriceCents === "number" ? kmPriceCents : 90;
    const driven = Math.max(0, end - start);
    // Im reinen Kilometer-Tarif werden alle Kilometer berechnet (kein Freikontingent).
    const billable = planId === "km" ? driven : Math.max(0, driven - free);
    const chargeCents = billable * pricePerKmCents;

    await supabase
      .from("bookings")
      .update({
        end_km: end,
        extra_km: planId === "km" ? driven : Math.max(0, driven - free),
        extra_km_charge_cents: chargeCents,
        ...(endFuelPercent !== "" ? { ai_end_fuel_percent: parseInt(endFuelPercent) } : {}),
      })
      .eq("id", bookingId);

    setKmSummary({
      driven,
      free: planId === "km" ? 0 : free,
      extra: planId === "km" ? driven : Math.max(0, driven - free),
      chargeCents,
    });
    setReturnStep("receipt");
  };

  const handleFinish = async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase
      .from("bookings")
      .update({ return_code: code, status: "returning" })
      .eq("id", bookingId);
    setReturnCode(code);
    setReturnStep("code");
  };

  if (returnStep === "photos") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        <CameraCapture
          open={cameraOpen}
          title={cameraTitle}
          hint={cameraHint}
          variant={cameraVariant}
          scanMode={currentTarget?.kind === "receipt"}
          onClose={() => setCurrentTarget(null)}
          onCapture={(file) => handleCapture(file)}
        />

        <h3 className="text-xl font-bold text-foreground mb-2">Fahrzeug-Rückgabe dokumentieren</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Fotografiere das Fahrzeug von allen 8 Seiten und den Innenraum, bevor du den Schlüssel abgibst.
        </p>

        {isAdmin && (
          <button
            onClick={fillTestPhotos}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Admin-Testmodus: alle Fotos überspringen
          </button>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PHOTO_SIDES.map((side) => (
            <button
              key={side.id}
              onClick={() => setCurrentTarget({ kind: "side", id: side.id })}
              disabled={!!photos[side.id] || uploading}
              className={`p-4 rounded-2xl border-2 text-center transition-all ${
                photos[side.id] ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
              }`}
            >
              {photos[side.id] ? (
                <div className="relative">
                  <img src={photos[side.id]} alt={side.label} className="w-full h-20 object-cover rounded-lg mb-2" />
                  <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
                    <Check className="w-3 h-3 text-background" />
                  </div>
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

        {/* Innenraum */}
        <div className="mb-6">
          <p className="text-sm font-medium text-foreground mb-2">Innenraum & Sauberkeit</p>
          <button
            onClick={() => setCurrentTarget({ kind: "interior" })}
            disabled={uploading}
            className={`w-full p-4 rounded-2xl border-2 text-center transition-all ${
              interiorPhoto ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
            }`}
          >
            {interiorPhoto ? (
              <div className="relative">
                <img src={interiorPhoto} alt="Innenraum" className="w-full h-32 object-cover rounded-lg mb-2" />
                <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
                  <Check className="w-3 h-3 text-background" />
                </div>
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
            <AlertTriangle className="w-4 h-4" /> Schäden?
          </p>
          <p className="text-xs text-muted-foreground mb-3">Optional, bis zu 4 Fotos von neuen Schäden</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, idx) => {
              const url = damagePhotos[idx];
              if (url) {
                return (
                  <div key={idx} className="relative">
                    <img src={url} alt={`Schaden ${idx + 1}`} className="w-full h-20 object-cover rounded-lg border border-border" />
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
                  onClick={() => setCurrentTarget({ kind: "damage" })}
                  disabled={uploading || idx > damagePhotos.length}
                  className="h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-accent/50 transition-all disabled:opacity-40"
                >
                  <Plus className="w-5 h-5" />
                </button>
              );
            })}
          </div>
        </div>

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
          </p>
        )}
      </div>
    );
  }

  if (returnStep === "km") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        <CameraCapture
          open={cameraOpen}
          title={cameraTitle}
          hint={cameraHint}
          variant={cameraVariant}
          onClose={() => setCurrentTarget(null)}
          onCapture={(file) => handleCapture(file)}
        />
        <h3 className="text-xl font-bold text-foreground mb-2">Kilometerstand (Ende)</h3>
        <p className="text-sm text-muted-foreground mb-6">Trage den aktuellen Kilometerstand ein.</p>
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
          value={endKm}
          onChange={(e) => setEndKm(e.target.value)}
          placeholder="z.B. 42920"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent mb-6"
        />

        <p className="text-xs text-muted-foreground mb-2">
          Pflicht: Foto vom Tacho mit aktuellem Kilometerstand.
        </p>
        <button
          onClick={() => setCurrentTarget({ kind: "odometer" })}
          disabled={uploading}
          className={`w-full mb-6 p-4 rounded-2xl border-2 text-center transition-all ${
            odometerPhoto ? "border-foreground bg-secondary" : "border-border hover:border-accent/50"
          }`}
        >
          {odometerPhoto ? (
            <div className="relative">
              <img src={odometerPhoto} alt="Tacho" className="w-full h-32 object-cover rounded-lg" />
              <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
                <Check className="w-3 h-3 text-background" />
              </div>
            </div>
          ) : (
            <div className="h-20 flex flex-col items-center justify-center gap-1">
              <Camera className="w-7 h-7 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Foto vom Tacho aufnehmen</span>
            </div>
          )}
        </button>

        {aiBusy && (
          <p className="text-xs text-muted-foreground -mt-4 mb-4">🤖 KI analysiert Tacho…</p>
        )}
        {!aiBusy && aiRecognition && (
          <p className="text-xs text-muted-foreground -mt-4 mb-4">
            🤖 KI hat erkannt:&nbsp;
            {aiRecognition.km !== null ? `${aiRecognition.km.toLocaleString("de-DE")} km` : "Kilometerstand nicht lesbar"}
            {aiRecognition.fuelPercent !== null ? ` · Tank ${aiRecognition.fuelPercent}%` : ""}
            {aiRecognition.confidence === "low" ? " (unsicher – bitte prüfen)" : " – bitte prüfen"}
          </p>
        )}

        <label className="text-sm font-medium text-foreground">Tankstand (Ende, in %)</label>
        <input
          type="number"
          min={0}
          max={100}
          value={endFuelPercent}
          onChange={(e) => setEndFuelPercent(e.target.value)}
          placeholder="z.B. 75"
          className="mt-1 mb-6 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <button
          disabled={!endKm || !odometerPhoto}
          onClick={handleSubmitKm}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight className="w-5 h-5 inline" />
        </button>
      </div>
    );
  }

  if (returnStep === "receipt") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        <CameraCapture
          open={cameraOpen}
          title={cameraTitle}
          hint={cameraHint}
          variant={cameraVariant}
          scanMode={currentTarget?.kind === "receipt"}
          onClose={() => setCurrentTarget(null)}
          onCapture={(file) => handleCapture(file)}
        />
        <h3 className="text-xl font-bold text-foreground mb-2">Tankbeleg scannen</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Lege den Tankbeleg gut sichtbar in den Rahmen, das Foto wird automatisch wie ein Scan in S/W aufbereitet.
        </p>

        {kmSummary && (
          <div className="mb-6 p-4 rounded-2xl border border-border bg-secondary/50">
            <p className="text-sm font-medium text-foreground mb-2">Kilometer-Abrechnung</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Gefahren</span><span className="text-foreground">{kmSummary.driven} km</span></div>
              {kmSummary.free > 0 && (
                <div className="flex justify-between"><span>Inklusive Freikilometer</span><span className="text-foreground">{kmSummary.free} km</span></div>
              )}
              <div className="flex justify-between"><span>{planId === "km" ? "Berechnete Kilometer" : "Mehrkilometer"}</span><span className="text-foreground">{kmSummary.extra} km</span></div>
              <div className="flex justify-between font-medium pt-2 border-t border-border">
                <span className="text-foreground">{kmSummary.extra > 0 ? "Aufpreis (0,90 €/km)" : "Aufpreis"}</span>
                <span className="text-foreground">{(kmSummary.chargeCents / 100).toFixed(2)} €</span>
              </div>
            </div>
            {kmSummary.chargeCents > 0 && (
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
                  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'><rect width='200' height='280' fill='%23ffffff'/><text x='50%' y='40%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='14' fill='%23000'>TEST-TANKBELEG</text><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='12' fill='%23000'>Admin-Modus</text></svg>`
                );
              setReceiptUrl(placeholder);
            }}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Admin-Testmodus: Tankbeleg fiktiv eingeben
          </button>
        )}

        {receiptUrl ? (
          <div className="mb-6">
            <div className="relative">
              <img src={receiptUrl} alt="Tankbeleg" className="w-full max-h-[60vh] object-contain rounded-2xl border border-border bg-secondary" />
              <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-foreground text-background text-[10px] font-semibold flex items-center gap-1">
                <ScanLine className="w-3 h-3" /> Gescannt
              </div>
            </div>
            <button
              onClick={() => { setReceiptUrl(null); setCurrentTarget({ kind: "receipt" }); }}
              className="mt-3 w-full rounded-full border border-foreground py-2.5 text-sm font-medium hover:bg-secondary"
            >
              Erneut scannen
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCurrentTarget({ kind: "receipt" })}
            disabled={uploading}
            className="w-full p-8 rounded-2xl border-2 border-dashed border-border hover:border-accent/50 text-center mb-6 transition-all"
          >
            <ScanLine className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Tankbeleg scannen</p>
            <p className="text-[11px] text-muted-foreground mt-1">CamScanner-Modus aktiv</p>
          </button>
        )}

        <button
          disabled={!receiptUrl}
          onClick={handleFinish}
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
        <h3 className="text-2xl font-bold text-foreground mb-2">Schlüssel abgeben</h3>
        <p className="text-muted-foreground mb-2">
          Gehe zur <span className="font-medium text-foreground">Römerstraße 36</span> und nenne diesen Code:
        </p>

        <div className="my-8 p-6 rounded-2xl bg-primary text-primary-foreground">
          <p className="text-xs opacity-70 mb-2">Dein Rückgabecode</p>
          <p className="text-4xl font-mono font-bold tracking-[0.3em]">{returnCode}</p>
        </div>

        <p className="text-xs text-muted-foreground mb-8">
          Der Mitarbeiter bestätigt die Rückgabe. Danach ist deine Fahrt abgeschlossen.
        </p>

        <button
          onClick={() => {
            if (returnCode) onComplete(returnCode);
          }}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg"
        >
          Warte auf Bestätigung...
        </button>

        <p className="text-xs text-muted-foreground mt-4">
          Die Fahrt wird erst als abgeschlossen markiert, wenn der Mitarbeiter die Rückgabe bestätigt.
          Bis dahin können Gebühren anfallen.
        </p>
      </div>
    );
  }

  return null;
}