import { cache } from "react";
import { pool } from "@/lib/db";
import type { Book, BookPage, OutlineSection } from "@/app/(main)/(landing)/kitty/book";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

/**
 * KeptCarbon Handbook / Textbook — reads tbl_kitty_section + tbl_kitty_page
 * (written on /rnd/kitty-content). Everything that lists or shows book
 * pages reads them through here.
 *
 * Fails soft like the blog: if the tables can't be read the book shows as
 * empty (and the error is logged) rather than the pages crashing.
 */

type OutlineRow = {
  section_id: number;
  section_title: string;
  icon: string | null;
  page_id: number | null;
  slug: string | null;
  title: string | null;
  published: boolean | null;
  blocks: number | null;
};

/** Sections and their pages, in order. `includeHidden` (the admin) also
    lists unpublished pages; otherwise those are left out, and so are
    sections with no visible page. */
export async function getOutline(book: Book, opts: { includeHidden: boolean }): Promise<OutlineSection[]> {
  try {
    const result = await pool.query<OutlineRow>(
      `SELECT s.id AS section_id, s.title AS section_title, s.icon,
              p.id AS page_id, p.slug, p.title, p.published, jsonb_array_length(p.body) AS blocks
       FROM tbl_kitty_section s
       LEFT JOIN tbl_kitty_page p ON p.section_id = s.id AND ($2 OR p.published)
       WHERE s.book = $1
       ORDER BY s.position, s.id, p.position, p.id`,
      [book, opts.includeHidden]
    );
    const sections: OutlineSection[] = [];
    for (const r of result.rows) {
      let section = sections.at(-1);
      if (section?.id !== r.section_id) {
        section = { id: r.section_id, title: r.section_title, icon: r.icon, pages: [] };
        sections.push(section);
      }
      if (r.page_id !== null) {
        section.pages.push({ id: r.page_id, slug: r.slug!, title: r.title!, published: r.published!, blocks: r.blocks ?? 0 });
      }
    }
    return opts.includeHidden ? sections : sections.filter((s) => s.pages.length > 0);
  } catch (err) {
    console.error(`kitty-book: reading the ${book} outline failed — shown empty`, err);
    return [];
  }
}

/** The public outline, read once per request (layout + page share it). */
export const getPublishedOutline = cache((book: Book) => getOutline(book, { includeHidden: false }));

type PageRow = {
  id: number;
  section_id: number;
  slug: string;
  title: string;
  description: string | null;
  tip: string | null;
  body: PostBlock[];
  published: boolean;
};

/** One page of the book by slug, published or not; null if there's none. */
export async function getPage(book: Book, slug: string): Promise<BookPage | null> {
  const result = await pool.query<PageRow>(
    `SELECT p.id, p.section_id, p.slug, p.title, p.description, p.tip, p.body, p.published
     FROM tbl_kitty_page p JOIN tbl_kitty_section s ON s.id = p.section_id
     WHERE s.book = $1 AND p.slug = $2`,
    [book, slug]
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    sectionId: r.section_id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    tip: r.tip,
    body: r.body,
    published: r.published,
  };
}

/** The published page with this slug, for the public pages (read once per
    request — metadata + page share it); null if hidden or missing. */
export const getPublishedPage = cache(async (book: Book, slug: string) => {
  try {
    const page = await getPage(book, slug);
    return page?.published ? page : null;
  } catch (err) {
    console.error(`kitty-book: reading ${book} page ${slug} failed`, err);
    return null;
  }
});
