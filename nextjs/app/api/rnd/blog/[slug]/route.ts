import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import {
  BadRequest,
  dropUnusedImages,
  dropUnusedTags,
  insertImage,
  parseBlogForm,
  postImageUrls,
  saveTags,
  storeBodyImages,
} from "@/lib/kitty-blog-write";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

// One blog post (tbl_blog) by slug: GET to load it into the editor, PUT to
// save an edit, DELETE to remove it (its images and tag links go with it).

type Ctx = { params: Promise<{ slug: string }> };

type Row = {
  id: number;
  slug: string;
  title: string;
  category: string;
  date: string;
  author: string | null;
  cover_image: string;
  body: PostBlock[];
  published: boolean;
};

async function loadRow(slug: string): Promise<Row | null> {
  const result = await pool.query<Row>(
    `SELECT id, slug, title, category, to_char(published_date, 'YYYY-MM-DD') AS date,
            author, cover_image, body, published
     FROM tbl_blog WHERE slug = $1`,
    [slug]
  );
  return result.rows[0] ?? null;
}

function missing() {
  return NextResponse.json({ error: "ไม่พบบทความนี้" }, { status: 404 });
}

/** GET /api/rnd/blog/[slug] — the post as the editor needs it, with tags in order. */
export async function GET(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  try {
    const row = await loadRow(slug);
    if (!row) return missing();
    const tags = await pool.query<{ name: string }>(
      `SELECT t.name FROM tbl_blog_tag_map m JOIN tbl_blog_tag t ON t.id = m.tag_id
       WHERE m.blog_id = $1 ORDER BY m.position, t.name`,
      [row.id]
    );
    return NextResponse.json({
      slug: row.slug,
      title: row.title,
      category: row.category,
      date: row.date,
      author: row.author,
      coverImage: row.cover_image,
      body: row.body,
      published: row.published,
      tags: tags.rows.map((t) => t.name),
    });
  } catch (err) {
    console.error("GET /api/rnd/blog/[slug]", err);
    return NextResponse.json({ error: "โหลดบทความไม่สำเร็จ" }, { status: 500 });
  }
}

/**
 * PUT /api/rnd/blog/[slug] — save an edit (multipart/form-data, same
 * fields as POST /api/rnd/blog except slug, which can't change).
 *   cover — a new cover file, or leave it out to keep the current one.
 *   body  — image blocks either upload a new file ({file: "<field>"}) or
 *           keep one the post already has ({src: "<its current URL>"}).
 * New images are added to tbl_blog_image; images the post no longer uses
 * are deleted, and so are tags no post uses any more — all in one
 * transaction with the update.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  try {
    const row = await loadRow(slug);
    if (!row) return missing();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("ข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น multipart/form-data)");
    }
    // Body images may only "keep" URLs this post already uses.
    const existingImages = new Set(postImageUrls(row.cover_image, row.body).filter((u) => u !== row.cover_image));
    const parsed = await parseBlogForm(form, { existingImages, requireCover: false });

    const { title, category, date, author, published, tags } = parsed;
    const userId = getRequesterId(request);
    const { coverUrl, body } = await withTransaction(async (client) => {
      const coverUrl = parsed.cover ? await insertImage(client, row.id, parsed.cover) : row.cover_image;
      const body: PostBlock[] = await storeBodyImages(client, row.id, parsed.blocks);
      await client.query(
        `UPDATE tbl_blog
         SET title = $2, category = $3, published_date = $4, author = $5, cover_image = $6,
             body = $7, published = $8, updated_at = NOW(), updated_by = $9
         WHERE id = $1`,
        [row.id, title, category, date, author, coverUrl, JSON.stringify(body), published, userId]
      );
      await dropUnusedImages(client, row.id, postImageUrls(coverUrl, body));
      await saveTags(client, row.id, tags, userId);
      await dropUnusedTags(client);
      return { coverUrl, body };
    });

    return NextResponse.json({ slug, url: `/kitty/blog/${slug}/`, coverImage: coverUrl, body, tags });
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("PUT /api/rnd/blog/[slug]", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

/** DELETE /api/rnd/blog/[slug] — remove the post; its images and tag links
    go with it (ON DELETE CASCADE), then tags nothing else uses. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  try {
    const row = await loadRow(slug);
    if (!row) return missing();
    await withTransaction(async (client) => {
      await client.query("DELETE FROM tbl_blog WHERE id = $1", [row.id]);
      await dropUnusedTags(client);
    });
    return NextResponse.json({ slug, deleted: true });
  } catch (err) {
    console.error("DELETE /api/rnd/blog/[slug]", err);
    return NextResponse.json({ error: "ลบบทความไม่สำเร็จ" }, { status: 500 });
  }
}
