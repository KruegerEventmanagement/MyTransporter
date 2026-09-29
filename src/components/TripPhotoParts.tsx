import { AlertTriangle, Check, ImageOff, RotateCcw } from "lucide-react";
import type { StoredTripPhoto } from "@/lib/trip-photo-store";

/** Vorschau eines gespeicherten Fahrtfotos; ohne signierte URL ein neutraler Platzhalter. */
export function TripPhotoThumb({ photo, alt, className }: { photo: StoredTripPhoto; alt: string; className: string }) {
  return (
    <div className="relative">
      {photo.url ? (
        <img src={photo.url} alt={alt} className={`${className} object-cover rounded-lg`} />
      ) : (
        <div
          className={`${className} rounded-lg bg-secondary flex flex-col items-center justify-center gap-1 text-muted-foreground`}
        >
          <ImageOff className="w-5 h-5" />
          <span className="text-[10px]">Gespeichert · Vorschau nicht verfügbar</span>
        </div>
      )}
      <div
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground flex items-center justify-center"
        aria-label="Foto gespeichert"
      >
        <Check className="w-3 h-3 text-background" />
      </div>
    </div>
  );
}

export function TripErrorBanner({
  message,
  onRetry,
  retryLabel = "Erneut versuchen",
  onDismiss,
  busy,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  busy?: boolean;
}) {
  return (
    <div role="alert" className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p className="flex items-start gap-2 text-foreground">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
        <span>{message}</span>
      </p>
      {(onRetry || onDismiss) && (
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-foreground flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {retryLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-border px-4 py-2 text-xs font-medium"
            >
              Schließen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
