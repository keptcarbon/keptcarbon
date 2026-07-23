"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

type LazyVideoProps = {
  src: string;
  poster: string;
  className?: string;
};

/**
 * Video stays poster-only (no network fetch) until it scrolls near the
 * viewport, then it loads and plays once. Keeps below-the-fold demo clips
 * from costing every visitor bandwidth they may never use, and avoids
 * looping the same recording forever — a "watch again" button takes over
 * once it finishes.
 */
export function LazyVideo({ src, poster, className }: LazyVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const replay = () => {
    const el = ref.current;
    if (!el) return;
    setEnded(false);
    el.currentTime = 0;
    el.play();
  };

  const togglePlay = () => {
    const el = ref.current;
    if (!el || ended) return;
    if (el.paused) el.play();
    else el.pause();
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <video
        ref={ref}
        className="size-full cursor-pointer object-cover object-top"
        poster={poster}
        src={shouldLoad ? src : undefined}
        autoPlay={shouldLoad}
        muted
        playsInline
        preload="none"
        onClick={togglePlay}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={() => setEnded(true)}
      />

      {shouldLoad && paused && !ended && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="size-6 translate-x-0.5" fill="currentColor" aria-hidden="true" />
          </span>
        </div>
      )}

      {ended && (
        <button
          type="button"
          onClick={replay}
          aria-label="ดูวิดีโอนี้อีกครั้ง"
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white transition-colors hover:bg-black/50"
        >
          <span className="flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-foreground shadow-lg">
            <RotateCcw className="size-4" aria-hidden="true" />
            ดูอีกครั้ง
          </span>
        </button>
      )}
    </div>
  );
}
