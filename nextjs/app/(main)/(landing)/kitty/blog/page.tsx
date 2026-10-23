import type { Metadata } from "next";
import { getPublishedPosts } from "@/lib/kitty-blog";
import BlogBrowser from "./BlogBrowser";

export const metadata: Metadata = {
  title: "Keppy Blog | KeptCarbon",
  description: "อัปเดตข่าวสาร บทความ และเรื่องราวจาก KeptCarbon",
};

/* Rendered per request so a publish / hide switch shows up at once. */
export const dynamic = "force-dynamic";

export default async function BlogPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [posts, { q }] = await Promise.all([getPublishedPosts(), searchParams]);
  return (
    <div className="kc-tw bg-muted/60 pt-16">
      <BlogBrowser posts={posts} initialQuery={typeof q === "string" ? q.slice(0, 100) : ""} />
    </div>
  );
}
