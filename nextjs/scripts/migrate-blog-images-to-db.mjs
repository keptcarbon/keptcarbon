// One-off: move Keppy Blog images saved as files (public/assets/img/blog,
// before migration 043) into tbl_blog_image, and point each post's
// cover_image / body image src at /api/blog-images/<id>/.
//
//   node scripts/migrate-blog-images-to-db.mjs            (from nextjs/, needs DATABASE_URL)
//   docker compose exec nextjs node scripts/migrate-blog-images-to-db.mjs
//
// Images are stored as they are (no resizing — this only needs `pg`, so it
// also runs in the production image). One transaction per post; posts with
// no /assets/img/blog/ URLs are skipped, so it's safe to run again. Files
// are left on disk — delete the folder once the posts look right.
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const PREFIX = "/assets/img/blog/";
const PUBLIC_DIR = path.join(process.cwd(), "public");

function mimeOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: posts } = await pool.query("SELECT id, slug, cover_image, body FROM tbl_blog ORDER BY id");
let moved = 0;
let failed = 0;

for (const post of posts) {
  const urls = [post.cover_image, ...post.body.filter((b) => b.type === "image").map((b) => b.src)];
  if (!urls.some((u) => u.startsWith(PREFIX))) continue;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const newUrl = new Map();
    for (const url of new Set(urls.filter((u) => u.startsWith(PREFIX)))) {
      const name = url.slice(PREFIX.length);
      if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) throw new Error(`unexpected image name ${url}`);
      const bytes = await readFile(path.join(PUBLIC_DIR, "assets", "img", "blog", name));
      const mime = mimeOf(bytes);
      if (!mime) throw new Error(`${url} is not a JPG, PNG or WebP`);
      const { rows } = await client.query(
        `INSERT INTO tbl_blog_image (blog_id, mime_type, data, byte_size) VALUES ($1, $2, $3, $4) RETURNING id`,
        [post.id, mime, bytes, bytes.length]
      );
      newUrl.set(url, `/api/blog-images/${rows[0].id}/`);
    }
    const cover = newUrl.get(post.cover_image) ?? post.cover_image;
    const body = post.body.map((b) => (b.type === "image" && newUrl.has(b.src) ? { ...b, src: newUrl.get(b.src) } : b));
    await client.query("UPDATE tbl_blog SET cover_image = $2, body = $3 WHERE id = $1", [post.id, cover, JSON.stringify(body)]);
    await client.query("COMMIT");
    moved += newUrl.size;
    console.log(`✓ ${post.slug}: ${newUrl.size} image(s) moved`);
  } catch (err) {
    await client.query("ROLLBACK");
    failed += 1;
    console.error(`✗ ${post.slug}: ${err.message} — post left unchanged`);
  } finally {
    client.release();
  }
}

console.log(`done: ${moved} image(s) moved${failed ? `, ${failed} post(s) failed` : ""}`);
await pool.end();
process.exitCode = failed ? 1 : 0;
