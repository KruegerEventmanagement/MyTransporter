import { useRef, useState } from "react";
import { Camera, Images, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeImageFile } from "@/lib/image-capture";
import { saveTripPhoto } from "@/lib/trip-photo-store";

export function canUploadBookingPhotos(status: string): boolean {
  return status !== "cancelled" && status !== "pending" && status !== "expired";
}

type Item = { name: string; state: "busy" | "ok" | "error"; error?: string; file: File };

export function BookingPhotoUpload({ bookingId, status, onUploaded }: { bookingId: string; status: string; onUploaded: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  if (!canUploadBookingPhotos(status)) return null;

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const start = items.length;
    setItems((prev) => [...prev, ...files.map((f) => ({ name: f.name, state: "busy" as const, file: f }))]);
    for (let i = 0; i < files.length; i++) {
      const idx = start + i;
      try {
        const blob = await normalizeImageFile(files[i]);
        await saveTripPhoto(supabase, { bookingId, tag: "additional", file: blob, timeoutMs: 60000 });
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, state: "ok" } : it)));
        onUploaded();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, state: "error", error: msg } : it)));
      }
    }
    setBusy(false);
  };

  const retry = async (idx: number) => {
    const it = items[idx];
    setItems((prev) => prev.filter((_, j) => j !== idx));
    await upload([it.file]);
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void upload(files);
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-primary text-primary-foreground py-4 text-sm font-semibold disabled:opacity-60">
          <Camera className="w-5 h-5" /> Foto aufnehmen
        </button>
        <button type="button" disabled={busy} onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border py-4 text-sm font-semibold disabled:opacity-60">
          <Images className="w-5 h-5" /> Aus Galerie wählen
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} aria-label="Kamera" />
      <input ref={galleryRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={pick} aria-label="Galerie" />
      {items.length > 0 && (
        <ul className="space-y-1 text-xs">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{it.name || "Foto"}</span>
              {it.state === "busy" && <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Wird hochgeladen…</span>}
              {it.state === "ok" && <span className="font-semibold">Gespeichert</span>}
              {it.state === "error" && (
                <span className="flex items-center gap-2 text-destructive">
                  {it.error}
                  <button type="button" disabled={busy} className="underline" onClick={() => void retry(i)}>Erneut versuchen</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
