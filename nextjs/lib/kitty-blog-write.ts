import type { PoolClient } from "pg";
import sharp from "sharp";
import { badInlineLinks, blogCategories, linkHref } from "@/app/(main)/(landing)/kitty/blog/content";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import { normalizeTag, tagProblem } from "@/app/(main)/(landing)/kitty/blog/tags";

/**
 * Shared by POST /api/rnd/blog (create) and PUT /api/rnd/blog/[slug]
 * (edit): reading the editor's multipart form, validating it, and
 * storing images and tags the same way for both.
 *
 * Images are stored in the database (tbl_blog_image), not as files: each
 * upload — JPG, PNG or WebP, judged by the file's bytes — is turned upright
 * (EXIF), shrunk to at most MAX_IMAGE_WIDTH wide and saved as WebP, then
 * served from /api/blog-images/<id>/. A post's cover_image / body image src
 * hold those URLs.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1600;
const WEBP_QUALITY = 82;
const MAX_BODY_BLOCKS = 200;
const MAX_BODY_IMAGES = 99;
const MAX_LIST_ITEMS = 100;
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

/** An upload, ready to store: WebP bytes and their pixel size. */
export type UploadedImage = { data: Buffer; mime: "image/webp"; width: number; height: number };

export async function readImage(form: FormData, field: string, label: string): Promise<UploadedImage> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new BadRequest(`ไม่พบไฟล์${label}`);
  if (file.size > MAX_IMAGE_BYTES) throw new BadRequest(`${label} มีขนาดเกิน 5 MB`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!imageExtension(bytes)) throw new BadRequest(`${label} ต้องเป็นไฟล์ JPG, PNG หรือ WebP`);
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate() // honour the camera's EXIF orientation
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: "image/webp", width: info.width, height: info.height };
  } catch {
    throw new BadRequest(`${label} อ่านไม่ได้ — ไฟล์อาจเสียหรือใหญ่เกินไป`);
  }
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
 * uploaded image — before anything touches the database. Body: see
 * parseBodyBlocks.
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

  const blocks = await parseBodyBlocks(form, { existingImages: opts.existingImages, allowEmpty: false });

  const hasCover = form.get("cover") instanceof File;
  if (opts.requireCover && !hasCover) throw new BadRequest("ไม่พบไฟล์ภาพปก");
  const cover = hasCover ? await readImage(form, "cover", "ภาพปก") : null;

  return { title, category, date, author, published, tags, cover, blocks };
}

/** Text with valid inline links, or a BadRequest naming body block `n`. */
function checkedText(raw: unknown, n: number, what = "ข้อความ"): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) throw new BadRequest(`ส่วนที่ ${n}: ${what}ว่างอยู่`);
  const bad = badInlineLinks(t);
  if (bad.length) {
    throw new BadRequest(`ส่วนที่ ${n}: ลิงก์ในข้อความไม่ถูกต้อง (${bad[0]}) — ใช้ URL ที่ขึ้นต้นด้วย http:// หรือ https://`);
  }
  return t;
}

/**
 * The form's "body" field — a JSON array of blocks, in order — validated,
 * with every uploaded image read. Shared by blog posts and handbook /
 * textbook pages (lib/kitty-book-write.ts).
 *
 * Image blocks: {type: "image", file: "<form field>", alt, caption?} for a
 * new upload, or {type: "image", src, alt, caption?} to keep an image the
 * page already has (`existingImages`; editing only).
 */
