"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/app/components";
import { BookBody, TipBox } from "@/app/(main)/(landing)/kitty/BookParts";
import { BOOKS } from "@/app/(main)/(landing)/kitty/book";
import type { Book, BookPage, OutlineSection } from "@/app/(main)/(landing)/kitty/book";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import BlockListEditor, { appendBody, blockErrors, emptyDrafts, toDrafts, toPostBlock } from "../BlockListEditor";
import type { DraftBlock } from "../BlockListEditor";
import {
    ERROR_STYLE,
    FIELD_LABEL_STYLE,
    HERO_BG,
    HINT_STYLE,
    INPUT_STYLE,
    ModeTabs,
    PANEL_STYLE,
    PRIMARY_BUTTON_STYLE,
    Required,
    SECONDARY_BUTTON_STYLE,
    SLUG_PATTERN,
    useObjectUrls,
} from "../editor-ui";
import PublishSwitch from "../PublishSwitch";

// The handbook article / textbook lesson editor — สร้าง (book/<book>/new)
// and แก้ไข (book/<book>/<slug>/edit). Saves through
// POST /api/rnd/kitty-book/<book>/pages or PUT …/pages/<slug>
// (tbl_kitty_page + tbl_kitty_page_image). The body is the same block
// editor as the blog; a page may be saved with no body yet (it then shows
// "เนื้อหากำลังจัดทำ"). A new page goes at the end of its section — the
// order is changed on book/<book>/outline. The URL (slug) is fixed once a
// page exists.

