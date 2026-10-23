import { randomBytes } from "crypto";
import { rename } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import {
  BadRequest,
  IMAGE_DIR,
  IMAGE_URL,
  dropUnusedTags,
  imageFile,
  lastBodyImageNumber,
  parseBlogForm,
  postImageUrls,
  removeFiles,
  saveTags,
  writeBodyImage,
  writeNewImage,
} from "@/lib/kitty-blog-write";
import { findPost } from "@/app/(main)/(landing)/kitty/blog/content";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

// One editor post (tbl_blog) by slug: GET to load it into the editor, PUT
// to save an edit, DELETE to remove it with its images. Posts written in
// content.ts can't be edited or deleted here — only published / hidden
// (PATCH /api/rnd/blog).

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

/** 404 for an unknown slug; 400 when it's a content.ts post (read-only). */
function missing(slug: string) {
  return findPost(slug)
    ? NextResponse.json({ error: "บทความนี้เขียนไว้ในโค้ด (content.ts) — แก้ไขหรือลบผ่านหน้านี้ไม่ได้" }, { status: 400 })
    : NextResponse.json({ error: "ไม่พบบทความนี้" }, { status: 404 });
}

/** GET /api/rnd/blog/[slug] — the post as the editor needs it, with tags in order. */
export async function GET(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  try {
    const row = await loadRow(slug);
    if (!row) return missing(slug);
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
 * New body images get the next free <slug>-blog-img-NN number. A new cover
 * replaces <slug>-cover.<ext> once the row is saved. Images the post no
 * longer uses are deleted afterwards; so are tags no post uses any more.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;

  const written: string[] = [];
  try {
    const row = await loadRow(slug);
    if (!row) return missing(slug);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("ข้อมูลที่ส่งมาไม่ถูกต้อง (ต้องเป็น multipart/form-data)");
    }
    const oldUrls = postImageUrls(row.cover_image, row.body);
    const existingImages = new Set(oldUrls.filter((u) => u !== row.cover_image));
    const parsed = await parseBlogForm(form, { existingImages, requireCover: false });

    // ── New cover: written beside the old one, swapped in after the save ──
    let coverUrl = row.cover_image;
    let coverSwap: { temp: string; final: string } | null = null;
    if (parsed.cover) {
      const finalName = `${slug}-cover.${parsed.cover.ext}`;
      const temp = await writeNewImage(`${finalName}.${randomBytes(6).toString("hex")}.uploading`, parsed.cover.bytes);
      written.push(temp);
      coverSwap = { temp, final: path.join(IMAGE_DIR, finalName) };
      coverUrl = `${IMAGE_URL}/${finalName}`;
    }

    // ── New body images: numbered after the highest one the post has had ──
    let next = lastBodyImageNumber(slug, oldUrls) + 1;
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

    // ── Save ──
    const { title, category, date, author, published, tags } = parsed;
    const userId = getRequesterId(request);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE tbl_blog
         SET title = $2, category = $3, published_date = $4, author = $5, cover_image = $6,
             body = $7, published = $8, updated_at = NOW(), updated_by = $9
         WHERE id = $1`,
        [row.id, title, category, date, author, coverUrl, JSON.stringify(body), published, userId]
      );
      await saveTags(client, row.id, tags, userId);
      await dropUnusedTags(client);
    });
    written.length = 0; // saved — these files are the post's now

    // ── Tidy up files: swap in the new cover, delete what's no longer used ──
    if (coverSwap) await rename(coverSwap.temp, coverSwap.final);
    const newUrls = new Set(postImageUrls(coverUrl, body));
    const unused = oldUrls.filter((u) => !newUrls.has(u)).map(imageFile).filter((f): f is string => !!f);
    await removeFiles(unused);

    return NextResponse.json({ slug, url: `/kitty/blog/${slug}/`, coverImage: coverUrl, body, tags });
  } catch (err) {
    await removeFiles(written);
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("PUT /api/rnd/blog/[slug]", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

/** DELETE /api/rnd/blog/[slug] — remove the post, its tag links (and tags
    nothing else uses), then its image files. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  try {
    const row = await loadRow(slug);
    if (!row) return missing(slug);
    await withTransaction(async (client) => {
      await client.query("DELETE FROM tbl_blog WHERE id = $1", [row.id]);
      await dropUnusedTags(client);
    });
    const files = postImageUrls(row.cover_image, row.body).map(imageFile).filter((f): f is string => !!f);
    await removeFiles(files);
    return NextResponse.json({ slug, deleted: true });
  } catch (err) {
    console.error("DELETE /api/rnd/blog/[slug]", err);
    return NextResponse.json({ error: "ลบบทความไม่สำเร็จ" }, { status: 500 });
  }
}
