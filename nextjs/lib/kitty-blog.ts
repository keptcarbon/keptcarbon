import { pool } from "@/lib/db";
import { sortPosts } from "@/app/(main)/(landing)/kitty/blog/content";
import type { BlogPost, PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";

/**
 * Keppy Blog posts — all stored in tbl_blog (written on
 * /rnd/kitty-content/blog/new), with tags from tbl_blog_tag(_map).
 * Everything that lists or shows posts reads them through here.
 *
 * Fails soft: if the tables can't be read the blog shows as empty (and the
 * error is logged) rather than the pages crashing.
 */

export type ManagedPost = { post: BlogPost; published: boolean };

/** Tag names per tbl_blog id, in the order the author entered them. Empty
    if the tag tables can't be read (posts then just rank without tags). */
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

/** Every post, published or not, newest first — for /rnd/kitty-content. */
export async function getAllBlogPosts(): Promise<ManagedPost[]> {
  try {
    const [result, tags] = await Promise.all([
      pool.query<BlogRow>(
        `SELECT id, slug, title, category, to_char(published_date, 'YYYY-MM-DD') AS date,
                author, cover_image, body, published
         FROM tbl_blog`
      ),
      tagsByBlogId(),
    ]);
    const all = result.rows.map((r) => ({
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
    }));
    const order = sortPosts(all.map((m) => m.post));
    return order.map((post) => all.find((m) => m.post === post)!);
  } catch (err) {
    console.error("kitty-blog: reading tbl_blog failed — blog shown empty", err);
    return [];
  }
}

/** Published posts only, newest first — for the public pages. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  return (await getAllBlogPosts()).filter((m) => m.published).map((m) => m.post);
}
