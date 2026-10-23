import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Library,
  Newspaper,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getPublishedPosts } from "@/lib/kitty-blog";
import Reveal from "../about-project/Reveal";
import { categoryOf, formatThaiDate } from "./blog/content";
import type { BlogPost } from "./blog/content";

export const metadata: Metadata = {
  title: "Knowledge Center | KeptCarbon",
  description:
    "KITTY — ศูนย์รวมความรู้เกี่ยวกับคาร์บอนเคดิต และเรียนรู้การใช้งานระบบ KeptCarbon ได้อย่างมั่นใจ",
};

/* ── Sections ────────────────────────────────────────────────────────────
   The three KITTY pages; hrefs match the KITTY dropdown in Header.tsx. */
type KittySection = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Icon tile colour (kc token). */
  tone: string;
  image: string;
};

const sections: KittySection[] = [
  {
    title: "Keppy Blog",
    description:
      "บทความและข่าวสารจาก KeptCarbon อัปเดตความรู้ และกิจกรรมต่าง ๆ",
    href: "/kitty/blog",
    icon: Newspaper,
    tone: "var(--kc-green)",
    image: "/assets/img/kitty/keppy_blog.png",
  },
  {
    title: "KeptCarbon Handbook",
    description: "คู่มือการใช้งานระบบแบบทีละขั้นตอน พร้อมภาพประกอบ",
    href: "/kitty/handbook",
    icon: BookOpen,
    tone: "var(--kc-green-dark)",
    image: "/assets/img/kitty/keptcarbon_handbook.png",
  },
  {
    title: "KeptCarbon Textbook",
    description: "หนังสือความรู้ออนไลน์ พร้อมสารบัญแบ่งเป็นบท ๆ อ่านง่าย",
    href: "/kitty/textbook",
    icon: Library,
    tone: "var(--kc-teal)",
    image: "/assets/img/kitty/keptcarbon_textbook.png",
  },
];

/* ── Content ─────────────────────────────────────────────────────────────
   Latest posts come from the blog's content.ts. The recommended topics
   are still empty — each block shows an empty state until filled. */
type Topic = { label: string; href: string };

/* Rendered per request so the latest posts follow the blog's publish /
   hide switch at once. */
export const dynamic = "force-dynamic";
const handbookTopics: Topic[] = [];
const textbookTopics: Topic[] = [];

/* ── Pieces ──────────────────────────────────────────────────────────── */
function SectionCard({ title, description, href, icon: Icon, tone, image }: KittySection) {
  return (
    <Link
      href={href}
      className="group relative flex h-full min-h-[200px] overflow-hidden rounded-2xl border border-border bg-card no-underline shadow-[var(--kc-shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--kc-shadow-lift)]"
    >
      <div className="relative z-10 flex w-[66%] flex-col p-6">
        <span
          className="mb-5 flex size-11 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: tone }}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-0 mb-2 text-lg font-bold text-foreground">{title}</h2>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <span className="mt-auto pt-6">
          <ArrowRight
            className="size-5 text-foreground transition-transform duration-300 group-hover:translate-x-1.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </span>
      </div>

      {/* Photo on the right, fading into the card */}
      <div className="absolute inset-y-0 right-0 w-[calc(36%+12px)]">
        <Image
          src={image}
          alt=""
          fill
          sizes="(min-width: 1024px) 160px, 40vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
      </div>
    </Link>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="m-0 text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary no-underline"
        >
          ดูทั้งหมด
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  const { slug, title, date, image } = post;
  const { label, color, ink } = categoryOf(post);
  return (
    <Link
      href={`/kitty/blog/${slug}/`}
      className="group flex h-full gap-4 rounded-xl border border-border bg-card p-2.5 no-underline transition-all duration-200 hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg">
        <Image src={image} alt="" fill sizes="112px" className="object-cover" />
      </div>
      <div className="flex min-w-0 flex-col py-1 pr-1">
        <span
          className="mb-2 self-start rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: color, color: ink }}
        >
          {label}
        </span>
        <h3 className="m-0 line-clamp-2 text-sm font-semibold leading-snug text-foreground wrap-anywhere group-hover:text-primary">
          {title}
        </h3>
        <span className="mt-auto pt-2 text-xs text-muted-foreground">{formatThaiDate(date)}</span>
      </div>
    </Link>
  );
}

function TopicList({ title, tone, topics }: { title: string; tone: string; topics: Topic[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <h3 className="mt-0 mb-3 flex items-center gap-2.5 text-base font-semibold text-foreground">
        <span className="h-4 w-1 rounded-full" style={{ backgroundColor: tone }} aria-hidden="true" />
        {title}
      </h3>
      {topics.length ? (
        <ul className="m-0 list-none p-0">
          {topics.map(({ label, href }) => (
            <li key={href} className="border-border not-last:border-b">
              <Link
                href={href}
                className="group flex items-center justify-between gap-3 py-3 text-sm text-foreground no-underline hover:text-primary"
              >
                {label}
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 py-6 text-center text-sm text-muted-foreground">เนื้อหากำลังจัดทำ</p>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default async function KittyPage() {
  const latestPosts = (await getPublishedPosts()).slice(0, 3);
  return (
    <div className="kc-tw bg-background">
      {/* ── Hero + section cards ────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-secondary/70 via-secondary/20 to-muted/60 px-4 pt-28 pb-14 sm:px-6 md:pt-36 md:pb-20 lg:px-8">
        {/* Plantation photo on the right, fading into the page */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] md:block"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 45%), linear-gradient(to bottom, black 60%, transparent)",
            maskComposite: "intersect",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 45%), linear-gradient(to bottom, black 60%, transparent)",
            WebkitMaskComposite: "source-in",
          }}
          aria-hidden="true"
        >
          <Image
            src="/assets/img/web-bg-3.webp"
            alt=""
            fill
            loading="eager"
            sizes="62vw"
            className="object-cover opacity-80"
          />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <Reveal className="max-w-xl">
            <span className="mb-3 inline-block text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              KITTY · KeptCarbon
            </span>
            <h1 className="m-0 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              Knowledge Center
            </h1>
            <p className="mt-4 mb-0 text-base leading-relaxed text-muted-foreground md:text-lg">
              ศูนย์รวมความรู้เกี่ยวกับคาร์บอนเคดิต และเรียนรู้การใช้งานระบบ 
              <br className="hidden sm:block" />
              KeptCarbon ได้อย่างมั่นใจ
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-4 md:mt-14 md:grid-cols-3 md:gap-6">
            {sections.map((s, i) => (
              <Reveal key={s.href} delay={i * 100}>
                <SectionCard {...s} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Latest posts ────────────────────────────────────────────── */}
      <section className="bg-muted/60 px-4 pt-12 pb-10 sm:px-6 md:pt-16 md:pb-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeader title="บทความล่าสุดจาก Keppy Blog" href="/kitty/blog" />
            {latestPosts.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                {latestPosts.map((p) => (
                  <PostCard key={p.slug} post={p} />
                ))}
              </div>
            ) : (
              <EmptyState>ยังไม่มีบทความ — ติดตามเร็ว ๆ นี้</EmptyState>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── Recommended topics ──────────────────────────────────────── */}
      <section className="border-b border-border bg-muted/60 px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeader title="หัวข้อแนะนำ" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <TopicList
                title="คู่มือยอดนิยม (Handbook)"
                tone="var(--kc-green-dark)"
                topics={handbookTopics}
              />
              <TopicList
                title="บทเรียนแนะนำ (Textbook)"
                tone="var(--kc-teal)"
                topics={textbookTopics}
              />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
