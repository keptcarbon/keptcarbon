import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import type { PoolClient } from "pg";
import { blogCategories } from "@/app/(main)/(landing)/kitty/blog/content";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import { normalizeTag, tagProblem } from "@/app/(main)/(landing)/kitty/blog/tags";

/**
 * Shared by POST /api/rnd/blog (create) and PUT /api/rnd/blog/[slug]
 * (edit): reading the editor's multipart form, validating it, and
 * storing images and tags the same way for both.
 *
 * Uploaded images live in public/ so they're served like any other asset:
 * /assets/img/blog/<slug>-cover.jpg, <slug>-blog-img-01.png, … Production
 * keeps this folder on a volume (docker-compose.yml) and serves files added
 * after the build through /api/blog-images (next.config.ts). Only JPG, PNG
 * and WebP are accepted, judged by the file's bytes.
 */

export const IMAGE_DIR = path.join(process.cwd(), "public", "assets", "img", "blog");
export const IMAGE_URL = "/assets/img/blog";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BLOCKS = 200;
const MAX_BODY_IMAGES = 99;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUOTE_TYPES = ["quote", "quote-green", "quote-blue", "quote-amber", "quote-red", "quote-yellow"];

export class BadRequest extends Error {}

/** jpg / png / webp by file signature (not the client's claimed type). */
function imageExtension(bytes: Buffer): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export type UploadedImage = { bytes: Buffer; ext: string };

async function readImage(form: FormData, field: string, label: string): Promise<UploadedImage> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new BadRequest(`ไม่พบไฟล์${label}`);
  if (file.size > MAX_IMAGE_BYTES) throw new BadRequest(`${label} มีขนาดเกิน 5 MB`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = imageExtension(bytes);
  if (!ext) throw new BadRequest(`${label} ต้องเป็นไฟล์ JPG, PNG หรือ WebP`);
  return { bytes, ext };
}

export const formText = (form: FormData, field: string) => {
  const v = form.get(field);
  return typeof v === "string" ? v.trim() : "";
};

/** A body block, with the new upload for an image block that has one
    (an image block without `image` keeps its existing src). */
export type PendingBlock = { block: PostBlock; image?: UploadedImage };

export type ParsedBlogForm = {
  title: string;
  category: string;
  date: string;
  author: string | null;
  published: boolean;
  tags: string[];
  /** New cover upload, or null = keep the current one (edit only). */
  cover: UploadedImage | null;
  blocks: PendingBlock[];
};

/**
 * Validates the editor form (everything except the slug) and reads every
 * uploaded image — before anything touches disk or the database.
 *
 * Body image blocks: {type: "image", file: "<form field>", alt, caption?}
 * for a new upload, or {type: "image", src, alt, caption?} to keep an image
 * the post already has (`existingImages`; editing only).
 */
export async function parseBlogForm(
  form: FormData,
  opts: { existingImages?: Set<string>; requireCover: boolean }
): Promise<ParsedBlogForm> {
  const title = formText(form, "title");
  const category = formText(form, "category");
  const date = formText(form, "date");
  const author = formText(form, "author") || null;
  const published = formText(form, "published") !== "false";

  if (!title || title.length > 300) throw new BadRequest("กรุณากรอกชื่อบทความ (ไม่เกิน 300 ตัวอักษร)");
  if (!blogCategories.some((c) => c.id === category)) throw new BadRequest("หมวดหมู่ไม่ถูกต้อง");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new BadRequest("วันที่เผยแพร่ไม่ถูกต้อง");
  }
  if (author && author.length > 200) throw new BadRequest("ชื่อผู้เขียนยาวเกิน 200 ตัวอักษร");

  // ── Tags ──
  let rawTags: unknown;
  try {
    rawTags = JSON.parse(formText(form, "tags") || "[]");
  } catch {
    throw new BadRequest("รูปแบบ Tag ไม่ถูกต้อง");
  }
  if (!Array.isArray(rawTags)) throw new BadRequest("รูปแบบ Tag ไม่ถูกต้อง");
  const tags: string[] = [];
  for (const raw of rawTags) {
    const tag = typeof raw === "string" ? normalizeTag(raw) : "";
    const problem = tagProblem(tag, tags);
    if (problem) throw new BadRequest(problem);
    tags.push(tag);
  }

  // ── Body blocks ──
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(formText(form, "body") || "[]");
  } catch {
    throw new BadRequest("รูปแบบเนื้อหาไม่ถูกต้อง");
  }
  if (!Array.isArray(rawBody) || rawBody.length === 0) throw new BadRequest("กรุณาเพิ่มเนื้อหาอย่างน้อย 1 ส่วน");
  if (rawBody.length > MAX_BODY_BLOCKS) throw new BadRequest(`เนื้อหามีได้ไม่เกิน ${MAX_BODY_BLOCKS} ส่วน`);

  const blocks: PendingBlock[] = [];
  let imageCount = 0;
  for (const [i, raw] of rawBody.entries()) {
    const b = raw as Record<string, unknown>;
    const n = i + 1;
    if (b?.type === "image") {
      const alt = typeof b.alt === "string" ? b.alt.trim() : "";
      if (!alt) throw new BadRequest(`ส่วนที่ ${n}: กรุณาใส่คำอธิบายรูป (alt)`);
      const caption = typeof b.caption === "string" && b.caption.trim() ? b.caption.trim() : undefined;
      imageCount += 1;
      if (typeof b.file === "string" && b.file) {
        const image = await readImage(form, b.file, `รูปภาพในส่วนที่ ${n}`);
        blocks.push({ block: { type: "image", src: "", alt, caption }, image });
      } else if (typeof b.src === "string" && opts.existingImages?.has(b.src)) {
        blocks.push({ block: { type: "image", src: b.src, alt, caption } });
      } else {
        throw new BadRequest(`ส่วนที่ ${n}: ไม่ได้ระบุไฟล์รูปภาพ`);
      }
    } else if (b?.type === "paragraph" || b?.type === "heading" || QUOTE_TYPES.includes(b?.type as string)) {
      const t = typeof b.text === "string" ? b.text.trim() : "";
      if (!t) throw new BadRequest(`ส่วนที่ ${n}: ข้อความว่างอยู่`);
      blocks.push({ block: { type: b.type, text: t } as PostBlock });
    } else {
      throw new BadRequest(`ส่วนที่ ${n}: ชนิดเนื้อหาไม่ถูกต้อง`);
    }
  }
  if (imageCount > MAX_BODY_IMAGES) throw new BadRequest(`รูปภาพในเนื้อหามีได้ไม่เกิน ${MAX_BODY_IMAGES} รูป`);

  const hasCover = form.get("cover") instanceof File;
  if (opts.requireCover && !hasCover) throw new BadRequest("ไม่พบไฟล์ภาพปก");
  const cover = hasCover ? await readImage(form, "cover", "ภาพปก") : null;

  return { title, category, date, author, published, tags, cover, blocks };
}

