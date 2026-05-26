import { useState, useCallback, useEffect } from "react";
import { Camera, Check, ChevronRight, MessageSquare, Key, Plus, X, AlertTriangle, ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture, type SilhouetteVariant } from "./CameraCapture";
import { notifyAdmin } from "@/lib/admin-notify";

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

interface PreDriveFlowProps {
  bookingId: string;
  pickupCode: string;
  onComplete: () => void;
}

export function PreDriveFlow({ bookingId, pickupCode, onComplete }: PreDriveFlowProps) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [interiorPhoto, setInteriorPhoto] = useState<string | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [startKm, setStartKm] = useState("");
  const [codeShown, setCodeShown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<
    | { kind: "side"; id: string }
    | { kind: "interior" }
    | { kind: "damage" }
    | { kind: "odometer" }
    | null
  >(null);

  // Bereits hochgeladene Fotos für diese Buchung laden
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("trip_photos")
        .select("photo_type, photo_url, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (!mounted || !data) return;
      const sides: Record<string, string> = {};
      const damages: string[] = [];
      let interior: string | null = null;
      for (const row of data as { photo_type: string; photo_url: string }[]) {
        if (row.photo_type === INTERIOR_ID) interior = row.photo_url;
        else if (row.photo_type === ODOMETER_ID) setOdometerPhoto((prev) => prev ?? row.photo_url);
        else if (row.photo_type === "pre_damage") damages.push(row.photo_url);
        else if (row.photo_type.startsWith("pre_")) sides[row.photo_type] = row.photo_url;
      }
      if (Object.keys(sides).length) setPhotos((prev) => ({ ...sides, ...prev }));
      if (interior) setInteriorPhoto((prev) => prev ?? interior);
      if (damages.length) setDamagePhotos((prev) => (prev.length ? prev : damages));
    })();
    return () => { mounted = false; };
  }, [bookingId]);

  const allSidesTaken = PHOTO_SIDES.every((s) => photos[s.id]);
  const interiorTaken = !!interiorPhoto;
  const readyToStart = allSidesTaken && interiorTaken && !!odometerPhoto;

  const fillTestPhotos = () => {
    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><rect width='200' height='120' fill='%23e5e5e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23333'>TEST</text></svg>`
      );
    const next: Record<string, string> = {};
    PHOTO_SIDES.forEach((s) => (next[s.id] = placeholder));
    setPhotos(next);
    setInteriorPhoto(placeholder);
    setOdometerPhoto(placeholder);
    if (!startKm) setStartKm("42850");
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
            ? INTERIOR_ID
            : currentTarget.kind === "odometer"
            ? ODOMETER_ID
            : "pre_damage";
        const path = `${bookingId}/${tag}_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("trip-photos").upload(path, file);
        if (error) throw error;

        const { data: signed } = await supabase.storage
          .from("trip-photos")
          .createSignedUrl(path, 60 * 60);
        const viewUrl = signed?.signedUrl ?? "";

        // Save the storage path (not a transient signed URL) for future lookups.
        await supabase.from("trip_photos").insert({
          booking_id: bookingId,
          photo_url: path,
          photo_type: tag,
        });

        if (currentTarget.kind === "side") {
          setPhotos((prev) => ({ ...prev, [currentTarget.id]: viewUrl }));
        } else if (currentTarget.kind === "interior") {
          setInteriorPhoto(viewUrl);
        } else if (currentTarget.kind === "odometer") {
          setOdometerPhoto(viewUrl);
        } else {
          setDamagePhotos((prev) => [...prev, viewUrl]);
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

  const openCamera = (target: NonNullable<typeof currentTarget>) => {
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
    if (!startKm) return;
    await supabase
      .from("bookings")
      .update({
        start_km: parseInt(startKm),
        remarks: remarks || null,
        status: "active",
      })
      .eq("id", bookingId);
    notifyAdmin({
      type: "trip_started",
      title: "Fahrt gestartet",
      body: `Buchung ${bookingId.slice(0, 8)} · Start-KM ${startKm}`,
      bookingId,
    });
    onComplete();
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
            Schlüssel erhalten – weiter <ChevronRight className="w-5 h-5 inline" />
          </button>
        </div>
      ) : (
        <>
          {/* Step 2: Vehicle Photos */}
          <h3 className="text-xl font-bold text-foreground mb-2">Fahrzeug dokumentieren</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Fotografiere das Fahrzeug von allen 4 Seiten, bevor du losfährst.
          </p>

          <button
            onClick={fillTestPhotos}
            className="w-full mb-4 rounded-full border border-dashed border-foreground py-2 text-xs font-medium text-foreground hover:bg-secondary"
          >
            🧪 Testmodus: alle Fotos überspringen
          </button>

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
              <AlertTriangle className="w-4 h-4" /> Schäden am Fahrzeug
            </p>
            <p className="text-xs text-muted-foreground mb-3">Optional – bis zu 4 Fotos</p>
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

          <button
            disabled={!readyToStart || !startKm}
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