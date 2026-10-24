/* ── Keppy Blog: types, categories, and display helpers ─────────────────
   Posts themselves live only in the database (tbl_blog), written on
   /rnd/kitty-content/blog/new; lib/kitty-blog.ts reads them for the blog
   list, each post's page, and the "บทความล่าสุด" block on /kitty. This file
   holds what both the pages and the editor share: the post shape, the
   categories and accent colours, and the formatting / link helpers. */

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
  /** Section heading inside the post — h2, or h3 for a sub-heading
      (no level = 2, as every heading saved before levels existed). */
  | { type: "heading"; text: string; level?: 2 | 3 }
  /** Numbered (1. 2. 3.) or bulleted list; each item may hold inline
      formatting and links like a paragraph. */
  | { type: "list"; ordered: boolean; items: string[] }
  /** Highlighted quote box — "quote" is green; the others are coloured
      like the badges (see `accents`). */
  | {
      type: "quote" | "quote-green" | "quote-blue" | "quote-amber" | "quote-red" | "quote-yellow";
      text: string;
    }
  /** Figure under /public, e.g. "/assets/img/kitty/blog/tree-planting-2.jpg". */
  | { type: "image"; src: string; alt: string; caption?: string }
  /** Link to another page, opened in a new tab; `text` defaults to the URL. */
  | { type: "link"; url: string; text?: string };

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

/** A link block's URL as a safe href: http(s) only ("www.x.com" gets
    https:// added), or null if it isn't one. Used by the editor and the API. */
export function linkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/* ── Formatting inside text ── paragraphs, headings, list items and quotes may contain
     [ข้อความ](https://…)   link, opened in a new tab
     **ตัวหนา**  *ตัวเอียง*  __ขีดเส้นใต้__
   and they nest (***หนาและเอียง***, **[ลิงก์ตัวหนา](https://…)**). The text
   stays plain in the database; parseInline only splits it for display.
   A marker counts only with a matching close on the same line, touching
   the text inside ("5 * 3" keeps its asterisks); a link only with an
   http(s) URL (linkHref) — anything else is shown exactly as typed. */
const INLINE_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const LINK_AT = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;

export type InlineNode =
  | string
  | { kind: "b" | "i" | "u"; children: InlineNode[] }
  | { kind: "link"; href: string; children: InlineNode[] };

/** Closing ** or __ for a pair opened just before `from`: the first one on
    the same line not followed by a third marker char ("***x***" closes at
    the end, leaving *x* inside for italic). */
function closeDouble(text: string, from: number, ch: string) {
  for (let j = from; j < text.length - 1; j++) {
    if (text[j] === "\n") return -1;
    if (text[j] === ch && text[j + 1] === ch && text[j + 2] !== ch) return j;
  }
  return -1;
}

/** Closing * for an italic opened just before `from`, skipping ** pairs. */
function closeSingle(text: string, from: number) {
  for (let j = from; j < text.length; j++) {
    if (text[j] === "\n") return -1;
    if (text[j] === "*") {
      if (text[j + 1] === "*") { j++; continue; }
      return j;
    }
  }
  return -1;
}

const okInner = (s: string) => s.length > 0 && !/^\s|\s$/.test(s);
const WORD_CHAR = /[A-Za-z0-9]/;

export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "[") {
      const m = LINK_AT.exec(text.slice(i));
      const href = m ? linkHref(m[2]) : null;
      if (m && href) {
        flush();
        out.push({ kind: "link", href, children: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    } else if ((c === "*" || c === "_") && text[i + 1] === c) {
      const j = closeDouble(text, i + 2, c);
      // __ only at word edges, so names like file__name stay as typed.
      const edgeOk = c === "*" || (!WORD_CHAR.test(text[i - 1] ?? "") && !WORD_CHAR.test(text[j + 2] ?? ""));
      if (j > 0 && edgeOk && okInner(text.slice(i + 2, j))) {
        flush();
        out.push({ kind: c === "*" ? "b" : "u", children: parseInline(text.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    } else if (c === "*") {
      const j = closeSingle(text, i + 1);
      if (j > 0 && okInner(text.slice(i + 1, j))) {
        flush();
        out.push({ kind: "i", children: parseInline(text.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    plain += c;
    i++;
  }
  flush();
  return out;
}

const flatten = (nodes: InlineNode[]): string =>
  nodes.map((n) => (typeof n === "string" ? n : flatten(n.children))).join("");

/** URLs of [..](..) links in the text that aren't valid http(s) links. */
export function badInlineLinks(text: string): string[] {
  return [...text.matchAll(INLINE_LINK)].map((m) => m[2]).filter((u) => !linkHref(u));
}

/** The text as readers see it — formatting and link syntax removed. */
export function plainText(text: string) {
  return flatten(parseInline(text));
}

/** Newest first. */
export function sortPosts(posts: BlogPost[]) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

/** "อ่าน N นาที" — Thai has no word spaces, so estimate from characters
    (~600 per minute), at least 1. */
export function readingMinutes(post: BlogPost) {
  const chars = post.body.reduce((n, b) => n + blockText(b).length, 0);
  return Math.max(1, Math.round(chars / 600));
}

/** The words a reader sees in a block (none for an image). */
export function blockText(b: PostBlock): string {
  switch (b.type) {
    case "image":
      return "";
    case "link":
      return b.text ?? "";
    case "list":
      return b.items.map(plainText).join("\n");
    default:
      return plainText(b.text);
  }
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