export default function BookPageEditor({ book, outline, initial }: {
    book: Book;
    /** The book's sections (hidden pages included) — for the section picker and numbering. */
    outline: OutlineSection[];
    /** The saved page when editing; omitted for a new page. */
    initial?: BookPage;
}) {
    const editing = !!initial;
    const router = useRouter();
    const { label: bookLabel, pageLabel, sectionLabel } = BOOKS[book];
    const backHref = `/rnd/kitty-content/?tab=${book}`;
    const [mode, setMode] = useState<"edit" | "preview">("edit");

    const [sectionId, setSectionId] = useState<number>(initial?.sectionId ?? outline[0]?.id ?? 0);
    const [title, setTitle] = useState(initial?.title ?? "");
    const [slug, setSlug] = useState(initial?.slug ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [tip, setTip] = useState(initial?.tip ?? "");
    const [published, setPublished] = useState(initial?.published ?? true);
    const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
        initial ? toDrafts(initial.body) : emptyDrafts()
    );
    const { makeUrl, dropUrl } = useObjectUrls();

    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── Validation — an empty body is fine; unfinished blocks are not. ──
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = `กรุณากรอกชื่อ${pageLabel}`;
    if (!slug) errors.slug = `กรุณากำหนด URL ของ${pageLabel}`;
    else if (!SLUG_PATTERN.test(slug)) errors.slug = "ใช้ได้เฉพาะ a-z, 0-9 และขีด (-) เช่น draw-plot";
    if (!outline.some((s) => s.id === sectionId)) errors.section = `กรุณาเลือก${sectionLabel}`;
    // Untouched empty paragraphs are dropped on save, so "no content yet"
    // saves cleanly; any other unfinished block must be fixed.
    const filled = blocks.filter((b) => b.type !== "paragraph" || b.text.trim());
    const bodyErrors = blockErrors(filled);
    const hasErrors = Object.keys(errors).length > 0 || bodyErrors.size > 0;
    const show = (key: string) => attempted && errors[key] ? <div style={ERROR_STYLE}>{errors[key]}</div> : null;

    // Number the page would get: its place in the chosen section (the end
    // for a new page, or one moved into another section).
    const sectionIndex = outline.findIndex((s) => s.id === sectionId);
    const section = outline[sectionIndex];
    const placeInSection = section
        ? (section.pages.findIndex((p) => p.slug === initial?.slug) + 1 || section.pages.length + 1)
        : 1;
    const number = book === "textbook" ? `${sectionIndex + 1}.${placeInSection}` : `${placeInSection}.`;

    async function handleSave() {
        setAttempted(true);
        setSaveError(null);
        if (hasErrors) return;

        const form = new FormData();
        if (!editing) form.append("slug", slug);
        form.append("sectionId", String(sectionId));
        form.append("title", title.trim());
        form.append("description", description.trim());
        if (book === "textbook") form.append("tip", tip.trim());
        form.append("published", String(published));
        appendBody(form, filled);

        setSaving(true);
        try {
            const base = `/api/rnd/kitty-book/${book}/pages/`;
            const res = editing
                ? await fetch(`${base}${encodeURIComponent(slug)}/`, { method: "PUT", body: form })
                : await fetch(base, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `บันทึก${pageLabel}ไม่สำเร็จ`);
            router.push(`${backHref}&${editing ? "updated" : "created"}=${encodeURIComponent(slug)}`);
        } catch (err) {
            setSaveError((err as Error).message);
            setSaving(false);
        }
    }

    const previewBody = blocks.map(toPostBlock).filter((b): b is PostBlock => b !== null);

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <Link href={backHref} className="d-inline-flex align-items-center gap-1 mb-3 text-decoration-none" style={{ fontSize: 13, fontWeight: 600, color: "#1e7a47" }}>
                        <i className="bi bi-chevron-left" />จัดการ KITTY Content
                    </Link>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>
                        {editing ? `แก้ไข${pageLabel}` : `สร้าง${pageLabel}`} · {bookLabel}
                    </h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        {editing
                            ? <>แก้ไข <strong>{initial.title}</strong> — กด &ldquo;ตัวอย่าง&rdquo; เพื่อดูหน้าตาจริงก่อนบันทึก</>
                            : <>{pageLabel}ใหม่จะต่อท้าย{sectionLabel}ที่เลือก — เปลี่ยนลำดับได้ที่ &ldquo;จัดการสารบัญ&rdquo;</>}
                    </div>
                </div>
            </Card>

            <ModeTabs mode={mode} onChange={setMode} />

            {mode === "edit" ? (
                <div className="row g-4">
                    {/* ── Main: title + lead + body ── */}
                    <div className="col-lg-8">
                        <div style={PANEL_STYLE} className="mb-4">
                            <div style={FIELD_LABEL_STYLE}>ชื่อ{pageLabel} <Required /></div>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={book === "handbook" ? "เช่น วาดแปลง" : "เช่น วัฏจักรคาร์บอน"}
                                style={{ ...INPUT_STYLE, fontSize: 18, fontWeight: 600, padding: "12px 14px" }}
                            />
                            {show("title")}
                            <div className="mt-3" style={FIELD_LABEL_STYLE}>{book === "handbook" ? "คำอธิบายสั้น ๆ ใต้ชื่อ" : "บทนำ"}</div>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                placeholder={book === "handbook" ? "เช่น วิธีวาดขอบเขตแปลงบนแผนที่ในระบบ KeptCarbon" : "ไม่บังคับ — ย่อหน้านำใต้ชื่อบทเรียน"}
                                style={{ ...INPUT_STYLE, resize: "vertical" }}
                            />
                        </div>

                        <BlockListEditor
                            blocks={blocks}
                            onChange={setBlocks}
                            attempted={attempted}
                            errors={bodyErrors}
                            makeUrl={makeUrl}
                            dropUrl={dropUrl}
                            footer={
                                <div style={HINT_STYLE}>
                                    <i className="bi bi-info-circle me-1" />
                                    {book === "handbook"
                                        ? <>ขั้นตอนการใช้งานใช้ &ldquo;รายการ&rdquo; แบบ 1. 2. 3. · ยังไม่มีเนื้อหาก็บันทึกได้ — หน้าเว็บจะแสดง &ldquo;เนื้อหากำลังจัดทำ&rdquo;</>
                                        : <>ยังไม่มีเนื้อหาก็บันทึกได้ — หน้าเว็บจะแสดง &ldquo;เนื้อหากำลังจัดทำ&rdquo;</>}
                                </div>
                            }
                        />
                    </div>

                    {/* ── Side: settings — left on desktop, after the body on mobile ── */}
                    <div className="col-lg-4 order-lg-first">
                        <div style={PANEL_STYLE} className="mb-4">
                            <div className="fw-bold mb-3" style={{ color: "#1a3d2b", fontSize: 15 }}>ตั้งค่า{pageLabel}</div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>สถานะ</div>
                                <PublishSwitch published={published} disabled={false} onChange={setPublished} />
                            </div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>{sectionLabel} <Required /></div>
                                <select value={sectionId} onChange={(e) => setSectionId(Number(e.target.value))} className="form-select" style={INPUT_STYLE}>
                                    {outline.map((s, i) => (
                                        <option key={s.id} value={s.id}>
                                            {book === "textbook" ? `บทที่ ${i + 1} ` : ""}{s.title}
                                        </option>
                                    ))}
                                </select>
                                {show("section") ?? (
                                    <div style={HINT_STYLE}>
                                        จะแสดงเป็น {pageLabel}ที่ {number}
                                        {editing && sectionId !== initial.sectionId ? ` (ต่อท้าย${sectionLabel}ใหม่)` : ""}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div style={FIELD_LABEL_STYLE}>URL ของ{pageLabel} <Required /></div>
                                <div className="d-flex align-items-stretch" style={{ border: "1px solid #e6f0ea", borderRadius: 10, overflow: "hidden" }}>
                                    <span style={{ background: "#f8fbf9", color: "#94a3b8", fontSize: 13, padding: "9px 10px", whiteSpace: "nowrap", borderRight: "1px solid #e6f0ea" }}>/kitty/{book}/</span>
                                    <input
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                                        readOnly={editing}
                                        placeholder={book === "handbook" ? "เช่น draw-plot" : "เช่น carbon-cycle"}
                                        style={{ ...INPUT_STYLE, border: "none", borderRadius: 0, minWidth: 0, ...(editing ? { background: "#f8fbf9", color: "#5a7a65" } : {}) }}
                                    />
                                </div>
                                {attempted && errors.slug
                                    ? <div style={ERROR_STYLE}>{errors.slug}</div>
                                    : <div style={HINT_STYLE}>
                                        {editing ? `เปลี่ยน URL ไม่ได้หลังสร้าง${pageLabel}แล้ว` : "ภาษาอังกฤษตัวเล็ก ตัวเลข และขีด (-) · ห้ามซ้ำกับหน้าอื่นใน Handbook และ Textbook"}
                                    </div>}
                            </div>
                        </div>

                        {book === "textbook" && (
                            <div style={PANEL_STYLE}>
                                <div className="fw-bold mb-1" style={{ color: "#1a3d2b", fontSize: 15 }}>
                                    <i className="bi bi-lightbulb me-2" style={{ color: "#1e7a47" }} />เกร็ดความรู้
                                </div>
                                <div className="mb-2" style={{ fontSize: 12, color: "#94a3b8" }}>แสดงในกล่องข้างบทเรียน · ไม่บังคับ</div>
                                <textarea
                                    value={tip}
                                    onChange={(e) => setTip(e.target.value)}
                                    rows={4}
                                    placeholder="เช่น ต้นยางพารา 1 ต้นกักเก็บคาร์บอนได้…"
                                    style={{ ...INPUT_STYLE, resize: "vertical" }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* ── Preview — the public page's article column (+ tip box). ── */
                <div style={{ ...PANEL_STYLE, padding: 0, overflow: "hidden" }}>
                    <div className="kc-tw bg-muted/60 px-4 py-10 sm:px-8">
                        <div className={`mx-auto grid grid-cols-1 gap-8 ${book === "textbook" ? "max-w-6xl xl:grid-cols-[minmax(0,1fr)_300px]" : "max-w-4xl"}`}>
                            <article className="min-w-0">
                                <div className="mb-4 text-xs text-muted-foreground">
                                    {book === "textbook" ? `บทที่ ${sectionIndex + 1} ` : ""}{section?.title ?? "—"}
                                </div>
                                <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                                    {number} {title || <span className="text-muted-foreground">ยังไม่มีชื่อ{pageLabel}</span>}
                                </h1>
                                {description.trim() ? (
                                    <p className="mt-2 mb-0 text-base leading-relaxed text-muted-foreground">{description.trim()}</p>
                                ) : null}
                                <div className="mt-8">
                                    <BookBody body={previewBody} />
                                </div>
                            </article>
                            {book === "textbook" && (
                                <aside>
                                    <TipBox tip={tip.trim() || null} />
                                </aside>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Save bar ── */}
            <div className="d-flex flex-column align-items-end gap-2 mt-4">
                {attempted && hasErrors && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบ และแก้ส่วนที่ยังไม่สมบูรณ์ก่อนบันทึก
                    </div>
                )}
                {saveError && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />{saveError}
                    </div>
                )}
                <div className="d-flex gap-2">
                    <Link href={backHref} className="btn" style={SECONDARY_BUTTON_STYLE}>
                        ยกเลิก
                    </Link>
                    <button type="button" onClick={handleSave} disabled={saving} className="btn" style={PRIMARY_BUTTON_STYLE}>
                        {saving
                            ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                            : editing ? "บันทึกการแก้ไข"
                            : published ? "บันทึกและเผยแพร่" : "บันทึก (ซ่อนไว้ก่อน)"}
                    </button>
                </div>
            </div>
        </>
    );
}
