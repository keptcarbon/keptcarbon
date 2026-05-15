"use client";

import { useEffect } from "react";

export default function SmoothScroll() {
  useEffect(() => {
    const onClick = (e: Event) => {
      const link = e.target as HTMLElement;
      const anchor = link.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = anchor.getAttribute("href")?.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const headerHeight = document.getElementById("header")?.offsetHeight ?? 80;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({ top, behavior: "smooth" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
