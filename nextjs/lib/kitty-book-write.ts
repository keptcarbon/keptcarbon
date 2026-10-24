import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { BadRequest, formText, parseBodyBlocks } from "@/lib/kitty-blog-write";
import type { PendingBlock, UploadedImage } from "@/lib/kitty-blog-write";
import { SECTION_ICONS } from "@/app/(main)/(landing)/kitty/book";
import type { Book } from "@/app/(main)/(landing)/kitty/book";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

/**
 * Shared by the handbook / textbook write routes under
 * /api/rnd/kitty-book/<book>: reading the page editor's multipart form,
 * storing page images (tbl_kitty_page_image, served from
 * /api/kitty-images/<id>/ — same WebP handling as the blog), and saving
 * the outline (section titles / icons / order, page order).
 */

const MAX_TIP_LENGTH = 2000;
const MAX_DESCRIPTION_LENGTH = 1000;

export type ParsedPageForm = {
  sectionId: number;
  title: string;
  description: string | null;
  tip: string | null;
  published: boolean;
  blocks: PendingBlock[];
};

/**
 * Validates the page editor form (everything except the slug) and reads
 * every uploaded image. Fields: sectionId, title, description, tip
 * (textbook only), published, body (see parseBodyBlocks — may be empty:
 * the page then shows "เนื้อหากำลังจัดทำ").
 */
export async function parsePageForm(
  book: Book,
  form: FormData,
  opts: { existingImages?: Set<string> }
): Promise<ParsedPageForm> {
  const title = formText(form, "title");
  const description = formText(form, "description") || null;
  const tip = book === "textbook" ? formText(form, "tip") || null : null;
  const published = formText(form, "published") !== "false";
  const sectionId = Number(formText(form, "sectionId"));

  if (!title || title.length > 300) throw new BadRequest("กรุณากรอกชื่อหน้า (ไม่เกิน 300 ตัวอักษร)");
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new BadRequest(`คำอธิบายยาวเกิน ${MAX_DESCRIPTION_LENGTH} ตัวอักษร`);
  }
  if (tip && tip.length > MAX_TIP_LENGTH) throw new BadRequest(`เกร็ดความรู้ยาวเกิน ${MAX_TIP_LENGTH} ตัวอักษร`);
  if (!Number.isInteger(sectionId) || sectionId <= 0) throw new BadRequest("กรุณาเลือกหมวด / บท");
  const section = await pool.query("SELECT 1 FROM tbl_kitty_section WHERE id = $1 AND book = $2", [sectionId, book]);
  if (!section.rowCount) throw new BadRequest("ไม่พบหมวด / บทที่เลือก");

  const blocks = await parseBodyBlocks(form, { existingImages: opts.existingImages, allowEmpty: true });
  return { sectionId, title, description, tip, published, blocks };
}

// ── Images (tbl_kitty_page_image) ──────────────────────────────────────

export const pageImageUrl = (id: number) => `/api/kitty-images/${id}/`;

