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

export function VideoBackground({
  src,
  poster,
  title,
  fit = "cover",
}: VideoBackgroundProps) {
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
    if (!video || !enabled) return;

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
    if (!video || !enabled) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
  };

  const controlButtonClass =
    "h-11 min-w-0 flex-1 justify-center gap-1.5 rounded-none border-l border-border px-2 text-[11px] font-medium first:border-l-0 xl:w-full xl:flex-none xl:justify-start xl:border-l-0 xl:border-t xl:first:border-t-0";

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

      <div
        className="relative z-30 mx-auto max-w-5xl px-4 pb-3 pt-28 xl:fixed xl:right-[max(1rem,calc((100vw-64rem)/2-7rem))] xl:top-20 xl:mx-0 xl:max-w-none xl:p-0"
      >
        <div className="mx-auto flex w-full max-w-sm items-stretch justify-center overflow-hidden rounded-2xl border border-border bg-background/90 text-foreground shadow-lg backdrop-blur-md sm:w-auto xl:w-[6.5rem] xl:flex-col">
        {enabled && (
          <Button
            type="button"
            variant="ghost"
            onClick={togglePause}
            aria-label={paused ? "Video abspielen" : "Video pausieren"}
            className={controlButtonClass}
          >
            {paused ? <Play className="h-4 w-4 shrink-0" /> : <Pause className="h-4 w-4 shrink-0" />}
            <span className="truncate">{paused ? "Abspielen" : "Pause"}</span>
            <span
              className={cn(
                "ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70 xl:block",
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
          className={controlButtonClass}
        >
          <Power className="h-4 w-4 shrink-0" />
          <span className="truncate">{enabled ? "Video aus" : "Video an"}</span>
        </Button>
        {enabled && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggleMuted}
            aria-label={muted ? "Ton an" : "Ton aus"}
            className={controlButtonClass}
          >
            {muted ? <VolumeX className="h-4 w-4 shrink-0" /> : <Volume2 className="h-4 w-4 shrink-0" />}
            <span className="truncate">{muted ? "Ton an" : "Ton aus"}</span>
          </Button>
        )}
        </div>
      </div>
    </>
  );
}