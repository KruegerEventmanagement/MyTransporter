import { useCallback, useState, type RefObject } from "react";

export interface FocusPoint {
  x: number; // 0–100 (percent)
  y: number; // 0–100 (percent)
}

interface TapFocusCapabilities {
  focusMode?: string[];
  pointsOfInterest?: { max?: number } | boolean;
}

/**
 * Ermöglicht Tap-to-Focus auf einem <video>-Element.
 * Gibt die Position eines kurz eingeblendeten Fokus-Indicators zurück
 * und wendet auf unterstützten Geräten manuellen Fokus an der Tap-Stelle an.
 */
export function useTapFocus(
  videoRef: RefObject<HTMLVideoElement | null>,
  streamRef: RefObject<MediaStream | null>,
  options: { indicatorDuration?: number; manualFocusDuration?: number } = {}
) {
  const { indicatorDuration = 800, manualFocusDuration = 1500 } = options;
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);

  const handleTap = useCallback(
    async (e: React.PointerEvent<HTMLVideoElement>) => {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (!video || !stream) return;

      const rect = video.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      setFocusPoint({ x: x * 100, y: y * 100 });
      window.setTimeout(() => setFocusPoint(null), indicatorDuration);

      const track = stream.getVideoTracks()[0];
      if (!track) return;

      try {
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & TapFocusCapabilities;
        const supportsManual = caps.focusMode?.includes("manual");
        const supportsPoints = !!caps.pointsOfInterest;

        if (supportsManual && supportsPoints) {
          await track.applyConstraints({
            advanced: [
              { focusMode: "manual", pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet,
            ],
          });

          // Nach dem manuellen Fokus wieder kontinuierliches Nachscharfieren erlauben
          window.setTimeout(() => {
            track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            }).catch(() => {
              /* ignore */
            });
          }, manualFocusDuration);
        }
      } catch {
        /* ignore unsupported devices */
      }
    },
    [videoRef, streamRef, indicatorDuration, manualFocusDuration]
  );

  return { focusPoint, handleTap };
}
