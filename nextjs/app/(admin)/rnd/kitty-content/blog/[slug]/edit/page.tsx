"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import BlogEditor from "../../BlogEditor";
import type { EditorPost } from "../../BlogEditor";

/* แก้ไข blog — loads the post (GET /api/rnd/blog/<slug>) into the editor. */
export default function EditBlogPostPage() {
    const { slug } = useParams<{ slug: string }>();
    const [post, setPost] = useState<EditorPost | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/rnd/blog/${encodeURIComponent(slug)}/`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "โหลดบทความไม่สำเร็จ");
                if (!cancelled) setPost(data as EditorPost);
            })
            .catch((err: Error) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [slug]);

    if (error) {
        return (
            <div className="text-center py-5">
                <div className="mb-3" style={{ color: "#c53030" }}>
                    <i className="bi bi-exclamation-circle me-1" />{error}
                </div>
                <Link href="/rnd/kitty-content/" style={{ color: "#1e7a47", fontWeight: 600, fontSize: 14 }}>
                    กลับไปหน้าจัดการ KITTY Content
                </Link>
            </div>
        );
    }
    if (!post) {
        return (
            <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }
    return <BlogEditor key={post.slug} initial={post} />;
}
