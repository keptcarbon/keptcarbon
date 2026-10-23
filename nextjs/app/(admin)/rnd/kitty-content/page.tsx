"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/app/components";
import PublishSwitch from "./PublishSwitch";
import { blogCategories, categoryOf, formatThaiDate } from "@/app/(main)/(landing)/kitty/blog/content";
import { handbookGroups } from "@/app/(main)/(landing)/kitty/handbook/content";
import { textbookChapters } from "@/app/(main)/(landing)/kitty/textbook/content";

// KITTY content overview — one tab per section. Blog posts come from
// GET /api/rnd/blog (content.ts + tbl_blog), each with a publish / hide
// switch (PATCH /api/rnd/blog); editor posts can also be edited
// (blog/[slug]/edit) and deleted (DELETE /api/rnd/blog/<slug>).
// Handbook and textbook are read-only lists of their content.ts.

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

const MUTED = "#94a3b8";

type TabKey = "blog" | "handbook" | "textbook";

// GET /api/rnd/blog row. source: "file" = content.ts, "db" = tbl_blog.
type BlogRow = {
    slug: string;
    title: string;
    category: string;
    date: string;
    blocks: number;
    published: boolean;
    source: "file" | "db";
};
const handbookRows = handbookGroups.flatMap((group) =>
    group.articles.map((article, i) => ({ group: group.title, article, number: i + 1 }))
);
const textbookRows = textbookChapters.flatMap((chapter, c) =>
    chapter.lessons.map((lesson, l) => ({
        chapter: `บทที่ ${c + 1} ${chapter.title}`,
        downloads: chapter.downloads?.length ?? 0,
        lesson,
        number: `${c + 1}.${l + 1}`,
    }))
);

const TABS: { key: TabKey; label: string }[] = [
    { key: "blog", label: "Keppy Blog" },
    { key: "handbook", label: "KeptCarbon Handbook" },
    { key: "textbook", label: "KeptCarbon Textbook" },
];

// "เนื้อหากำลังจัดทำ" when a page has nothing to show yet.
function Count({ n, unit }: { n: number; unit: string }) {
    return n > 0
        ? <span style={{ color: "#5a7a65" }}>{n} {unit}</span>
        : <span style={{ color: MUTED }}>กำลังจัดทำ</span>;
}

function ViewButton({ href }: { href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={ACTION_STYLE}
        >
            <i className="bi bi-box-arrow-up-right me-1" />ดูหน้าเว็บ
        </a>
    );
}

const ACTION_STYLE: React.CSSProperties = {
    border: "1px solid #e6f0ea", borderRadius: 9, color: "#1a3d2b", background: "#fff",
    padding: "5px 11px", fontSize: "0.78rem", whiteSpace: "nowrap", width: "auto",
};

