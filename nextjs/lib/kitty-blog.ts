import { pool } from "@/lib/db";
import { blogPosts, sortPosts } from "@/app/(main)/(landing)/kitty/blog/content";
import type { BlogPost, PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

/**
 * Keppy Blog posts come from two places:
 *   "file" — written in kitty/blog/content.ts; publish / hide is stored in
 *            tbl_kitty_blog_visibility (no row = published).
 *   "db"   — saved from the editor (POST /api/rnd/blog) into tbl_blog,
 *            with its own published column.
 * Everything that lists or shows posts goes through here, so both kinds
 * look and behave the same.
 *
 * Fails soft: if a table can't be read (e.g. a migration not applied yet)
 * the file posts are still shown, all published, rather than the blog
 * going down.
 */

export type ManagedPost = { post: BlogPost; published: boolean; source: "file" | "db" };

async function hiddenFileSlugs(): Promise<Set<string>> {
  try {
    const result = await pool.query<{ slug: string }>(
      "SELECT slug FROM tbl_kitty_blog_visibility WHERE published = FALSE"
    );
    return new Set(result.rows.map((r) => r.slug));
  } catch (err) {
    console.error("kitty-blog: reading tbl_kitty_blog_visibility failed — file posts shown", err);
    return new Set();
  }
}

type BlogRow = {
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

/** Tag names per tbl_blog id. Empty if the tag tables can't be read
    (posts then just rank without tags). */
async function tagsByBlogId(): Promise<Map<number, string[]>> {
  try {
    const result = await pool.query<{ blog_id: number; tags: string[] }>(
      `SELECT m.blog_id, array_agg(t.name ORDER BY m.position, t.name) AS tags
       FROM tbl_blog_tag_map m JOIN tbl_blog_tag t ON t.id = m.tag_id
       GROUP BY m.blog_id`
    );
    return new Map(result.rows.map((r) => [r.blog_id, r.tags]));
  } catch (err) {
    console.error("kitty-blog: reading blog tags failed — related posts ignore tags", err);
    return new Map();
  }
}

async function dbPosts(): Promise<ManagedPost[]> {
  try {
    const result = await pool.query<BlogRow>(
      `SELECT id, slug, title, category, to_char(published_date, 'YYYY-MM-DD') AS date,
              author, cover_image, body, published
       FROM tbl_blog`
    );
    const tags = await tagsByBlogId();
    return result.rows.map((r) => ({
      post: {
        slug: r.slug,
        title: r.title,
        category: r.category,
        date: r.date,
        author: r.author ?? undefined,
        image: r.cover_image,
        body: r.body,
        tags: tags.get(r.id) ?? [],
      },
      published: r.published,
      source: "db",
    }));
  } catch (err) {
    console.error("kitty-blog: reading tbl_blog failed — editor posts not shown", err);
    return [];
  }
}

/** Every post, published or not, newest first — for /rnd/kitty-content. */
export async function getAllBlogPosts(): Promise<ManagedPost[]> {
  const [hidden, fromDb] = await Promise.all([hiddenFileSlugs(), dbPosts()]);
  const fromFile: ManagedPost[] = blogPosts.map((post) => ({
    post,
    published: !hidden.has(post.slug),
    source: "file",
  }));
  // A slug is unique across both (POST /api/rnd/blog refuses a file slug);
  // if one ever slips through, the file post wins.
  const fileSlugs = new Set(blogPosts.map((p) => p.slug));
  const all = [...fromFile, ...fromDb.filter((m) => !fileSlugs.has(m.post.slug))];
  const order = sortPosts(all.map((m) => m.post));
  return order.map((post) => all.find((m) => m.post === post)!);
}

/** Published posts only, newest first — for the public pages. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  return (await getAllBlogPosts()).filter((m) => m.published).map((m) => m.post);
}
