import { useState, useRef, useCallback } from "react";
import { Camera, Check, ChevronRight, MessageSquare, Key, Plus, X, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PHOTO_SIDES = [
  { id: "pre_front", label: "Vorne", icon: "⬆️" },
  { id: "pre_front_right", label: "Vorne rechts", icon: "↗️" },
  { id: "pre_right", label: "Rechte Seite", icon: "➡️" },
  { id: "pre_back_right", label: "Hinten rechts", icon: "↘️" },
  { id: "pre_back", label: "Hinten", icon: "⬇️" },
  { id: "pre_back_left", label: "Hinten links", icon: "↙️" },
  { id: "pre_left", label: "Linke Seite", icon: "⬅️" },
  { id: "pre_front_left", label: "Vorne links", icon: "↖️" },
] as const;

const INTERIOR_ID = "pre_interior";

interface PreDriveFlowProps {
  bookingId: string;
  pickupCode: string;
  onComplete: () => void;
}

export function PreDriveFlow({ bookingId, pickupCode, onComplete }: PreDriveFlowProps) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [interiorPhoto, setInteriorPhoto] = useState<string | null>(null);
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [startKm, setStartKm] = useState("");
  const [codeShown, setCodeShown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTarget, setCurrentTarget] = useState<
    | { kind: "side"; id: string }
    | { kind: "interior" }
    | { kind: "damage" }
    | null
  >(null);

  const allSidesTaken = PHOTO_SIDES.every((s) => photos[s.id]);
  const interiorTaken = !!interiorPhoto;
  const damageAnswered = hasDamage === false || (hasDamage === true && damagePhotos.length > 0);
  const readyToStart = allSidesTaken && interiorTaken && damageAnswered;

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentTarget) return;

      setUploading(true);
      try {
        const tag =
          currentTarget.kind === "side"
            ? currentTarget.id
            : currentTarget.kind === "interior"
            ? INTERIOR_ID
            : "pre_damage";
        const path = `${bookingId}/${tag}_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("trip-photos").upload(path, file);
        if (error) throw error;

        const { data: urlData } = supabase.storage.from("trip-photos").getPublicUrl(path);

        // Save to DB
        await supabase.from("trip_photos").insert({
          booking_id: bookingId,
          photo_url: urlData.publicUrl,
          photo_type: tag,
        });

        if (currentTarget.kind === "side") {
          setPhotos((prev) => ({ ...prev, [currentTarget.id]: urlData.publicUrl }));
        } else if (currentTarget.kind === "interior") {
          setInteriorPhoto(urlData.publicUrl);
        } else {
          setDamagePhotos((prev) => [...prev, urlData.publicUrl]);
        }
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        setCurrentTarget(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [bookingId, currentTarget]
  );

  const openCamera = (target: NonNullable<typeof currentTarget>) => {
    setCurrentTarget(target);
    // small timeout so state is set before click; not strictly necessary
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

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
    onComplete();
  };

  return (
    <div className="max-w-lg mx-auto animate-fade-in-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
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