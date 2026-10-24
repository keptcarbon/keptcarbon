import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedOutline, getPublishedPage } from "@/lib/kitty-book";
import { locatePage } from "../../book";
import { BookBody, BookBreadcrumb, BookPager } from "../../BookParts";

type Props = { params: Promise<{ slug: string }> };

/* Rendered per request so edits and the publish / hide switch show up at
   once. Only published articles exist — anything else is a 404. */
export const dynamic = "force-dynamic";

async function findArticle(slug: string) {
  const [page, outline] = await Promise.all([getPublishedPage("handbook", slug), getPublishedOutline("handbook")]);
  const place = page ? locatePage("handbook", outline, slug) : null;
  return page && place ? { page, place } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findArticle((await params).slug);
  if (!found) return {};
  return {
    title: `${found.page.title} | KeptCarbon Handbook`,
    description: found.page.description ?? found.place.section.title,
  };
}

export default async function HandbookArticlePage({ params }: Props) {
  const found = await findArticle((await params).slug);
  if (!found) notFound();
  const { page, place } = found;

  return (
    <article className="mx-auto max-w-4xl">
      <BookBreadcrumb trail={["คู่มือการใช้งานระบบ", place.section.title]} current={page.title} />

      <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {place.number} {page.title}
      </h1>
      {page.description ? (
        <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground md:text-base">{page.description}</p>
      ) : null}

      <div className="mt-8">
        <BookBody body={page.body} />
      </div>

      <BookPager book="handbook" prev={place.prev} next={place.next} />
    </article>
  );
}
