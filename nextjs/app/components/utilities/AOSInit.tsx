"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    AOS?: { init: (opts: Record<string, unknown>) => void; refresh: () => void };
  }
}

export default function AOSInit() {
  useEffect(() => {
    let cancelled = false;

    const ensureCss = () => {
      if (document.querySelector('link[data-aos-css]')) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/assets/vendor/aos/aos.css";
      link.setAttribute("data-aos-css", "true");
      document.head.appendChild(link);
    };

    const init = () => {
      if (cancelled || !window.AOS) return;
      window.AOS.init({ duration: 600, easing: "ease-in-out", once: true, mirror: false });
    };

    ensureCss();

    if (window.AOS) {
      init();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-aos-script]');
    if (existing) {
      existing.addEventListener("load", init, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/assets/vendor/aos/aos.js";
    script.async = true;
    script.setAttribute("data-aos-script", "true");
    script.addEventListener("load", init, { once: true });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
