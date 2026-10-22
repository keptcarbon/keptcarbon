import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileText,
  Lightbulb,
} from "lucide-react";
import { allLessonSlugs, findLesson } from "../content";
import type { LessonBlock } from "../content";

type Props = { params: Promise<{ slug: string }> };

/* Only the slugs in content.ts exist — anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allLessonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findLesson((await params).slug);
  if (!found) return {};
  return {
    title: `${found.number} ${found.lesson.title} | KeptCarbon Textbook`,
    description: found.lesson.intro ?? found.chapter.title,
  };
}

const navButton =
  "inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium no-underline transition-colors";

function Block({ block }: { block: LessonBlock }) {
  if (block.type === "image") {
    return (
      <figure className="my-8">
        <Image
          src={block.src}
          alt={block.alt}
          width={1200}
          height={700}
          className="h-auto w-full rounded-2xl border border-border"
        />
        {block.caption ? (
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">
            {block.caption}
          </figcaption>
        ) : null}
      </figure>
    );
  }
  return (
    <p className="mt-0 mb-4 text-base leading-relaxed text-foreground/90">
      {block.text}
    </p>
  );
}

export default async function TextbookLessonPage({ params }: Props) {
  const found = findLesson((await params).slug);
  if (!found) notFound();
  const { chapter, chapterNumber, lesson, number, prev, next } = found;
  const downloads = chapter.downloads ?? [];

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-10">
      <article className="min-w-0">
        {/* ── Breadcrumb ── */}
        <nav aria-label="breadcrumb" className="mb-4">
          <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-xs text-muted-foreground">
            <li>
              <Link
                href="/kitty/"
                className="text-muted-foreground no-underline hover:text-primary"
              >
                Knowledge Center
              </Link>
            </li>
            <li className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              KeptCarbon Textbook
            </li>
            <li
              aria-current="page"
              className="flex items-center gap-1.5 font-semibold text-foreground"
            >
              <ChevronRight
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              บทที่ {chapterNumber} {chapter.title}
            </li>
          </ol>
        </nav>

        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {number} {lesson.title}
        </h1>
        {lesson.intro ? (
          <p className="mt-3 mb-0 text-base leading-relaxed text-muted-foreground">
            {lesson.intro}
          </p>
        ) : null}

        <div className="mt-8">
          {lesson.body.length > 0 ? (
            lesson.body.map((block, i) => <Block key={i} block={block} />)
          ) : (
            <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
              เนื้อหากำลังจัดทำ
            </p>
          )}
        </div>

        {/* ── ก่อนหน้า / ถัดไป ── */}
        <div className="mt-10 flex items-center justify-between gap-3">
          {prev ? (
            <Link
              href={`/kitty/textbook/${prev.slug}/`}
              title={`${prev.number} ${prev.title}`}
              className={`${navButton} border border-border bg-card text-foreground hover:bg-secondary`}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              ก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/kitty/textbook/${next.slug}/`}
              title={`${next.number} ${next.title}`}
              className={`${navButton} border border-primary bg-primary font-semibold text-white hover:bg-[var(--kc-green-dark)]`}
            >
              ถัดไป
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </article>

      {/* ── เกร็ดความรู้ + ดาวน์โหลดเอกสาร — always shown, with an empty
             message until the lesson has a tip / the chapter has files ── */}
      <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-2xl border border-primary/15 bg-secondary p-6">
          <h2 className="mt-0 mb-3 flex items-center gap-2.5 text-base font-bold text-foreground">
            <Lightbulb className="size-5 text-primary" aria-hidden="true" />
            เกร็ดความรู้
          </h2>
          <p className="m-0 text-sm leading-relaxed text-foreground/85">
            {lesson.tip ?? "เนื้อหากำลังจัดทำ"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mt-0 mb-4 flex items-center gap-2.5 text-base font-bold text-foreground">
            <FileDown className="size-5 text-primary" aria-hidden="true" />
            ดาวน์โหลดเอกสาร
          </h2>
          {downloads.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {downloads.map(({ label, href, format, size }) => (
                <li key={href}>
                  <a
                    href={href}
                    download
                    className="group flex items-center gap-3 rounded-xl border border-border px-4 py-3 no-underline transition-colors hover:border-primary/30 hover:bg-secondary/50"
                  >
                    <FileText
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {format} · {size}
                      </span>
                    </span>
                    <Download
                      className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              ยังไม่มีเอกสารให้ดาวน์โหลด
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
