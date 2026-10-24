import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { getAllBlogPosts } from "@/lib/kitty-blog";
import {
  BadRequest,
  SLUG_PATTERN,
  formText,
  insertImage,
  parseBlogForm,
  saveTags,
  storeBodyImages,
} from "@/lib/kitty-blog-write";

/**
 * POST /api/rnd/blog — create a Keppy Blog post (multipart/form-data).
 * Only JPG, PNG and WebP images are accepted, judged by the file's bytes.
 *
 * Fields:
 *   title, slug, category, date (YYYY-MM-DD), author (optional),
 *   published ("true" | "false", default true),
 *   tags   — JSON array of tag names (optional; new ones are added to
 *            tbl_blog_tag, see blog/tags.ts for the rules),
 *   cover  — the cover image file,
 *   body   — JSON array of blocks, in order:
 *              {type: "paragraph" | "heading", text}
 *              {type: "quote" | "quote-<colour>", text}
 *              {type: "image", file: "<form field>", alt, caption?}
 *            each image block names the form field holding its file.
 *
 * Images are resized / converted to WebP and stored in tbl_blog_image,
 * in the same transaction as the post — all saved, or nothing.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("ข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น multipart/form-data)");
    }

    const slug = formText(form, "slug");
    if (!SLUG_PATTERN.test(slug) || slug.length > 200) {
      throw new BadRequest("URL ของบทความใช้ได้เฉพาะ a-z, 0-9 และขีด (-)");
    }
    const parsed = await parseBlogForm(form, { requireCover: true });

    // ── Slug must be free ──
    const taken = await pool.query("SELECT 1 FROM tbl_blog WHERE slug = $1", [slug]);
    if (taken.rowCount) throw new BadRequest("URL นี้ถูกใช้แล้ว");

    // ── Insert the post, its images, its new tags, and its tag links in one
    //    transaction (images need the post's id, so its URLs go in after) ──
    const { title, category, date, author, published, tags } = parsed;
    const userId = getRequesterId(request);
    const saved = await withTransaction(async (client) => {
      const result = await client.query<{ id: number }>(
        `INSERT INTO tbl_blog
           (slug, title, category, published_date, author, cover_image, body, published, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, '', '[]', $6, $7, $7)
         RETURNING id`,
        [slug, title, category, date, author, published, userId]
      );
      const blogId = result.rows[0].id;
      const coverUrl = await insertImage(client, blogId, parsed.cover!);
      const body = await storeBodyImages(client, blogId, parsed.blocks);
      await client.query("UPDATE tbl_blog SET cover_image = $2, body = $3 WHERE id = $1", [blogId, coverUrl, JSON.stringify(body)]);
      await saveTags(client, blogId, tags, userId);
      return { id: blogId, coverUrl, body };
    });
    const { id, coverUrl, body } = saved;

    return NextResponse.json(
      { id, slug, url: `/kitty/blog/${slug}/`, coverImage: coverUrl, body, tags },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Unique slug raced with another save.
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "URL นี้ถูกใช้แล้ว" }, { status: 409 });
    }
    console.error("POST /api/rnd/blog", err);
    return NextResponse.json({ error: "บันทึกบทความไม่สำเร็จ" }, { status: 500 });
  }
}

/**
 * GET /api/rnd/blog — every post in tbl_blog, published or
 * not, newest first, for the list on /rnd/kitty-content.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const posts = (await getAllBlogPosts()).map(({ post, published }) => ({
    slug: post.slug,
    title: post.title,
    category: post.category,
    date: post.date,
    blocks: post.body.length,
    published,
  }));
  return NextResponse.json({ posts });
}

/**
 * PATCH /api/rnd/blog — { slug, published }: the publish / hide switch.
 */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { slug, published } = (await request.json()) as { slug?: unknown; published?: unknown };
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "ไม่พบบทความนี้" }, { status: 400 });
    }
    if (typeof published !== "boolean") {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    const updated = await pool.query(
      "UPDATE tbl_blog SET published = $2, updated_at = NOW(), updated_by = $3 WHERE slug = $1",
      [slug, published, getRequesterId(request)]
    );
    if (!updated.rowCount) {
      return NextResponse.json({ error: "ไม่พบบทความนี้" }, { status: 404 });
    }
    return NextResponse.json({ slug, published });
  } catch (err) {
    console.error("PATCH /api/rnd/blog", err);
    return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
