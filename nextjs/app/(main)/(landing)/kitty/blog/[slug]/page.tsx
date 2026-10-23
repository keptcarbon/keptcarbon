import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPublishedPosts } from "@/lib/kitty-blog";
import {
  categoryOf,
  formatThaiDate,
  readingMinutes,
  relatedPosts,
} from "../content";
import PostBlockView from "../PostBlockView";
import ShareButtons from "./ShareButtons";
import TagList from "../TagList";

type Props = { params: Promise<{ slug: string }> };

/* Rendered per request so a publish / hide switch shows up at once. Only
   published posts in content.ts exist — anything else is a 404. */
export const dynamic = "force-dynamic";

/** The published post with this slug (from content.ts or tbl_blog), plus
    every published post for the related list. */
async function findVisiblePost(slug: string) {
  const posts = await getPublishedPosts();
  const post = posts.find((p) => p.slug === slug);
  return post ? { post, posts } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findVisiblePost((await params).slug);
  if (!found) return {};
  const { post } = found;
  return {
    title: `${post.title} | Keppy Blog`,
    openGraph: { title: post.title, images: [post.image] },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const found = await findVisiblePost((await params).slug);
  if (!found) notFound();
  const { post, posts } = found;
  const { label, color, ink } = categoryOf(post);
  const related = relatedPosts(post, posts);

  return (
    <div className="kc-tw bg-muted/60 px-4 pt-24 pb-16 sm:px-6 md:pt-28 md:pb-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* ── Breadcrumb + back ── */}
        <nav aria-label="breadcrumb" className="mb-3">
          <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-xs text-muted-foreground md:text-sm">
            <li>
              <Link href="/kitty/" className="text-muted-foreground no-underline hover:text-primary">
                Knowledge Center
              </Link>
            </li>
            <li className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              <Link href="/kitty/blog/" className="text-muted-foreground no-underline hover:text-primary">
                Keppy Blog
              </Link>
            </li>
            <li aria-current="page" className="flex min-w-0 items-center gap-1.5 text-foreground">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{post.title}</span>
            </li>
          </ol>
        </nav>
        <Link
          href="/kitty/blog/"
          className="group mb-8 inline-flex items-center gap-1 text-sm font-medium text-primary no-underline"
        >
          <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          กลับไปหน้า Keppy Blog
        </Link>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
          {/* ── Article ── */}
          <article className="min-w-0">
            {/* Category badge, then the tags on the same row (wrapping if long) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: color, color: ink }}
              >
                {label}
              </span>
              <TagList tags={post.tags} linked />
            </div>
            <h1 className="mt-3 mb-5 text-2xl leading-snug font-bold tracking-tight text-foreground wrap-anywhere md:text-4xl">
              {post.title}
            </h1>

            {/* Author */}
            <div className="mb-6 flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
                <Image src="/assets/img/keptcarbon-logo.png" alt="" width={44} height={44} className="size-9 object-contain" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">{post.author ?? "ทีมงาน KeptCarbon"}</div>
                <div className="text-xs text-muted-foreground">
                  {formatThaiDate(post.date)} · อ่าน {readingMinutes(post)} นาที
                </div>
              </div>
            </div>

            <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl border border-border">
              <Image
                src={post.image}
                alt=""
                fill
                preload
                sizes="(min-width: 1024px) 800px, 100vw"
                className="object-cover"
              />
            </div>

            {post.body.length > 0 ? (
              post.body.map((block, i) => <PostBlockView key={i} block={block} />)
            ) : (
              <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                เนื้อหากำลังจัดทำ
              </p>
            )}

            <div className="mt-12 flex justify-center border-t border-border pt-8">
              <Link
                href="/kitty/blog/"
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:border-primary/30 hover:bg-secondary"
              >
                <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                กลับไปหน้า Keppy Blog
              </Link>
            </div>
          </article>

          {/* ── Related + share ── */}
          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mt-0 mb-4 text-base font-bold text-foreground">บทความที่เกี่ยวข้อง</h2>
              {related.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-4 p-0">
                  {related.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/kitty/blog/${p.slug}/`} className="group flex gap-3 no-underline">
                        <span className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg">
                          <Image src={p.image} alt="" fill sizes="80px" className="object-cover" />
                        </span>
                        <span className="flex min-w-0 flex-col py-0.5">
                          <span className="line-clamp-3 text-sm leading-snug font-medium text-foreground wrap-anywhere group-hover:text-primary">
                            {p.title}
                          </span>
                          <span className="mt-auto pt-1 text-xs text-muted-foreground">{formatThaiDate(p.date)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">ยังไม่มีบทความอื่น</p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mt-0 mb-4 text-base font-bold text-foreground">แชร์บทความนี้</h2>
              <ShareButtons />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