// "Are you sure?" before deleting a post — its images go with it.
function DeleteDialog({ title, busy, error, onCancel, onConfirm }: {
    title: string;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy, onCancel]);
    return (
        <div
            onClick={() => { if (!busy) onCancel(); }}
            style={{ position: "fixed", inset: 0, zIndex: 1050, background: "rgba(26,61,43,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-post-title"
                onClick={(e) => e.stopPropagation()}
                style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            >
                <div className="d-flex align-items-center justify-content-center mb-3" style={{ width: 44, height: 44, borderRadius: 12, background: "#fdecec", color: "#c53030", fontSize: 20 }}>
                    <i className="bi bi-trash" />
                </div>
                <h2 id="delete-post-title" className="fw-bold mb-2" style={{ fontSize: 18, color: "#1a3d2b" }}>ลบบทความนี้?</h2>
                <p className="mb-3" style={{ fontSize: 14, color: "#5a7a65" }}>
                    &ldquo;{title}&rdquo; และรูปภาพทั้งหมดของบทความจะถูกลบถาวร ย้อนกลับไม่ได้
                </p>
                {error && (
                    <div className="mb-3" style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />{error}
                    </div>
                )}
                <div className="d-flex justify-content-end gap-2">
                    <button type="button" onClick={onCancel} disabled={busy} className="btn" style={{ ...ACTION_STYLE, padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600 }}>
                        ยกเลิก
                    </button>
                    <button type="button" onClick={onConfirm} disabled={busy} autoFocus className="btn" style={{ ...ACTION_STYLE, padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, background: "#c53030", borderColor: "#c53030", color: "#fff" }}>
                        {busy ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังลบ…</> : "ลบบทความ"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Table({ headers, colSpan, empty, children }: {
    headers: string[];
    colSpan: number;
    empty: string | null;
    children: React.ReactNode;
}) {
    return (
        <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, overflow: "hidden" }}>
            <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 13, minWidth: 760 }}>
                    <thead style={{ background: "#f8fbf9" }}>
                        <tr>
                            {headers.map((h, idx) => (
                                <th key={h} className={idx === 0 ? "px-4 py-3" : "py-3"} style={TH_STYLE}>{h}</th>
                            ))}
                            <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {children}
                        {empty && (
                            <tr>
                                <td colSpan={colSpan} className="text-center py-5" style={{ color: "#5a7a65" }}>{empty}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function KittyContentPage() {
    const [activeTab, setActiveTab] = useState<TabKey>("blog");
    const [search, setSearch] = useState("");
    const [blogCategory, setBlogCategory] = useState("");

    // ── Blog posts + publish / hide (GET / PATCH /api/rnd/blog). ──
    const [posts, setPosts] = useState<BlogRow[]>([]);
    const [visibilityLoading, setVisibilityLoading] = useState(true);
    const [visibilityError, setVisibilityError] = useState<string | null>(null);
    const [savingSlug, setSavingSlug] = useState<string | null>(null);
    // Success banner: a post just created / edited (?created= / ?updated=
    // from the editor) or deleted here.
    const [notice, setNotice] = useState<string | null>(null);
    // Post waiting on the delete dialog.
    const [deleting, setDeleting] = useState<BlogRow | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const created = params.get("created");
        const updated = params.get("updated");
        if (!created && !updated) return;
        setNotice(created ? `บันทึกบทความ ${created} เรียบร้อยแล้ว` : `บันทึกการแก้ไขบทความ ${updated} เรียบร้อยแล้ว`);
        window.history.replaceState(null, "", window.location.pathname);
    }, []);

    async function confirmDelete() {
        if (!deleting) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/rnd/blog/${encodeURIComponent(deleting.slug)}/`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "ลบบทความไม่สำเร็จ");
            setPosts((prev) => prev.filter((p) => p.slug !== deleting.slug));
            setNotice(`ลบบทความ ${deleting.slug} แล้ว`);
            setDeleting(null);
        } catch (err) {
            setDeleteError((err as Error).message);
        } finally {
            setDeleteBusy(false);
        }
    }

    useEffect(() => {
        let cancelled = false;
        fetch("/api/rnd/blog/")
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "โหลดรายการบทความไม่สำเร็จ");
                if (!cancelled) setPosts(data.posts as BlogRow[]);
            })
            .catch((err: Error) => { if (!cancelled) setVisibilityError(err.message); })
            .finally(() => { if (!cancelled) setVisibilityLoading(false); });
        return () => { cancelled = true; };
    }, []);

    async function setPublished(slug: string, published: boolean) {
        setSavingSlug(slug);
        setVisibilityError(null);
        try {
            const res = await fetch("/api/rnd/blog/", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug, published }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "บันทึกสถานะไม่สำเร็จ");
            setPosts((prev) => prev.map((p) => (p.slug === slug ? { ...p, published } : p)));
        } catch (err) {
            setVisibilityError((err as Error).message);
        } finally {
            setSavingSlug(null);
        }
    }

    const q = search.trim().toLowerCase();
    const has = (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q));

    const shownPosts = posts.filter(
        (p) => (!blogCategory || p.category === blogCategory) && has(p.title, p.slug)
    );
    const shownHandbook = handbookRows.filter((r) => has(r.group, r.article.title, r.article.slug));
    const shownTextbook = textbookRows.filter((r) => has(r.chapter, r.lesson.title, r.lesson.slug, r.number));

    const emptyText = (total: number, shown: number, none: string) =>
        shown > 0 ? null : total === 0 ? none : "ไม่พบรายการที่ตรงกับเงื่อนไข";

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>
                        จัดการ KITTY Content
                    </h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        เนื้อหาใน Knowledge Center — Keppy Blog, KeptCarbon Handbook และ KeptCarbon Textbook
                    </div>
                </div>
            </Card>

            {notice && (
                <div role="status" className="d-flex align-items-center gap-2 mb-3 px-3 py-2" style={{ background: "#edfaf3", border: "1px solid #cfe9db", borderRadius: 12, color: "#1e7a47", fontSize: 13.5 }}>
                    <i className="bi bi-check-circle-fill" />
                    <span>{notice}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="ปิด" className="ms-auto" style={{ border: "none", background: "transparent", color: "#1e7a47", width: "auto", padding: 0 }}>
                        <i className="bi bi-x-lg" />
                    </button>
                </div>
            )}

            {/* ── Tabs ── */}
            <div className="d-flex align-items-center gap-1 mb-4 overflow-auto" style={{ borderBottom: "1px solid #e6f0ea" }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => { setActiveTab(tab.key); setSearch(""); }}
                        className="btn"
                        style={{
                            border: "none", background: "transparent", borderRadius: 0,
                            padding: "10px 18px", fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", width: "auto",
                            color: activeTab === tab.key ? "#1e7a47" : "#5a7a65",
                            borderBottom: activeTab === tab.key ? "2px solid #1e7a47" : "2px solid transparent",
                            marginBottom: -1,
                        }}
                    >
                        {tab.label}
                        <span
                            className="ms-2"
                            style={{
                                fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                                background: activeTab === tab.key ? "#edfaf3" : "#f1f5f9",
                                color: activeTab === tab.key ? "#1e7a47" : "#5a7a65",
                            }}
                        >
                            {tab.key === "blog" ? (visibilityLoading ? "…" : posts.length)
                                : tab.key === "handbook" ? handbookRows.length : textbookRows.length}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── Toolbar: (category) · search · (สร้าง blog) ── */}
            <div className="d-flex flex-nowrap align-items-center gap-2 mb-3">
                {activeTab === "blog" && (
                    <select
                        value={blogCategory}
                        onChange={(e) => setBlogCategory(e.target.value)}
                        className="form-select"
                        style={{ width: "auto", flexShrink: 0, borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 13, color: "#1a3d2b" }}
                    >
                        <option value="">ทุกหมวดหมู่</option>
                        {blogCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                )}
                <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0, maxWidth: 340 }}>
                    <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: MUTED, fontSize: 14 }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={activeTab === "blog" ? "ค้นหาชื่อบทความ…" : activeTab === "handbook" ? "ค้นหาหมวดหรือบทความ…" : "ค้นหาบทหรือบทเรียน…"}
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px 10px 38px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                    />
                </div>
                {activeTab === "blog" && (
                    <Link
                        href="/rnd/kitty-content/blog/new/"
                        className="btn ms-auto"
                        style={{
                            background: "#1e7a47", color: "#fff", border: "none",
                            borderRadius: 10, padding: "9px 12px", fontWeight: 600, fontSize: "0.85rem",
                            display: "flex", alignItems: "center", gap: 6,
                            width: "auto", flexShrink: 0, whiteSpace: "nowrap",
                        }}
                    >
                        <i className="bi bi-plus-lg" />
                        สร้าง blog
                    </Link>
                )}
            </div>

            {/* ── Keppy Blog ── */}
            {activeTab === "blog" && visibilityError && (
                <div className="mb-3" style={{ color: "#c53030", fontSize: 13 }}>
                    <i className="bi bi-exclamation-circle me-1" />{visibilityError}
                </div>
            )}
            {activeTab === "blog" && (
                <Table
                    headers={["บทความ", "หมวดหมู่", "วันที่เผยแพร่", "เนื้อหา", "สถานะ"]}
                    colSpan={6}
                    empty={visibilityLoading ? "กำลังโหลด…" : emptyText(posts.length, shownPosts.length, "ยังไม่มีบทความ")}
                >
                    {shownPosts.map((p) => {
                        const { label, color, ink } = categoryOf(p);
                        return (
                            <tr key={p.slug}>
                                <td className="px-4 py-3" style={{ maxWidth: 380 }}>
                                    <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{p.title}</div>
                                    <div style={{ fontSize: 12, color: MUTED }}>
                                        {p.slug}
                                        {p.source === "file" && <span title="เขียนไว้ในโค้ด (content.ts) — แก้ไขผ่านหน้านี้ไม่ได้"> · ไฟล์ระบบ</span>}
                                    </div>
                                </td>
                                <td className="py-3">
                                    <span style={{ background: color, color: ink, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                                        {label}
                                    </span>
                                </td>
                                <td className="py-3" style={{ color: "#5a7a65", whiteSpace: "nowrap" }}>{formatThaiDate(p.date)}</td>
                                <td className="py-3"><Count n={p.blocks} unit="ส่วน" /></td>
                                <td className="py-3">
                                    <PublishSwitch
                                        published={p.published}
                                        disabled={visibilityLoading || savingSlug !== null}
                                        onChange={(next) => setPublished(p.slug, next)}
                                    />
                                </td>
                                <td className="px-4 py-3 text-end">
                                    <div className="d-inline-flex align-items-center gap-1">
                                        {p.published
                                            ? <ViewButton href={`/kitty/blog/${p.slug}/`} />
                                            : <span className="me-1" style={{ fontSize: 12, color: MUTED }}>ซ่อนจากหน้าเว็บ</span>}
                                        {p.source === "db" && (
                                            <>
                                                <Link href={`/rnd/kitty-content/blog/${p.slug}/edit/`} className="btn btn-sm" style={ACTION_STYLE}>
                                                    <i className="bi bi-pencil me-1" />แก้ไข
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDeleteError(null); setDeleting(p); }}
                                                    className="btn btn-sm"
                                                    style={{ ...ACTION_STYLE, color: "#c53030" }}
                                                    aria-label={`ลบบทความ ${p.title}`}
                                                >
                                                    <i className="bi bi-trash me-1" />ลบ
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            )}

            {/* ── KeptCarbon Handbook ── */}
            {activeTab === "handbook" && (
                <Table
                    headers={["หมวด", "บทความ", "ขั้นตอน"]}
                    colSpan={4}
                    empty={emptyText(handbookRows.length, shownHandbook.length, "ยังไม่มีบทความในคู่มือ")}
                >
                    {shownHandbook.map(({ group, article, number }) => (
                        <tr key={article.slug}>
                            <td className="px-4 py-3" style={{ color: "#5a7a65" }}>{group}</td>
                            <td className="py-3">
                                <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{number}. {article.title}</div>
                                <div style={{ fontSize: 12, color: MUTED }}>{article.slug}</div>
                            </td>
                            <td className="py-3"><Count n={article.steps.length} unit="ขั้นตอน" /></td>
                            <td className="px-4 py-3 text-end"><ViewButton href={`/kitty/handbook/${article.slug}/`} /></td>
                        </tr>
                    ))}
                </Table>
            )}

            {/* ── KeptCarbon Textbook ── */}
            {activeTab === "textbook" && (
                <Table
                    headers={["บท", "บทเรียน", "เนื้อหา", "เกร็ดความรู้", "เอกสารประกอบ"]}
                    colSpan={6}
                    empty={emptyText(textbookRows.length, shownTextbook.length, "ยังไม่มีบทเรียน")}
                >
                    {shownTextbook.map(({ chapter, downloads, lesson, number }) => (
                        <tr key={lesson.slug}>
                            <td className="px-4 py-3" style={{ color: "#5a7a65", maxWidth: 240 }}>{chapter}</td>
                            <td className="py-3">
                                <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{number} {lesson.title}</div>
                                <div style={{ fontSize: 12, color: MUTED }}>{lesson.slug}</div>
                            </td>
                            <td className="py-3"><Count n={lesson.body.length} unit="ส่วน" /></td>
                            <td className="py-3" style={{ color: lesson.tip ? "#5a7a65" : MUTED }}>{lesson.tip ? "มี" : "ไม่มี"}</td>
                            <td className="py-3"><Count n={downloads} unit="ไฟล์" /></td>
                            <td className="px-4 py-3 text-end"><ViewButton href={`/kitty/textbook/${lesson.slug}/`} /></td>
                        </tr>
                    ))}
                </Table>
            )}
            {deleting && (
                <DeleteDialog
                    title={deleting.title}
                    busy={deleteBusy}
                    error={deleteError}
                    onCancel={() => setDeleting(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </>
    );
}
