"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isBook } from "@/app/(main)/(landing)/kitty/book";
import type { Book, BookPage, OutlineSection } from "@/app/(main)/(landing)/kitty/book";

// Loads what the book editors need — the outline (GET /api/rnd/kitty-book/
// <book>) and, when editing, the page (GET …/pages/<slug>) — plus the
// spinner / error shown meanwhile.

type Loaded = { book: Book; outline: OutlineSection[]; page: BookPage | null };

async function getJson<T>(url: string, fallback: string): Promise<T> {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? fallback);
    return data as T;
}

export function useBookData(book: string, slug?: string) {
    const [data, setData] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isBook(book)) {
            setError("ไม่พบเนื้อหานี้");
            return;
        }
        let cancelled = false;
        Promise.all([
            getJson<{ sections: OutlineSection[] }>(`/api/rnd/kitty-book/${book}/`, "โหลดสารบัญไม่สำเร็จ"),
            slug ? getJson<BookPage>(`/api/rnd/kitty-book/${book}/pages/${encodeURIComponent(slug)}/`, "โหลดหน้าไม่สำเร็จ") : null,
        ])
            .then(([outline, page]) => { if (!cancelled) setData({ book, outline: outline.sections, page }); })
            .catch((err: Error) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [book, slug]);

    const placeholder = error ? (
        <div className="text-center py-5">
            <div className="mb-3" style={{ color: "#c53030" }}>
                <i className="bi bi-exclamation-circle me-1" />{error}
            </div>
            <Link href={`/rnd/kitty-content/${isBook(book) ? `?tab=${book}` : ""}`} style={{ color: "#1e7a47", fontWeight: 600, fontSize: 14 }}>
                กลับไปหน้าจัดการ KITTY Content
            </Link>
        </div>
    ) : !data ? (
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
            <div className="spinner-border text-success" role="status" />
        </div>
    ) : null;

    return { data, placeholder };
}

/** Shown instead of the page editor while the book has no sections. */
export function NoSections({ book }: { book: Book }) {
    return (
        <div className="text-center py-5" style={{ color: "#5a7a65" }}>
            <div className="mb-3">ยังไม่มีหมวด / บท — สร้างที่ &ldquo;จัดการสารบัญ&rdquo; ก่อน แล้วจึงสร้างหน้า</div>
            <Link href={`/rnd/kitty-content/book/${book}/outline/`} style={{ color: "#1e7a47", fontWeight: 600, fontSize: 14 }}>
                ไปที่จัดการสารบัญ
            </Link>
        </div>
    );
}
