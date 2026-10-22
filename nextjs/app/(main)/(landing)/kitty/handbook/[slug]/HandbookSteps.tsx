"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import type { ArticleLink, HandbookStep } from "../content";

const navButton =
  "inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium no-underline transition-colors cursor-pointer";
const backClass = `${navButton} border border-border bg-card text-foreground hover:bg-secondary`;
const forwardClass = `${navButton} border border-primary bg-primary font-semibold text-white hover:bg-[var(--kc-green-dark)]`;

/* One step at a time: stepper on top, step body, then ก่อนหน้า / ถัดไป —
   which walk the steps first and cross to the previous/next article at
   either end. */
export default function HandbookSteps({
  steps,
  prev,
  next,
}: {
  steps: HandbookStep[];
  prev: ArticleLink | null;
  next: ArticleLink | null;
}) {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const atFirst = current === 0;
  const atLast = current >= steps.length - 1;

  return (
    <>
      {steps.length > 0 ? (
        <>
          {/* ── Stepper ── */}
          <ol className="m-0 mb-8 flex list-none items-center gap-3 overflow-x-auto p-0">
            {steps.map(({ title }, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={i} className="flex min-w-0 flex-1 items-center gap-3 last:flex-none">
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={active ? "step" : undefined}
                    className="flex shrink-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0"
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${active || done
                        ? "bg-primary text-white"
                        : "bg-card text-muted-foreground ring-1 ring-border"
                        }`}
                    >
                      {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                    </span>
                    <span
                      className={`hidden text-sm whitespace-nowrap sm:inline ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}
                    >
                      {title}
                    </span>
                  </button>
                  {i < steps.length - 1 && (
                    <span
                      className={`h-px min-w-6 flex-1 ${done ? "bg-primary" : "bg-border"}`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {/* ── Step body ── */}
          <h2 className="mt-0 mb-1.5 text-lg font-bold text-foreground md:text-xl">
            ขั้นตอนที่ {current + 1} : {step.title}
          </h2>
          <p className="mt-0 mb-5 text-sm leading-relaxed text-muted-foreground md:text-base">
            {step.description}
          </p>
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--kc-shadow-card)]">
            {step.image ? (
              <Image
                src={step.image}
                alt={`ขั้นตอนที่ ${current + 1}: ${step.title}`}
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="object-contain"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="size-8 opacity-50" aria-hidden="true" />
                ภาพประกอบกำลังจัดทำ
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
          เนื้อหากำลังจัดทำ
        </p>
      )}

      {/* ── ก่อนหน้า / ถัดไป ── */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {steps.length > 0 && !atFirst ? (
          <button type="button" onClick={() => setCurrent((c) => c - 1)} className={backClass}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            ก่อนหน้า
          </button>
        ) : prev ? (
          <Link href={`/kitty/handbook/${prev.slug}/`} className={backClass} title={prev.title}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            ก่อนหน้า
          </Link>
        ) : (
          <span />
        )}

        {steps.length > 0 && !atLast ? (
          <button type="button" onClick={() => setCurrent((c) => c + 1)} className={forwardClass}>
            ถัดไป
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        ) : next ? (
          <Link href={`/kitty/handbook/${next.slug}/`} className={forwardClass} title={next.title}>
            ถัดไป: {next.title}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </>
  );
}