export async function parseBodyBlocks(
  form: FormData,
  opts: { existingImages?: Set<string>; allowEmpty: boolean }
): Promise<PendingBlock[]> {
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(formText(form, "body") || "[]");
  } catch {
    throw new BadRequest("รูปแบบเนื้อหาไม่ถูกต้อง");
  }
  if (!Array.isArray(rawBody)) throw new BadRequest("รูปแบบเนื้อหาไม่ถูกต้อง");
  if (rawBody.length === 0 && !opts.allowEmpty) throw new BadRequest("กรุณาเพิ่มเนื้อหาอย่างน้อย 1 ส่วน");
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
    } else if (b?.type === "link") {
      const url = typeof b.url === "string" ? linkHref(b.url) : null;
      if (!url) throw new BadRequest(`ส่วนที่ ${n}: ลิงก์ต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://`);
      const label = typeof b.text === "string" ? b.text.trim() : "";
      if (label.length > 300) throw new BadRequest(`ส่วนที่ ${n}: ข้อความของลิงก์ยาวเกิน 300 ตัวอักษร`);
      blocks.push({ block: { type: "link", url, text: label || undefined } });
    } else if (b?.type === "list") {
      if (!Array.isArray(b.items) || b.items.length === 0) throw new BadRequest(`ส่วนที่ ${n}: รายการว่างอยู่`);
      if (b.items.length > MAX_LIST_ITEMS) throw new BadRequest(`ส่วนที่ ${n}: รายการมีได้ไม่เกิน ${MAX_LIST_ITEMS} ข้อ`);
      const items = b.items.map((item) => {
        if (typeof item === "string" && item.includes("\n")) throw new BadRequest(`ส่วนที่ ${n}: แต่ละข้อต้องอยู่ในบรรทัดเดียว`);
        return checkedText(item, n, "ข้อในรายการ");
      });
      blocks.push({ block: { type: "list", ordered: b.ordered === true, items } });
    } else if (b?.type === "heading") {
      if (b.level !== undefined && b.level !== 2 && b.level !== 3) throw new BadRequest(`ส่วนที่ ${n}: ระดับหัวข้อไม่ถูกต้อง`);
      const text = checkedText(b.text, n);
      // Level 2 is stored without `level`, like headings saved before levels.
      blocks.push({ block: b.level === 3 ? { type: "heading", text, level: 3 } : { type: "heading", text } });
    } else if (b?.type === "paragraph" || QUOTE_TYPES.includes(b?.type as string)) {
      blocks.push({ block: { type: b.type, text: checkedText(b.text, n) } as PostBlock });
    } else {
      throw new BadRequest(`ส่วนที่ ${n}: ชนิดเนื้อหาไม่ถูกต้อง`);
    }
  }
  if (imageCount > MAX_BODY_IMAGES) throw new BadRequest(`รูปภาพในเนื้อหามีได้ไม่เกิน ${MAX_BODY_IMAGES} รูป`);
  return blocks;
}

// ── Images (tbl_blog_image) ────────────────────────────────────────────

export const imageUrl = (id: number) => `/api/blog-images/${id}/`;

/** The tbl_blog_image id in one of our image URLs, or null. */
export function imageIdOf(url: string): number | null {
  const m = /^\/api\/blog-images\/(\d+)\/?$/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Every image URL a post uses: its cover and body images. */
export function postImageUrls(cover: string, body: PostBlock[]) {
  return [cover, ...body.flatMap((b) => (b.type === "image" ? [b.src] : []))];
}

/** Stores an image for a post; returns its URL. */
export async function insertImage(client: PoolClient, blogId: number, image: UploadedImage) {
  const result = await client.query<{ id: number }>(
    `INSERT INTO tbl_blog_image (blog_id, mime_type, data, width, height, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [blogId, image.mime, image.data, image.width, image.height, image.data.length]
  );
  return imageUrl(result.rows[0].id);
}

/** Stores the post's new uploads and returns its body with their URLs. */
export async function storeBodyImages(client: PoolClient, blogId: number, blocks: PendingBlock[]) {
  const body: PostBlock[] = [];
  for (const { block, image } of blocks) {
    body.push(image && block.type === "image" ? { ...block, src: await insertImage(client, blogId, image) } : block);
  }
  return body;
}

/** Deletes a post's images that `urls` (its cover + body) no longer use. */
export async function dropUnusedImages(client: PoolClient, blogId: number, urls: string[]) {
  const keep = urls.map(imageIdOf).filter((id): id is number => id !== null);
  await client.query("DELETE FROM tbl_blog_image WHERE blog_id = $1 AND NOT (id = ANY($2::int[]))", [blogId, keep]);
}

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
