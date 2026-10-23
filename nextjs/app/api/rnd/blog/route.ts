import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { getAllBlogPosts } from "@/lib/kitty-blog";
import {
  BadRequest,
  IMAGE_URL,
  SLUG_PATTERN,
  formText,
  parseBlogForm,
  removeFiles,
  saveTags,
  writeBodyImage,
  writeNewImage,
} from "@/lib/kitty-blog-write";
import { findPost } from "@/app/(main)/(landing)/kitty/blog/content";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

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
 * Images are saved as <slug>-cover.<ext> and <slug>-blog-img-01.<ext>,
 * -02, … in body order; <ext> comes from the file's actual content.
 * Nothing is written unless every field and file is valid; if the insert
 * fails, the files just written are removed again.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const written: string[] = [];
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

    // ── Slug must be free: not a post in content.ts, not a row already ──
    if (findPost(slug)) throw new BadRequest("URL นี้ถูกใช้แล้ว");
    const taken = await pool.query("SELECT 1 FROM tbl_blog WHERE slug = $1", [slug]);
    if (taken.rowCount) throw new BadRequest("URL นี้ถูกใช้แล้ว");

    // ── Write images ──
    const cover = parsed.cover!;
    const coverName = `${slug}-cover.${cover.ext}`;
    written.push(await writeNewImage(coverName, cover.bytes));
    const coverUrl = `${IMAGE_URL}/${coverName}`;
    let next = 1;
    const body: PostBlock[] = [];
    for (const { block, image } of parsed.blocks) {
      if (image && block.type === "image") {
        const saved = await writeBodyImage(slug, image, next);
        written.push(saved.file);
        next = saved.n + 1;
        body.push({ ...block, src: saved.url });
      } else {
        body.push(block);
      }
    }

    // ── Insert the post, its new tags, and its tag links in one go ──
    const { title, category, date, author, published, tags } = parsed;
    const userId = getRequesterId(request);
    const id = await withTransaction(async (client) => {
      const result = await client.query<{ id: number }>(
        `INSERT INTO tbl_blog
           (slug, title, category, published_date, author, cover_image, body, published, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         RETURNING id`,
        [slug, title, category, date, author, coverUrl, JSON.stringify(body), published, userId]
      );
      const blogId = result.rows[0].id;
      await saveTags(client, blogId, tags, userId);
      return blogId;
    });

    return NextResponse.json(
      { id, slug, url: `/kitty/blog/${slug}/`, coverImage: coverUrl, body, tags },
      { status: 201 }
    );
  } catch (err) {
    // Undo any files written before the failure.
    await removeFiles(written);

    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Unique slug raced with another save, or an image name already existed.
    const code = (err as { code?: string }).code;
    if (code === "23505" || code === "EEXIST") {
      return NextResponse.json({ error: "URL นี้ถูกใช้แล้ว" }, { status: 409 });
    }
    console.error("POST /api/rnd/blog", err);
    return NextResponse.json({ error: "บันทึกบทความไม่สำเร็จ" }, { status: 500 });
  }
}

/**
 * GET /api/rnd/blog — every post (content.ts and tbl_blog), published or
 * not, newest first, for the list on /rnd/kitty-content.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const posts = (await getAllBlogPosts()).map(({ post, published, source }) => ({
    slug: post.slug,
    title: post.title,
    category: post.category,
    date: post.date,
    blocks: post.body.length,
    published,
    source,
  }));
  return NextResponse.json({ posts });
}

/**
 * PATCH /api/rnd/blog — { slug, published }: the publish / hide switch.
 * An editor post (tbl_blog) flips its own published column; a content.ts
 * post is recorded in tbl_kitty_blog_visibility.
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
    const userId = getRequesterId(request);

    const updated = await pool.query(
      "UPDATE tbl_blog SET published = $2, updated_at = NOW(), updated_by = $3 WHERE slug = $1",
      [slug, published, userId]
    );
    if (!updated.rowCount) {
      if (!findPost(slug)) {
        return NextResponse.json({ error: "ไม่พบบทความนี้" }, { status: 400 });
      }
      await pool.query(
        `INSERT INTO tbl_kitty_blog_visibility (slug, published, updated_at, updated_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (slug) DO UPDATE
           SET published = EXCLUDED.published, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [slug, published, userId]
      );
    }
    return NextResponse.json({ slug, published });
  } catch (err) {
    console.error("PATCH /api/rnd/blog", err);
    return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
