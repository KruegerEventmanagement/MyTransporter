import { useState, useRef, useCallback } from "react";
import { Camera, Check, ChevronRight, Key, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const RETURN_PHOTOS = [
  { id: "post_front", label: "Vorderseite", icon: "🚛" },
  { id: "post_back", label: "Rückseite", icon: "🔙" },
  { id: "post_left", label: "Linke Seite", icon: "⬅️" },
  { id: "post_right", label: "Rechte Seite", icon: "➡️" },
] as const;

interface ReturnFlowProps {
  bookingId: string;
  onComplete: (returnCode: string) => void;
}

type ReturnStep = "photos" | "km" | "receipt" | "code" | "done";

export function ReturnFlow({ bookingId, onComplete }: ReturnFlowProps) {
  const [returnStep, setReturnStep] = useState<ReturnStep>("photos");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [endKm, setEndKm] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [returnCode, setReturnCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentSide, setCurrentSide] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const allPhotosTaken = RETURN_PHOTOS.every((s) => photos[s.id]);

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentSide) return;

      setUploading(true);
      try {
        const path = `${bookingId}/${currentSide}_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("trip-photos").upload(path, file);
        if (error) throw error;

        const { data: urlData } = supabase.storage.from("trip-photos").getPublicUrl(path);
        await supabase.from("trip_photos").insert({
          booking_id: bookingId,
          photo_url: urlData.publicUrl,
          photo_type: currentSide,
        });
        setPhotos((prev) => ({ ...prev, [currentSide]: urlData.publicUrl }));
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        setCurrentSide(null);
      }
    },
    [bookingId, currentSide]
  );

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const path = `${bookingId}/tank_receipt_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("trip-photos").upload(path, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("trip-photos").getPublicUrl(path);
      await supabase.from("trip_photos").insert({
        booking_id: bookingId,
        photo_url: urlData.publicUrl,
        photo_type: "tank_receipt",
      });
      setReceiptUrl(urlData.publicUrl);
    } catch (err) {
      console.error("Receipt upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitKm = async () => {
    await supabase
      .from("bookings")
      .update({ end_km: parseInt(endKm) })
      .eq("id", bookingId);
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
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
        <h3 className="text-xl font-bold text-foreground mb-2">Rückgabe-Fotos</h3>
        <p className="text-sm text-muted-foreground mb-6">Fotografiere das Fahrzeug von allen 4 Seiten.</p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {RETURN_PHOTOS.map((side) => (
            <button
              key={side.id}
              onClick={() => { setCurrentSide(side.id); fileInputRef.current?.click(); }}
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

        <button
          disabled={!allPhotosTaken}
          onClick={() => setReturnStep("km")}
          className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter <ChevronRight className="w-5 h-5 inline" />
        </button>
      </div>
    );
  }

  if (returnStep === "km") {
    return (
      <div className="max-w-lg mx-auto animate-fade-in-up">
        <h3 className="text-xl font-bold text-foreground mb-2">Kilometerstand (Ende)</h3>
        <p className="text-sm text-muted-foreground mb-6">Trage den aktuellen Kilometerstand ein.</p>
        <input
          type="number"
          value={endKm}
          onChange={(e) => setEndKm(e.target.value)}
          placeholder="z.B. 42920"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent mb-6"
        />
        <button
          disabled={!endKm}
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
        <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptUpload} />
        <h3 className="text-xl font-bold text-foreground mb-2">Tankbeleg</h3>
        <p className="text-sm text-muted-foreground mb-6">Scanne oder fotografiere den Tankbeleg.</p>

        {receiptUrl ? (
          <div className="mb-6">
            <img src={receiptUrl} alt="Tankbeleg" className="w-full h-48 object-cover rounded-2xl border border-border" />
            <p className="text-sm text-foreground mt-2 flex items-center gap-1"><Check className="w-4 h-4" /> Tankbeleg hochgeladen</p>
          </div>
        ) : (
          <button
            onClick={() => receiptInputRef.current?.click()}
            disabled={uploading}
            className="w-full p-8 rounded-2xl border-2 border-dashed border-border hover:border-accent/50 text-center mb-6 transition-all"
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Tankbeleg fotografieren</p>
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