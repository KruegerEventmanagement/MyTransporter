import { useEffect, useRef, useState } from "react";
import { Pause, Play, Power, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VideoBackgroundProps = {
  src: string;
  poster?: string;
  title: string;
  fit?: "cover" | "contain";
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

async function safelyPlay(video: HTMLVideoElement) {
  try {
    await video.play();
    return true;
  } catch {
    return false;
  }
}

export function VideoBackground({ src, poster, title, fit = "cover" }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenPausedRef = useRef(false);
  const explicitPausedRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [enabled, setEnabled] = useState(true);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [muted, setMuted] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setPaused(prefersReducedMotion);
    explicitPausedRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setHasError(false);

    const syncState = () => {
      setPaused(video.paused);
      setMuted(video.muted);
    };
    const handleError = () => {
      setHasError(true);
      setPaused(true);
    };

    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    video.addEventListener("error", handleError);
    video.addEventListener("emptied", syncState);

    video.muted = true;
    setMuted(true);

    if (enabled && !prefersReducedMotion) {
      safelyPlay(video).then((played) => {
        setPaused(!played || video.paused);
        if (video.error) setHasError(true);
      });
    }

    if (video.error) handleError();

    return () => {
      video.pause();
      video.muted = true;
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("volumechange", syncState);
      video.removeEventListener("error", handleError);
      video.removeEventListener("emptied", syncState);
    };
  }, [enabled, prefersReducedMotion, src]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video || !enabled) return;

      if (document.hidden) {
        hiddenPausedRef.current = !video.paused;
        if (!video.paused) video.pause();
        return;
      }

      if (hiddenPausedRef.current && !explicitPausedRef.current) {
        hiddenPausedRef.current = false;
        safelyPlay(video).then((played) => {
          if (!played) setPaused(true);
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled]);

  const playVideo = async () => {
    const video = videoRef.current;
    if (!video) return false;
    const played = await safelyPlay(video);
    setPaused(!played);
    return played;
  };

  const togglePause = async () => {
    const video = videoRef.current;
    if (!video || !enabled || hasError) return;

    if (video.paused) {
      explicitPausedRef.current = false;
      await playVideo();
      return;
    }

    explicitPausedRef.current = true;
    video.pause();
  };

  const toggleEnabled = async () => {
    const video = videoRef.current;

    if (enabled) {
      if (!video) return;
      explicitPausedRef.current = true;
      video.pause();
      setEnabled(false);
      setPaused(true);
      return;
    }

    setHasError(false);
    setEnabled(true);
    explicitPausedRef.current = false;
    setMuted(true);
  };

  const toggleMuted = async () => {
    const video = videoRef.current;
    if (!video || !enabled || hasError) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);

    if (!nextMuted && video.paused) {
      explicitPausedRef.current = false;
      await playVideo();
    }
  };

  const statusText = hasError ? "nicht geladen" : !enabled ? "aus" : paused ? "pausiert" : "läuft";

  return (
    <>
      {enabled && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <video
            ref={videoRef}
            className={cn(
              "h-full w-full opacity-40",
              fit === "contain" ? "object-contain" : "object-cover",
            )}
            src={src}
            poster={poster}
            title={title}
            muted={muted}
            playsInline
            loop
            autoPlay={!prefersReducedMotion}
            preload="metadata"
          />
        </div>
      )}

      <div className="fixed right-2 top-16 z-30 flex flex-col overflow-hidden rounded-2xl border border-border bg-background/90 text-foreground shadow-lg backdrop-blur-md sm:right-4 sm:top-20">
        {enabled && (
          <Button
            type="button"
            variant="ghost"
            onClick={togglePause}
            aria-label={paused ? "Video abspielen" : "Video pausieren"}
            className="h-11 justify-start rounded-none px-3 text-[11px] font-medium"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            <span>{paused ? "Video abspielen" : "Video pausieren"}</span>
            <span
              className={cn(
                "ml-auto h-1.5 w-1.5 rounded-full bg-foreground/70",
                !paused && "motion-safe:animate-pulse",
              )}
              aria-hidden="true"
            />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={toggleEnabled}
          aria-label={enabled ? "Video aus" : "Video an"}
          className="h-11 justify-start rounded-none border-t border-border px-3 text-[11px] font-medium first:border-t-0"
        >
          <Power className="h-4 w-4" />
          <span>{enabled ? "Video aus" : "Video an"}</span>
        </Button>
        {enabled && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggleMuted}
            aria-label={muted ? "Ton an" : "Ton aus"}
            className="h-11 justify-start rounded-none border-t border-border px-3 text-[11px] font-medium"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span>{muted ? "Ton an" : "Ton aus"}</span>
          </Button>
        )}
        {enabled && hasError && (
          <p className="max-w-36 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Video {statusText}
          </p>
        )}
      </div>
    </>
  );
}