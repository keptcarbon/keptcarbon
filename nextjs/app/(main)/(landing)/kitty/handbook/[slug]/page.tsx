import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { allArticleSlugs, findArticle } from "../content";
import HandbookSteps from "./HandbookSteps";

type Props = { params: Promise<{ slug: string }> };

/* Only the slugs in content.ts exist — anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return allArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findArticle((await params).slug);
  if (!found) return {};
  return {
    title: `${found.article.title} | KeptCarbon Handbook`,
    description: found.article.description,
  };
}

export default async function HandbookArticlePage({ params }: Props) {
  const found = findArticle((await params).slug);
  if (!found) notFound();
  const { group, article, number, prev, next } = found;

  return (
    <article className="mx-auto max-w-5xl">
      {/* ── Breadcrumb ── */}
      <nav aria-label="breadcrumb" className="mb-4">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-xs text-muted-foreground">
          <li>
            <Link href="/kitty/" className="text-muted-foreground no-underline hover:text-primary">
              Knowledge Center
            </Link>
          </li>
          {["คู่มือการใช้งานระบบ", group.title].map((label) => (
            <li key={label} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
          <li aria-current="page" className="flex items-center gap-1.5 font-semibold text-foreground">
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {article.title}
          </li>
        </ol>
      </nav>

      <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {number}. {article.title}
      </h1>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground md:text-base">
        {article.description}
      </p>

      {/* key: a fresh stepper (back to step 1) on every article */}
      <HandbookSteps key={article.slug} steps={article.steps} prev={prev} next={next} />
    </article>
  );
}
