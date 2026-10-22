"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, ListTree, Search } from "lucide-react";
import { textbookChapters } from "./content";

/* Textbook table of contents — topic search, collapsible chapters, and
   numbered lessons. The chapter holding the current lesson starts open;
   while searching, every chapter with a match is shown open. */
export default function TextbookNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  /* trailingSlash (next.config) leaves a "/" on the end */
  const activeSlug = pathname.replace(/\/$/, "").split("/").pop();
  const activeChapter = textbookChapters.findIndex((c) =>
    c.lessons.some((l) => l.slug === activeSlug)
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(activeChapter >= 0 ? [activeChapter] : [])
  );
  /* The layout (and so this nav) persists across lessons: open the new
     lesson's chapter when prev/next crosses into it. */
  const [seenChapter, setSeenChapter] = useState(activeChapter);
  if (activeChapter !== seenChapter) {
    setSeenChapter(activeChapter);
    if (activeChapter >= 0 && !open.has(activeChapter)) setOpen(new Set(open).add(activeChapter));
  }
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const q = query.trim().toLowerCase();
  const chapters = textbookChapters
    .map((chapter, c) => ({
      ...chapter,
      index: c,
      lessons: chapter.lessons
        .map((lesson, l) => ({ ...lesson, number: `${c + 1}.${l + 1}` }))
        .filter(
          (lesson) =>
            !q ||
            lesson.title.toLowerCase().includes(q) ||
            lesson.number.startsWith(q) ||
            chapter.title.toLowerCase().includes(q)
        ),
    }))
    .filter((chapter) => !q || chapter.lessons.length > 0);

  return (
    <div>
      <label className="relative mb-4 block">
        <span className="sr-only">ค้นหาหัวข้อ</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาหัวข้อ..."
          className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>

      <nav aria-label="สารบัญตำรา" className="flex flex-col gap-1">
        {chapters.length === 0 && (
          <p className="m-0 px-3 py-4 text-center text-sm text-muted-foreground">ไม่พบหัวข้อที่ค้นหา</p>
        )}
        {chapters.map(({ title, index, lessons }) => {
          const isOpen = q ? true : open.has(index);
          const hasActive = index === activeChapter;
          return (
            <div key={title}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(index)}
                disabled={!!q}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-default ${hasActive
                  ? "border-primary/25 bg-secondary text-foreground"
                  : "border-transparent bg-transparent text-foreground hover:bg-secondary/60"
                  }`}
              >
                <BookOpen
                  className={`size-4 shrink-0 ${hasActive ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="flex-1">
                  บทที่ {index + 1} {title}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <ol className="m-0 mt-1 mb-2 flex list-none flex-col gap-0.5 p-0">
                  {lessons.map(({ slug, title: lessonTitle, number }) => {
                    const active = slug === activeSlug;
                    return (
                      <li key={slug}>
                        <Link
                          href={`/kitty/textbook/${slug}/`}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={`flex gap-2 rounded-lg py-2 pr-3 pl-9 text-sm no-underline transition-colors ${active
                            ? "bg-muted font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                          <span className="tabular-nums">{number}</span>
                          {lessonTitle}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/* Below lg the table of contents folds into a toggle above the lesson. */
export function TextbookMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-xl border border-border bg-card lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-sm font-semibold text-foreground"
      >
        <ListTree className="size-4 text-primary" aria-hidden="true" />
        <span className="flex-1">สารบัญ KeptCarbon Textbook</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <TextbookNav onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
