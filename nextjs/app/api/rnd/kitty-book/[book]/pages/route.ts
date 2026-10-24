import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { BadRequest, SLUG_PATTERN, formText } from "@/lib/kitty-blog-write";
import { endOfSection, parsePageForm, storePageImages } from "@/lib/kitty-book-write";
import { isBook } from "@/app/(main)/(landing)/kitty/book";

type Ctx = { params: Promise<{ book: string }> };

/**
 * POST /api/rnd/kitty-book/<book>/pages — create a handbook article or
 * textbook lesson (multipart/form-data), added at the end of its section.
 *
 * Fields:
 *   slug, sectionId, title, description (optional), tip (textbook, optional),
 *   published ("true" | "false", default true),
 *   body — JSON array of blocks, as for a blog post (may be empty);
 *          each image block names the form field holding its file.
 *
 * Images are resized / converted to WebP and stored in
 * tbl_kitty_page_image, in the same transaction as the page.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { book } = await params;
  if (!isBook(book)) return NextResponse.json({ error: "ไม่พบเนื้อหานี้" }, { status: 404 });

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("ข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น multipart/form-data)");
    }

    const slug = formText(form, "slug");
    if (!SLUG_PATTERN.test(slug) || slug.length > 200) {
      throw new BadRequest("URL ของหน้าใช้ได้เฉพาะ a-z, 0-9 และขีด (-)");
    }
    const parsed = await parsePageForm(book, form, {});

    // Slugs are unique across both books.
    const taken = await pool.query("SELECT 1 FROM tbl_kitty_page WHERE slug = $1", [slug]);
    if (taken.rowCount) throw new BadRequest("URL นี้ถูกใช้แล้ว (ใน Handbook หรือ Textbook)");

    const { sectionId, title, description, tip, published } = parsed;
    const userId = getRequesterId(request);
    const body = await withTransaction(async (client) => {
      const result = await client.query<{ id: number }>(
        `INSERT INTO tbl_kitty_page
           (section_id, slug, title, description, tip, body, position, published, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, '[]', $6, $7, $8, $8)
         RETURNING id`,
        [sectionId, slug, title, description, tip, await endOfSection(client, sectionId), published, userId]
      );
      const pageId = result.rows[0].id;
      const body = await storePageImages(client, pageId, parsed.blocks);
      await client.query("UPDATE tbl_kitty_page SET body = $2 WHERE id = $1", [pageId, JSON.stringify(body)]);
      return body;
    });

    return NextResponse.json({ slug, url: `/kitty/${book}/${slug}/`, body }, { status: 201 });
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Unique slug raced with another save.
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "URL นี้ถูกใช้แล้ว" }, { status: 409 });
    }
    console.error("POST /api/rnd/kitty-book/[book]/pages", err);
    return NextResponse.json({ error: "บันทึกหน้าไม่สำเร็จ" }, { status: 500 });
  }
}
