import Link from "next/link";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import PostBlockView from "./blog/PostBlockView";
import type { PostBlock } from "./blog/content";
import type { Book, PageLink } from "./book";

/* Pieces the handbook and textbook pages share — and the page editor's
   preview on /rnd/kitty-content, so it looks like the real page. */

/** A page's body, or "เนื้อหากำลังจัดทำ" while it has none. */
export function BookBody({ body }: { body: PostBlock[] }) {
  if (body.length === 0) {
    return (
      <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
        เนื้อหากำลังจัดทำ
      </p>
    );
  }
  return (
    <div>
      {body.map((block, i) => (
        <PostBlockView key={i} block={block} />
      ))}
    </div>
  );
}

/** เกร็ดความรู้ — the textbook's side note. */
export function TipBox({ tip }: { tip: string | null }) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-secondary p-6">
      <h2 className="mt-0 mb-3 flex items-center gap-2.5 text-base font-bold text-foreground">
        <Lightbulb className="size-5 text-primary" aria-hidden="true" />
        เกร็ดความรู้
      </h2>
      <p className="m-0 text-sm leading-relaxed whitespace-pre-line text-foreground/85">{tip ?? "เนื้อหากำลังจัดทำ"}</p>
    </div>
  );
}

const navButton =
  "group flex min-w-0 max-w-[48%] items-center gap-2 rounded-2xl border px-4 py-3 no-underline transition-colors";

/** ก่อนหน้า / ถัดไป — whole pages, across sections, labelled with where they go. */
export function BookPager({ book, prev, next }: { book: Book; prev: PageLink | null; next: PageLink | null }) {
  const label = (link: PageLink) => (book === "textbook" ? `${link.number} ${link.title}` : link.title);
  return (
    <nav aria-label="หน้าก่อนหน้าและถัดไป" className="mt-12 flex items-stretch justify-between gap-3 border-t border-border pt-6">
      {prev ? (
        <Link
          href={`/kitty/${book}/${prev.slug}/`}
          className={`${navButton} border-border bg-card text-foreground hover:border-primary/30 hover:bg-secondary/50`}
        >
          <ChevronLeft className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">ก่อนหน้า</span>
            <span className="truncate text-sm font-semibold">{label(prev)}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/kitty/${book}/${next.slug}/`}
          className={`${navButton} ml-auto border-primary bg-primary text-right text-white hover:bg-[var(--kc-green-dark)]`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-white/80">ถัดไป</span>
            <span className="truncate text-sm font-semibold">{label(next)}</span>
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

/** Where the reader is in the textbook: chapter, lesson x of y in the
    chapter, and a bar for the whole book. */
export function BookProgress({ sectionNumber, sectionTitle, sectionPosition, sectionTotal, position, total }: {
  sectionNumber: number;
  sectionTitle: string;
  sectionPosition: number;
  sectionTotal: number;
  position: number;
  total: number;
}) {
  const percent = Math.round((position / total) * 100);
  return (
    <div className="mb-6 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-foreground">
          บทที่ {sectionNumber} {sectionTitle}
          <span className="ml-2 font-normal text-muted-foreground">
            · บทเรียน {sectionPosition} จาก {sectionTotal}
          </span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {position} / {total} บทเรียนทั้งเล่ม
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="ความคืบหน้าในตำรา"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={`บทเรียนที่ ${position} จาก ${total}`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Breadcrumb: Knowledge Center › …trail › current. */
export function BookBreadcrumb({ trail, current }: { trail: string[]; current: string }) {
  return (
    <nav aria-label="breadcrumb" className="mb-4">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-xs text-muted-foreground">
        <li>
          <Link href="/kitty/" className="text-muted-foreground no-underline hover:text-primary">
            Knowledge Center
          </Link>
        </li>
        {trail.map((label) => (
          <li key={label} className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5" aria-hidden="true" />
            {label}
          </li>
        ))}
        <li aria-current="page" className="flex items-center gap-1.5 font-semibold text-foreground">
          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {current}
        </li>
      </ol>
    </nav>
  );
}