// ── Files ──────────────────────────────────────────────────────────────

/** The file on disk for one of our image URLs, or null for anything else. */
export function imageFile(url: string): string | null {
  if (!url.startsWith(`${IMAGE_URL}/`)) return null;
  const name = url.slice(IMAGE_URL.length + 1);
  return /^[a-z0-9-]+\.(jpg|png|webp)$/.test(name) ? path.join(IMAGE_DIR, name) : null;
}

/** Every image URL a post uses: its cover and body images. */
export function postImageUrls(cover: string, body: PostBlock[]) {
  return [cover, ...body.flatMap((b) => (b.type === "image" ? [b.src] : []))];
}

/** Writes `bytes` under a new name (never overwrites); returns the file path. */
export async function writeNewImage(name: string, bytes: Buffer) {
  await mkdir(IMAGE_DIR, { recursive: true });
  const file = path.join(IMAGE_DIR, name);
  await writeFile(file, bytes, { flag: "wx" });
  return file;
}

/** Writes a body image as <slug>-blog-img-NN.<ext>, taking the first free
    number from `from` (an existing name wins — never overwritten). */
export async function writeBodyImage(slug: string, image: UploadedImage, from: number) {
  for (let n = from; n <= MAX_BODY_IMAGES; n++) {
    const name = `${slug}-blog-img-${String(n).padStart(2, "0")}.${image.ext}`;
    try {
      return { file: await writeNewImage(name, image.bytes), url: `${IMAGE_URL}/${name}`, n };
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
    }
  }
  throw new BadRequest(`รูปภาพในเนื้อหามีได้ไม่เกิน ${MAX_BODY_IMAGES} รูป`);
}

/** Highest NN among a post's <slug>-blog-img-NN.* URLs (0 if none). */
export function lastBodyImageNumber(slug: string, urls: string[]) {
  const re = new RegExp(`^${IMAGE_URL}/${slug}-blog-img-(\\d{2})\\.`);
  return urls.reduce((max, u) => Math.max(max, Number(re.exec(u)?.[1] ?? 0)), 0);
}

export const removeFiles = (files: string[]) =>
  Promise.all(files.map((f) => unlink(f).catch(() => { /* already gone */ })));

// ── Tags ───────────────────────────────────────────────────────────────

/** Replaces a post's tag links with `tags` (in order), adding new tags to
    tbl_blog_tag; existing tags keep their original spelling. */
export async function saveTags(client: PoolClient, blogId: number, tags: string[], userId: number | null) {
  await client.query("DELETE FROM tbl_blog_tag_map WHERE blog_id = $1", [blogId]);
  if (!tags.length) return;
  await client.query(
    `INSERT INTO tbl_blog_tag (name, created_by)
     SELECT unnest($1::text[]), $2
     ON CONFLICT ((lower(name))) DO NOTHING`,
    [tags, userId]
  );
  // position = the order the author entered them in.
  await client.query(
    `INSERT INTO tbl_blog_tag_map (blog_id, tag_id, position)
     SELECT $1, t.id, i.ord - 1
     FROM unnest($2::text[]) WITH ORDINALITY AS i(name, ord)
     JOIN tbl_blog_tag t ON lower(t.name) = i.name
     ON CONFLICT DO NOTHING`,
    [blogId, tags.map((t) => t.toLowerCase())]
  );
}

/** Drops tags no post uses any more, so auto-complete only offers live ones. */
export async function dropUnusedTags(client: PoolClient) {
  await client.query(
    "DELETE FROM tbl_blog_tag t WHERE NOT EXISTS (SELECT 1 FROM tbl_blog_tag_map m WHERE m.tag_id = t.id)"
  );
}
