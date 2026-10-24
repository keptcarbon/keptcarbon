import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { getOutline } from "@/lib/kitty-book";
import { BadRequest } from "@/lib/kitty-blog-write";
import { parseOutline, saveOutline } from "@/lib/kitty-book-write";
import { isBook } from "@/app/(main)/(landing)/kitty/book";

// One book's outline (handbook | textbook): GET for /rnd/kitty-content,
// PUT to save the outline editor, PATCH for a page's publish / hide switch.

type Ctx = { params: Promise<{ book: string }> };

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const noBook = () => NextResponse.json({ error: "ไม่พบเนื้อหานี้" }, { status: 404 });

/** GET /api/rnd/kitty-book/<book> — every section and page (hidden ones too), in order. */
export async function GET(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book } = await params;
  if (!isBook(book)) return noBook();
  return NextResponse.json({ sections: await getOutline(book, { includeHidden: true }) });
}

/**
 * PUT /api/rnd/kitty-book/<book> — the outline editor's save:
 * {sections: [{id | null (new), title, icon, pages: [page ids in order]}]}
 * in order. Sections left out are deleted (they must be empty); every page
 * must be listed once.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book } = await params;
  if (!isBook(book)) return noBook();
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new BadRequest("รูปแบบสารบัญไม่ถูกต้อง");
    }
    const sections = parseOutline(book, raw);
    const userId = getRequesterId(request);
    await withTransaction((client) => saveOutline(client, book, sections, userId));
    return NextResponse.json({ sections: await getOutline(book, { includeHidden: true }) });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("PUT /api/rnd/kitty-book/[book]", err);
    return NextResponse.json({ error: "บันทึกสารบัญไม่สำเร็จ" }, { status: 500 });
  }
}

/** PATCH /api/rnd/kitty-book/<book> — { slug, published }: the publish / hide switch. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) return forbidden();
  const { book } = await params;
  if (!isBook(book)) return noBook();
  try {
    const { slug, published } = (await request.json()) as { slug?: unknown; published?: unknown };
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 400 });
    }
    if (typeof published !== "boolean") {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    const updated = await pool.query(
      `UPDATE tbl_kitty_page p SET published = $3, updated_at = NOW(), updated_by = $4
       FROM tbl_kitty_section s
       WHERE s.id = p.section_id AND s.book = $1 AND p.slug = $2`,
      [book, slug, published, getRequesterId(request)]
    );
    if (!updated.rowCount) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
    return NextResponse.json({ slug, published });
  } catch (err) {
    console.error("PATCH /api/rnd/kitty-book/[book]", err);
    return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
