"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { blogCategories, categoryOf, formatThaiDate, sortedPosts } from "./content";
import type { BlogPost } from "./content";

const PAGE_SIZE = 6;
const posts = sortedPosts();

/* Category sidebar (chips below lg) + search + paged card grid. */
export default function BlogBrowser() {
  const [category, setCategory] = useState(""); // "" = ทั้งหมด
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [categoriesOpen, setCategoriesOpen] = useState(true);

  const q = query.trim().toLowerCase();
  const filtered = posts.filter(
    (p) => (!category || p.category === category) && (!q || p.title.toLowerCase().includes(q))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const pickCategory = (id: string) => {
    setCategory(id);
    setPage(1);
  };
  const goTo = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const options = [{ id: "", label: "ทั้งหมด" }, ...blogCategories];

  return (
    <div className="mx-auto flex max-w-9xl">
      {/* ── Category sidebar (lg+) ── */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-border bg-card px-4 py-8 lg:block">
        <button
          type="button"
          aria-expanded={categoriesOpen}
          onClick={() => setCategoriesOpen((v) => !v)}
          className="mb-2 flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1 text-left text-base font-bold text-foreground"
        >
          หมวดหมู่
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform duration-200 ${categoriesOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {categoriesOpen && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {options.map(({ id, label }) => {
              const active = id === category;
              return (
                <li key={id || "all"}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickCategory(id)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 py-2.5 pr-3 pl-3 text-left text-sm transition-colors ${active
                      ? "bg-secondary font-medium text-primary"
                      : "bg-transparent text-foreground hover:bg-secondary/60"
                      }`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                      aria-hidden="true"
                    />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 md:py-10 lg:px-10">
        {/* ── Header + search ── */}
        <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="m-0 text-3xl font-bold tracking-tight text-foreground md:text-4xl">Keppy Blog</h1>
            <p className="mt-2 mb-0 text-sm text-muted-foreground md:text-base">
              อัปเดตข่าวสาร บทความ และเรื่องราวจาก KeptCarbon
            </p>
          </div>
          <label className="relative block w-full md:w-80">
            <span className="sr-only">ค้นหาบทความ</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="ค้นหาบทความ..."
              className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <Search
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </label>
        </div>

        {/* ── Category chips (below lg) ── */}
        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {options.map(({ id, label }) => {
            const active = id === category;
            return (
              <button
                key={id || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => pickCategory(id)}
                className={`shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors ${active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Grid ── */}
        {shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6">
            {shown.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
            {posts.length === 0 ? "ยังไม่มีบทความ — ติดตามเร็ว ๆ นี้" : "ไม่พบบทความที่ค้นหา"}
          </p>
        )}

        {/* ── Pagination ── */}
        {pageCount > 1 && (
          <nav aria-label="เลขหน้า" className="mt-10 flex items-center justify-center gap-2">
            <PageButton label="หน้าก่อนหน้า" disabled={current === 1} onClick={() => goTo(current - 1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </PageButton>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <PageButton key={p} label={`หน้า ${p}`} active={p === current} onClick={() => goTo(p)}>
                {p}
              </PageButton>
            ))}
            <PageButton label="หน้าถัดไป" disabled={current === pageCount} onClick={() => goTo(current + 1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </PageButton>
          </nav>
        )}
      </main>
    </div>
  );
}

function PageButton({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-10 cursor-pointer items-center justify-center rounded-full border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active
        ? "border-primary bg-primary text-white"
        : "border-border bg-card text-foreground hover:bg-secondary"
        }`}
    >
      {children}
    </button>
  );
}

export function PostCard({ post }: { post: BlogPost }) {
  const { label, color, ink } = categoryOf(post);
  return (
    <Link
      href={`/kitty/blog/${post.slug}/`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card no-underline shadow-[var(--kc-shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--kc-shadow-lift)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={post.image}
          alt=""
          fill
          sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
          className="object-cover"
        />
        <span
          className="absolute bottom-3 left-3 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: color, color: ink }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <h2 className="mt-0 mb-6 line-clamp-2 text-base leading-snug font-semibold text-foreground group-hover:text-primary">
          {post.title}
        </h2>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">{formatThaiDate(post.date)}</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-primary">
            อ่านต่อ
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
