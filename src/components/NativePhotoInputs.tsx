import type { ChangeEvent, Ref } from "react";

/**
 * Gemeinsame, robuste native Foto-Eingaben für iOS Safari und Android Chrome.
 * - Kamera-Eingabe mit capture="environment" (öffnet direkt die Geräte-Kamera).
 * - Galerie-Eingabe OHNE capture (Fotos/Galerie/Dateien), HEIC/HEIF explizit erlaubt.
 * - Nur visuell versteckt (sr-only, kein display:none) und ausschließlich per
 *   <label htmlFor> bzw. synchronem click() im Nutzerklick aktiviert, damit die
 *   User-Activation nie durch vorherige asynchrone Aufrufe verloren geht.
 * Aufrufer setzen input.value nach jeder Auswahl zurück (gleiche Datei erneut wählbar).
 */
export const NATIVE_CAMERA_ACCEPT = "image/*";
export const NATIVE_GALLERY_ACCEPT = "image/*,.heic,.heif";

export function NativePhotoInputs({
  cameraId,
  galleryId,
  cameraRef,
  galleryRef,
  onChange,
  testIdPrefix,
  cameraTestId,
  galleryTestId,
}: {
  cameraId: string;
  galleryId: string;
  cameraRef?: Ref<HTMLInputElement>;
  galleryRef?: Ref<HTMLInputElement>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  testIdPrefix?: string;
  cameraTestId?: string;
  galleryTestId?: string;
}) {
  return (
    <>
      <input
        ref={cameraRef}
        id={cameraId}
        type="file"
        accept={NATIVE_CAMERA_ACCEPT}
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={cameraTestId ?? `${testIdPrefix}-camera-input`}
        onChange={onChange}
      />
      <input
        ref={galleryRef}
        id={galleryId}
        type="file"
        accept={NATIVE_GALLERY_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={galleryTestId ?? `${testIdPrefix}-gallery-input`}
        onChange={onChange}
      />
    </>
  );
}