function pageImageIdOf(url: string): number | null {
  const m = /^\/api\/kitty-images\/(\d+)\/?$/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Every image URL a page body uses. */
export const pageImageUrls = (body: PostBlock[]) => body.flatMap((b) => (b.type === "image" ? [b.src] : []));

async function insertPageImage(client: PoolClient, pageId: number, image: UploadedImage) {
  const result = await client.query<{ id: number }>(
    `INSERT INTO tbl_kitty_page_image (page_id, mime_type, data, width, height, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [pageId, image.mime, image.data, image.width, image.height, image.data.length]
  );
  return pageImageUrl(result.rows[0].id);
}

/** Stores the page's new uploads and returns its body with their URLs. */
export async function storePageImages(client: PoolClient, pageId: number, blocks: PendingBlock[]) {
  const body: PostBlock[] = [];
  for (const { block, image } of blocks) {
    body.push(image && block.type === "image" ? { ...block, src: await insertPageImage(client, pageId, image) } : block);
  }
  return body;
}

/** Deletes the page's images its body no longer uses. */
export async function dropUnusedPageImages(client: PoolClient, pageId: number, body: PostBlock[]) {
  const keep = pageImageUrls(body).map(pageImageIdOf).filter((id): id is number => id !== null);
  await client.query("DELETE FROM tbl_kitty_page_image WHERE page_id = $1 AND NOT (id = ANY($2::int[]))", [pageId, keep]);
}

/** Next position at the end of a section. */
export async function endOfSection(client: PoolClient, sectionId: number) {
  const result = await client.query<{ next: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM tbl_kitty_page WHERE section_id = $1",
    [sectionId]
  );
  return result.rows[0].next;
}

// ── Outline ────────────────────────────────────────────────────────────

export type OutlineInput = { id: number | null; title: string; icon: string | null; pages: number[] }[];

/** The outline editor's payload, checked for shape: {sections: [{id | null,
    title, icon, pages: [page ids in order]}]} in order. */
export function parseOutline(book: Book, raw: unknown): OutlineInput {
  const sections = (raw as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) throw new BadRequest("รูปแบบสารบัญไม่ถูกต้อง");
  if (sections.length > 100) throw new BadRequest("มีหมวด / บทได้ไม่เกิน 100");
  return sections.map((s, i) => {
    const n = i + 1;
    const r = s as Record<string, unknown>;
    const id = r?.id === null ? null : Number(r?.id);
    if (id !== null && (!Number.isInteger(id) || id <= 0)) throw new BadRequest(`ลำดับที่ ${n}: รหัสหมวดไม่ถูกต้อง`);
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title || title.length > 200) throw new BadRequest(`ลำดับที่ ${n}: กรุณากรอกชื่อ (ไม่เกิน 200 ตัวอักษร)`);
    const icon = book === "handbook" && typeof r.icon === "string" && r.icon in SECTION_ICONS ? r.icon : null;
    if (!Array.isArray(r.pages) || !r.pages.every((p) => Number.isInteger(p) && p > 0)) {
      throw new BadRequest(`ลำดับที่ ${n}: รายการหน้าไม่ถูกต้อง`);
    }
    return { id, title, icon, pages: r.pages as number[] };
  });
}

/**
 * Saves the whole outline in one transaction: creates new sections,
 * renames / re-icons / reorders the rest, moves pages between sections and
 * reorders them, and deletes sections left out. Every page of the book
 * must be listed exactly once (pages are deleted on their own, never by
 * leaving them out), and a section can only be dropped once it is empty.
 */
export async function saveOutline(client: PoolClient, book: Book, sections: OutlineInput, userId: number | null) {
  const existing = await client.query<{ id: number }>("SELECT id FROM tbl_kitty_section WHERE book = $1", [book]);
  const sectionIds = new Set(existing.rows.map((r) => r.id));
  const pagesResult = await client.query<{ id: number }>(
    `SELECT p.id FROM tbl_kitty_page p JOIN tbl_kitty_section s ON s.id = p.section_id WHERE s.book = $1`,
    [book]
  );
  const pageIds = new Set(pagesResult.rows.map((r) => r.id));

  const listedPages = sections.flatMap((s) => s.pages);
  if (new Set(listedPages).size !== listedPages.length || listedPages.length !== pageIds.size || !listedPages.every((id) => pageIds.has(id))) {
    throw new BadRequest("สารบัญไม่ตรงกับหน้าที่มีอยู่ — อาจมีคนแก้ไขพร้อมกัน กรุณาโหลดหน้าใหม่");
  }
  for (const s of sections) {
    if (s.id !== null && !sectionIds.has(s.id)) throw new BadRequest("ไม่พบหมวด / บทบางรายการ — กรุณาโหลดหน้าใหม่");
  }

  const kept = new Set<number>();
  for (const [i, s] of sections.entries()) {
    let id = s.id;
    if (id === null) {
      const created = await client.query<{ id: number }>(
        `INSERT INTO tbl_kitty_section (book, title, icon, position, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        [book, s.title, s.icon, i + 1, userId]
      );
      id = created.rows[0].id;
    } else {
      await client.query(
        `UPDATE tbl_kitty_section
         SET title = $2::varchar, icon = $3::varchar, position = $4,
             updated_at = CASE WHEN title IS DISTINCT FROM $2::varchar OR icon IS DISTINCT FROM $3::varchar THEN NOW() ELSE updated_at END,
             updated_by = CASE WHEN title IS DISTINCT FROM $2::varchar OR icon IS DISTINCT FROM $3::varchar THEN $5::int ELSE updated_by END
         WHERE id = $1`,
        [id, s.title, s.icon, i + 1, userId]
      );
    }
    kept.add(id);
    // Page order within the section = its place in the list.
    if (s.pages.length) {
      await client.query(
        `UPDATE tbl_kitty_page p SET section_id = $1, position = o.ord
         FROM unnest($2::int[]) WITH ORDINALITY AS o(id, ord)
         WHERE p.id = o.id`,
        [id, s.pages]
      );
    }
  }

  const dropped = [...sectionIds].filter((id) => !kept.has(id));
  if (dropped.length) {
    // Their pages were all moved above; RESTRICT guards anything missed.
    await client.query("DELETE FROM tbl_kitty_section WHERE id = ANY($1::int[])", [dropped]);
  }
}
