import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { getPublishedOutline, getPublishedPage } from "@/lib/kitty-book";
import { locatePage } from "../../book";
import { BookBody, BookBreadcrumb, BookPager, BookProgress, TipBox } from "../../BookParts";

type Props = { params: Promise<{ slug: string }> };

/* Rendered per request so edits and the publish / hide switch show up at
   once. Only published lessons exist — anything else is a 404. */
export const dynamic = "force-dynamic";

async function findLesson(slug: string) {
  const [page, outline] = await Promise.all([getPublishedPage("textbook", slug), getPublishedOutline("textbook")]);
  const place = page ? locatePage("textbook", outline, slug) : null;
  return page && place ? { page, place } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findLesson((await params).slug);
  if (!found) return {};
  return {
    title: `${found.place.number} ${found.page.title} | KeptCarbon Textbook`,
    description: found.page.description ?? found.place.section.title,
  };
}

export default async function TextbookLessonPage({ params }: Props) {
  const found = await findLesson((await params).slug);
  if (!found) notFound();
  const { page, place } = found;
  const { section, sectionNumber } = place;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-10">
      <article className="min-w-0">
        <BookBreadcrumb trail={["KeptCarbon Textbook"]} current={`บทที่ ${sectionNumber} ${section.title}`} />

        <BookProgress
          sectionNumber={sectionNumber}
          sectionTitle={section.title}
          sectionPosition={place.sectionPosition}
          sectionTotal={section.pages.length}
          position={place.position}
          total={place.total}
        />

        <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {place.number} {page.title}
        </h1>
        {page.description ? (
          <p className="mt-3 mb-0 text-base leading-relaxed text-muted-foreground">{page.description}</p>
        ) : null}

        <div className="mt-8">
          <BookBody body={page.body} />
        </div>

        <BookPager book="textbook" prev={place.prev} next={place.next} />
      </article>

      {/* ── เกร็ดความรู้ + ดาวน์โหลดเอกสาร — always shown, with an empty
             message until the lesson has a tip. Chapter downloads aren't
             stored yet (planned), so that box only says so. ── */}
      <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:self-start">
        <TipBox tip={page.tip} />

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mt-0 mb-4 flex items-center gap-2.5 text-base font-bold text-foreground">
            <FileDown className="size-5 text-primary" aria-hidden="true" />
            ดาวน์โหลดเอกสาร
          </h2>
          <p className="m-0 text-sm text-muted-foreground">ยังไม่มีเอกสารให้ดาวน์โหลด</p>
        </div>
      </aside>
    </div>
  );
}
