"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ListTree } from "lucide-react";
import { handbookGroups } from "./content";

/* Handbook table of contents — collapsible groups, numbered articles.
   The group holding the current article starts open. */
export default function HandbookNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  /* trailingSlash (next.config) leaves a "/" on the end */
  const activeSlug = pathname.replace(/\/$/, "").split("/").pop();

  const activeGroup = handbookGroups.find((g) =>
    g.articles.some((a) => a.slug === activeSlug)
  )?.title;

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup] : [])
  );
  /* The layout (and so this nav) persists across articles: open the new
     article's group when prev/next crosses into it. */
  const [seenGroup, setSeenGroup] = useState(activeGroup);
  if (activeGroup !== seenGroup) {
    setSeenGroup(activeGroup);
    if (activeGroup && !open.has(activeGroup)) setOpen(new Set(open).add(activeGroup));
  }
  const toggle = (title: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <nav aria-label="สารบัญคู่มือ" className="flex flex-col gap-1">
      {handbookGroups.map(({ title, icon: Icon, articles }) => {
        const isOpen = open.has(title);
        const hasActive = articles.some((a) => a.slug === activeSlug);
        return (
          <div key={title}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(title)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-3 py-2.5 text-left text-sm font-medium transition-colors ${hasActive
                ? "bg-secondary text-primary"
                : "bg-transparent text-foreground hover:bg-secondary/60"
                }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{title}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <ol className="m-0 mt-1 mb-2 flex list-none flex-col gap-0.5 p-0">
                {articles.map(({ slug, title: articleTitle }, i) => {
                  const active = slug === activeSlug;
                  return (
                    <li key={slug}>
                      <Link
                        href={`/kitty/handbook/${slug}`}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`relative block rounded-lg py-2 pr-3 pl-9 text-sm no-underline transition-colors ${active
                          ? "bg-muted font-semibold text-foreground after:absolute after:inset-y-1 after:right-0 after:w-[3px] after:rounded-full after:bg-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                      >
                        {i + 1}. {articleTitle}
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
  );
}

/* Below lg the table of contents folds into a toggle above the article. */
export function HandbookMobileNav() {
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
        <span className="flex-1">สารบัญคู่มือการใช้งานระบบ</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-border p-2">
          <HandbookNav onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
