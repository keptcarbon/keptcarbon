"use client";

import { useEffect, useRef, useState } from "react";

type RevealProps = {
  children: React.ReactNode;
  /** Stagger delay in ms, applied once the element is revealed. */
  delay?: number;
  className?: string;
};

/**
 * Subtle, one-time scroll reveal: fade + slide-up + soft blur-in.
 * Polite easing (ease-out-expo). Respects prefers-reduced-motion.
 */
export default function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => setShown(true));
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
        shown ? "translate-y-0" : "translate-y-8"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
