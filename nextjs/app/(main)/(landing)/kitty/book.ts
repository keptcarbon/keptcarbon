import {
  BarChart3,
  BookOpen,
  CircleHelp,
  FileText,
  Leaf,
  Map as MapIcon,
  MapPinned,
  Rocket,
  Settings,
  ShieldCheck,
  Sprout,
  Trees,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PostBlock } from "./blog/content";

/* ── KeptCarbon Handbook + Textbook: shared shapes and lookups ──────────
   Both books are sections (handbook หมวด / textbook บท) → pages
   (articles / lessons), stored in tbl_kitty_section / tbl_kitty_page and
   written on /rnd/kitty-content; lib/kitty-book.ts reads them. A page body
   is the same block list as a blog post (PostBlock, PostBlockView).
   Numbering and prev/next follow the stored order. */

export type Book = "handbook" | "textbook";

export const BOOKS: Record<Book, { label: string; title: string; pageLabel: string; sectionLabel: string }> = {
  handbook: { label: "KeptCarbon Handbook", title: "คู่มือการใช้งานระบบ", pageLabel: "บทความ", sectionLabel: "หมวด" },
  textbook: { label: "KeptCarbon Textbook", title: "ตำราความรู้คาร์บอน", pageLabel: "บทเรียน", sectionLabel: "บท" },
};

export const isBook = (value: string): value is Book => value === "handbook" || value === "textbook";

/** One page in the outline (no body) — enough for the sidebar and prev/next. */
export type OutlinePage = { id: number; slug: string; title: string; published: boolean; blocks: number };

export type OutlineSection = { id: number; title: string; icon: string | null; pages: OutlinePage[] };

/** A page with its content. */
export type BookPage = {
  id: number;
  sectionId: number;
  slug: string;
  title: string;
  description: string | null;
  tip: string | null;
  body: PostBlock[];
  published: boolean;
};

export type PageLink = { slug: string; title: string; number: string };

/** Handbook articles count within their group ("2."); textbook lessons
    carry the chapter too ("1.2"). */
function pageNumber(book: Book, sectionIndex: number, pageIndex: number) {
  return book === "textbook" ? `${sectionIndex + 1}.${pageIndex + 1}` : `${pageIndex + 1}.`;
}

/** Every page in reading order, across sections. */
export function readingOrder(book: Book, outline: OutlineSection[]) {
  return outline.flatMap((section, s) =>
    section.pages.map((page, p) => ({ section, sectionNumber: s + 1, page, number: pageNumber(book, s, p) }))
  );
}

/** Where the page sits: its section, number, place in the whole book
    (1-based) and neighbours in reading order (across sections). */
export function locatePage(book: Book, outline: OutlineSection[], slug: string) {
  const flat = readingOrder(book, outline);
  const i = flat.findIndex(({ page }) => page.slug === slug);
  if (i === -1) return null;
  const toLink = (j: number): PageLink | null =>
    flat[j] ? { slug: flat[j].page.slug, title: flat[j].page.title, number: flat[j].number } : null;
  const { section } = flat[i];
  return {
    ...flat[i],
    position: i + 1,
    total: flat.length,
    sectionPosition: section.pages.findIndex((p) => p.slug === slug) + 1,
    prev: toLink(i - 1),
    next: toLink(i + 1),
  };
}

/* ── Handbook group icons ── stored by name in tbl_kitty_section.icon. */
export const SECTION_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  Rocket: { icon: Rocket, label: "เริ่มต้น" },
  Map: { icon: MapIcon, label: "แผนที่" },
  MapPinned: { icon: MapPinned, label: "แปลง" },
  BarChart3: { icon: BarChart3, label: "แดชบอร์ด" },
  UserCog: { icon: UserCog, label: "บัญชีผู้ใช้" },
  Users: { icon: Users, label: "ผู้ใช้งาน" },
  Settings: { icon: Settings, label: "ตั้งค่า" },
  ShieldCheck: { icon: ShieldCheck, label: "ความปลอดภัย" },
  Leaf: { icon: Leaf, label: "คาร์บอน" },
  Trees: { icon: Trees, label: "สวนยาง" },
  Sprout: { icon: Sprout, label: "การปลูก" },
  FileText: { icon: FileText, label: "เอกสาร" },
  BookOpen: { icon: BookOpen, label: "ความรู้" },
  CircleHelp: { icon: CircleHelp, label: "คำถาม" },
};

export const sectionIcon = (name: string | null): LucideIcon => (name && SECTION_ICONS[name]?.icon) || BookOpen;
