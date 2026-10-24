import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { getPage } from "@/lib/kitty-book";
import { BadRequest } from "@/lib/kitty-blog-write";
import {
  dropUnusedPageImages,
  endOfSection,
  pageImageUrls,
  parsePageForm,
  storePageImages,
} from "@/lib/kitty-book-write";
import { isBook } from "@/app/(main)/(landing)/kitty/book";

// One handbook article / textbook lesson by slug: GET to load it into the
// editor, PUT to save an edit, DELETE to remove it (its images go with it).

type Ctx = { params: Promise<{ book: string; slug: string }> };

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const missing = () => NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

/** GET /api/rnd/kitty-book/<book>/pages/<slug> — the page as the editor needs it. */
export async function GET(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book, slug } = await params;
  if (!isBook(book)) return missing();
  try {
    const page = await getPage(book, slug);
    return page ? NextResponse.json(page) : missing();
  } catch (err) {
    console.error("GET /api/rnd/kitty-book/[book]/pages/[slug]", err);
    return NextResponse.json({ error: "โหลดหน้าไม่สำเร็จ" }, { status: 500 });
  }
}

/**
 * PUT /api/rnd/kitty-book/<book>/pages/<slug> — save an edit
 * (multipart/form-data, same fields as POST …/pages except slug, which
 * can't change). Image blocks either upload a new file ({file: "<field>"})
 * or keep one the page already has ({src: "<its current URL>"}); images the
 * page no longer uses are deleted. Moving the page to another section puts
 * it at the end of that section.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book, slug } = await params;
  if (!isBook(book)) return missing();
  try {
    const page = await getPage(book, slug);
    if (!page) return missing();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("ข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น multipart/form-data)");
    }
    // Body images may only "keep" URLs this page already uses.
    const parsed = await parsePageForm(book, form, { existingImages: new Set(pageImageUrls(page.body)) });

    const { sectionId, title, description, tip, published } = parsed;
    const userId = getRequesterId(request);
    const body = await withTransaction(async (client) => {
      const body = await storePageImages(client, page.id, parsed.blocks);
      const moved = sectionId !== page.sectionId;
      await client.query(
        `UPDATE tbl_kitty_page
         SET section_id = $2, title = $3, description = $4, tip = $5, body = $6, published = $7,
             position = COALESCE($8, position), updated_at = NOW(), updated_by = $9
         WHERE id = $1`,
        [page.id, sectionId, title, description, tip, JSON.stringify(body), published,
          moved ? await endOfSection(client, sectionId) : null, userId]
      );
      await dropUnusedPageImages(client, page.id, body);
      return body;
    });

    return NextResponse.json({ slug, url: `/kitty/${book}/${slug}/`, body });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("PUT /api/rnd/kitty-book/[book]/pages/[slug]", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

/** DELETE /api/rnd/kitty-book/<book>/pages/<slug> — remove the page; its
    images go with it (ON DELETE CASCADE). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book, slug } = await params;
  if (!isBook(book)) return missing();
  try {
    const deleted = await pool.query(
      `DELETE FROM tbl_kitty_page p USING tbl_kitty_section s
       WHERE s.id = p.section_id AND s.book = $1 AND p.slug = $2`,
      [book, slug]
    );
    if (!deleted.rowCount) return missing();
    return NextResponse.json({ slug, deleted: true });
  } catch (err) {
    console.error("DELETE /api/rnd/kitty-book/[book]/pages/[slug]", err);
    return NextResponse.json({ error: "ลบหน้าไม่สำเร็จ" }, { status: 500 });
  }
}
