/* ── Keppy Blog content ──────────────────────────────────────────────────
   Categories + posts written in code. Posts written in the editor on
   /rnd/kitty-content/blog/new are stored in tbl_blog instead;
   lib/kitty-blog.ts merges both for the blog list, each post's page, and
   the "บทความล่าสุด" block on /kitty.

   No posts yet — the pages show an empty state until they're written. */

/* ── Accent colours ── shared by category badges and quote boxes.
   `ink` is the badge text colour: white on dark accents, dark ink on the
   light ones (white on orange/yellow is hard to read). */
export const accents = {
  green: { color: "var(--kc-green-dark)", ink: "#ffffff" },
  blue: { color: "#3971ec", ink: "#ffffff" },
  amber: { color: "#f6a62e", ink: "var(--kc-ink)" },
  red: { color: "var(--kc-error)", ink: "#ffffff" },
  yellow: { color: "var(--kc-warning)", ink: "var(--kc-ink)" },
} as const;

export type AccentName = keyof typeof accents;

export type BlogCategory = {
  /** Key used by posts; never shown. */
  id: string;
  label: string;
  /** Badge colour. */
  accent: AccentName;
};

export const blogCategories: BlogCategory[] = [
  { id: "news", label: "ข่าวสาร", accent: "amber" },
  { id: "activity", label: "กิจกรรม", accent: "blue" },
  { id: "carbon", label: "ความรู้เรื่องคาร์บอน", accent: "green" },
];

export type PostBlock =
  | { type: "paragraph"; text: string }
  /** Section heading inside the post. */
  | { type: "heading"; text: string }
  /** Highlighted quote box — "quote" is green; the others are coloured
      like the badges (see `accents`). */
  | {
      type: "quote" | "quote-green" | "quote-blue" | "quote-amber" | "quote-red" | "quote-yellow";
      text: string;
    }
  /** Figure under /public, e.g. "/assets/img/kitty/blog/tree-planting-2.jpg". */
  | { type: "image"; src: string; alt: string; caption?: string };

export type BlogPost = {
  /** URL segment: /kitty/blog/<slug>. Must be unique. */
  slug: string;
  title: string;
  /** A blogCategories id. */
  category: string;
  /** ISO date, e.g. "2026-10-12" — shown as "12 ต.ค. 2569". */
  date: string;
  /** Defaults to "ทีมงาน KeptCarbon". */
  author?: string;
  /** Keywords for "บทความที่เกี่ยวข้อง" — posts sharing more tags rank higher. */
  tags?: string[];
  /** Cover image under /public, e.g. "/assets/img/kitty/blog/tree-planting.jpg". */
  image: string;
  body: PostBlock[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-carbon-credit",
    title: "คาร์บอนเครดิต คืออะไร? ทำไมถึงสำคัญ?",
    category: "carbon",               // news | activity | carbon | project
    date: "2026-10-08",
    image: "/assets/img/web-bg-2.webp",
    body: [
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) คือ ..." },
      { type: "heading", text: "ทำไมคาร์บอนเครดิตถึงสำคัญ?" },
      { type: "quote", text: "สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้..." },
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) zxcvzxcvzxcvzคือ ..." },
    ],
  },
  {
    slug: "public-requement-for-keptcarbon",
    title: "ประชุมชี้แจงข้อกำหนดสาธารณะสำหรับ KeptCarbon",
    category: "activity",               // news | activity | carbon | project
    date: "2026-08-12",
    image: "/assets/img/web-bg-3.webp",
    body: [
      { type: "heading", text: "ทำไมคาร์บอนเครดิตถึงสำคัญ?" },
      { type: "quote", text: "สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้..." },
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) zxcvzxcvzxcvzคือ ..." },
      { type: "heading", text: "ทำไมคาร์บอนเครดิตถึงสำคัญ?" },
      { type: "quote-yellow", text: "สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้..." },
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) zxcvzxcvzxcvzคือ ..." },
    ],
  },
  {
    slug: "keptcarbon-news",
    title: "ประชุมชี้แจงข้อกำหนดสาธารณะสำหรับ KeptCarbon",
    category: "news",               // news | activity | carbon | project
    date: "2026-08-12",
    image: "/assets/img/web-bg-3.webp",
    body: [
      { type: "heading", text: "ทำไมคาร์บอนเครดิตถึงสำคัญ?" },
      { type: "quote", text: "สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้..." },
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) zxcvzxcvzxcvzคือ ..." },
      { type: "heading", text: "ทำไมคาร์บอนเครดิตถึงสำคัญ?" },
      { type: "quote-amber", text: "สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้..." },
      { type: "paragraph", text: "คาร์บอนเครดิต (Carbon Credit) zxcvzxcvzxcvzคือ ..." },
    ],
  },
  { 
    slug:"demo-0",
    title:"DEMO ข่าว",
    category:"news",
    date:"2026-10-20",
    image:"/assets/img/web-bg-1.webp",
    body:[
      {type:"quote",text:"DEMO quote สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้"},
      {type:"quote-blue",text:"DEMO quote-blue สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้"},
      {type:"quote-amber",text:"DEMO quote-amber สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้"},
      {type:"quote-red",text:"DEMO quote-red สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้"},
      {type:"quote-yellow",text:"DEMO quote-yellow สวนยางพารา 1 ไร่ สามารถกักเก็บคาร์บอนได้"}]
    },
    {
      slug:"demo-1",
      title:"DEMO กิจกรรม",
      category:"activity",
      date:"2026-10-18",
      image:"/assets/img/web-bg-3.webp",
      body:[]
    },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */
const fallbackCategory: BlogCategory = { id: "", label: "บทความ", accent: "green" };

/** The post's category label + badge colours. */
export function categoryOf(post: Pick<BlogPost, "category">) {
  const category = blogCategories.find((c) => c.id === post.category) ?? fallbackCategory;
  return { label: category.label, ...accents[category.accent] };
}

/** "quote-blue" → the blue accent; plain "quote" → green. */
export function quoteAccent(type: string) {
  const name = type.replace(/^quote-?/, "") || "green";
  return accents[name as AccentName] ?? accents.green;
}

/** "2026-10-12" → "12 ต.ค. 2569" */
export function formatThaiDate(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** Does the search text match the post's title or one of its tags?
    Ignores case and a leading "#" (so "#ยางพารา" finds the tag). */
export function postMatches(post: BlogPost, query: string) {
  const q = query.trim().replace(/^#/, "").toLowerCase();
  if (!q) return true;
  return post.title.toLowerCase().includes(q) || (post.tags ?? []).some((t) => t.toLowerCase().includes(q));
}

/** Newest first. */
export function sortPosts(posts: BlogPost[]) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

/** "อ่าน N นาที" — Thai has no word spaces, so estimate from characters
    (~600 per minute), at least 1. */
export function readingMinutes(post: BlogPost) {
  const chars = post.body.reduce((n, b) => n + (b.type === "image" ? 0 : b.text.length), 0);
  return Math.max(1, Math.round(chars / 600));
}

/** Up to `limit` other posts from `posts` (the published ones), ranked by
    tags shared with `post` (ignoring case), then same category, then
    newest. */
export function relatedPosts(post: BlogPost, posts: BlogPost[], limit = 3) {
  const own = new Set((post.tags ?? []).map((t) => t.toLowerCase()));
  const shared = (p: BlogPost) => (p.tags ?? []).filter((t) => own.has(t.toLowerCase())).length;
  const sameCategory = (p: BlogPost) => (p.category === post.category ? 1 : 0);
  return sortPosts(posts)
    .filter((p) => p.slug !== post.slug)
    .map((p, newest) => ({ p, tags: shared(p), category: sameCategory(p), newest }))
    .sort((a, b) => b.tags - a.tags || b.category - a.category || a.newest - b.newest)
    .slice(0, limit)
    .map(({ p }) => p);
}

/** A post written in this file (not one saved from the editor — those are
    in tbl_blog; see lib/kitty-blog.ts for both). */
export function findPost(slug: string) {
  return blogPosts.find((p) => p.slug === slug) ?? null;
}
