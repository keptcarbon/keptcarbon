"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated "running number": tweens from the value currently shown to
 * `target` over `ms`, so a changed selection glides between numbers instead
 * of restarting from 0. Starts from 0 on first render.
 */
export function useCounter(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    // A NaN/Infinity would otherwise poison every later tween (from + … = NaN).
    const to = Number.isFinite(target) ? target : 0;
    const from = Number.isFinite(shown.current) ? shown.current : 0;
    const start = performance.now();
    const t = setInterval(() => {
      const p = Math.min((performance.now() - start) / ms, 1);
      shown.current = from + (to - from) * p;
      setV(shown.current);
      if (p === 1) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [target, ms]);
  return v;
}
