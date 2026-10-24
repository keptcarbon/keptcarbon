"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/app/components";
import { accents, blogCategories, formatThaiDate } from "@/app/(main)/(landing)/kitty/blog/content";
import type { PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import PostBlockView from "@/app/(main)/(landing)/kitty/blog/PostBlockView";
import BlockListEditor, { appendBody, blockErrors, emptyDrafts, toDrafts, toPostBlock } from "../BlockListEditor";
import type { DraftBlock } from "../BlockListEditor";
import {
    ERROR_STYLE,
    FIELD_LABEL_STYLE,
    HERO_BG,
    INPUT_STYLE,
    ImagePicker,
    ModeTabs,
    PANEL_STYLE,
    PRIMARY_BUTTON_STYLE,
    Required,
    SAVED_IMAGE_LABEL,
    SECONDARY_BUTTON_STYLE,
    SLUG_PATTERN,
    imageProblem,
    useObjectUrls,
} from "../editor-ui";
import PublishSwitch from "../PublishSwitch";
import TagInput from "./TagInput";

// The Keppy Blog editor — สร้าง blog (blog/new) and แก้ไข blog
// (blog/[slug]/edit). Saves through POST /api/rnd/blog or PUT
// /api/rnd/blog/<slug> (tbl_blog + tbl_blog_image). The body is a
// BlockListEditor; new images are previewed from local blob: URLs until
// saved, and when editing, images the post already has are kept unless
// replaced or removed. Only JPG, PNG and WebP up to 5 MB are accepted here
// — the API checks the same again from the bytes. The URL (slug) is fixed
// once a post exists.

/** A saved post as GET /api/rnd/blog/<slug> returns it — fills the editor. */
export type EditorPost = {
    slug: string;
    title: string;
    category: string;
    date: string;
    author: string | null;
    coverImage: string;
    body: PostBlock[];
    published: boolean;
    tags: string[];
};

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BlogEditor({ initial }: {
    /** The saved post when editing; omitted for a new post. */
    initial?: EditorPost;
}) {
    const editing = !!initial;
    const router = useRouter();
    const [mode, setMode] = useState<"edit" | "preview">("edit");

    const [title, setTitle] = useState(initial?.title ?? "");
    const [slug, setSlug] = useState(initial?.slug ?? "");
    const [category, setCategory] = useState(initial?.category ?? blogCategories[0]?.id ?? "");
    const [date, setDate] = useState(initial?.date ?? todayIso);
    const [author, setAuthor] = useState(initial?.author ?? "");
    const [published, setPublished] = useState(initial?.published ?? true);
    const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
    // file = null: the cover the post already has (kept unless replaced).
    const [cover, setCover] = useState<{ src: string; file: File | null; fileName: string } | null>(
        initial ? { src: initial.coverImage, file: null, fileName: SAVED_IMAGE_LABEL } : null
    );
    const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
        initial?.body.length ? toDrafts(initial.body) : emptyDrafts()
    );
    const { makeUrl, dropUrl } = useObjectUrls();

    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [coverError, setCoverError] = useState<string | null>(null);

    // ── Validation ──
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "กรุณากรอกชื่อบทความ";
    if (!slug) errors.slug = "กรุณากำหนด URL ของบทความ";
    else if (!SLUG_PATTERN.test(slug)) errors.slug = "ใช้ได้เฉพาะ a-z, 0-9 และขีด (-) เช่น carbon-credit-101";
    if (!category) errors.category = "กรุณาเลือกหมวดหมู่";
    if (!date) errors.date = "กรุณาเลือกวันที่เผยแพร่";
    if (!cover) errors.cover = "กรุณาเลือกภาพปก";
    if (!blocks.some((b) => toPostBlock(b))) errors.body = "กรุณาเพิ่มเนื้อหาอย่างน้อย 1 ส่วน";
    const bodyErrors = blockErrors(blocks);
    const hasErrors = Object.keys(errors).length > 0 || bodyErrors.size > 0;
    const show = (key: string) => attempted && errors[key] ? <div style={ERROR_STYLE}>{errors[key]}</div> : null;

    async function handleSave() {
        setAttempted(true);
        setSaveError(null);
        if (hasErrors || !cover) return;

        const form = new FormData();
        form.append("title", title.trim());
        if (!editing) form.append("slug", slug);
        form.append("category", category);
        form.append("date", date);
        form.append("author", author.trim());
        form.append("published", String(published));
        form.append("tags", JSON.stringify(tags));
        if (cover.file) form.append("cover", cover.file, cover.file.name); // else keep the current one
        appendBody(form, blocks);

        setSaving(true);
        try {
            const res = editing
                ? await fetch(`/api/rnd/blog/${encodeURIComponent(slug)}/`, { method: "PUT", body: form })
                : await fetch("/api/rnd/blog/", { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "บันทึกบทความไม่สำเร็จ");
            router.push(`/rnd/kitty-content/?${editing ? "updated" : "created"}=${encodeURIComponent(slug)}`);
        } catch (err) {
            setSaveError((err as Error).message);
            setSaving(false);
        }
    }

    const categoryInfo = blogCategories.find((c) => c.id === category);
    const badge = categoryInfo ? accents[categoryInfo.accent] : accents.green;

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <Link href="/rnd/kitty-content/" className="d-inline-flex align-items-center gap-1 mb-3 text-decoration-none" style={{ fontSize: 13, fontWeight: 600, color: "#1e7a47" }}>
                        <i className="bi bi-chevron-left" />จัดการ KITTY Content
                    </Link>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>
                        {editing ? "แก้ไข blog" : "สร้าง blog"}
                    </h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        {editing
                            ? <>แก้ไขบทความ <strong>{initial.title}</strong> — กด &ldquo;ตัวอย่าง&rdquo; เพื่อดูหน้าตาจริงก่อนบันทึก</>
                            : <>เขียนบทความใหม่สำหรับ Keppy Blog — กด &ldquo;ตัวอย่าง&rdquo; เพื่อดูหน้าตาจริงก่อนบันทึก</>}
                    </div>
                </div>
            </Card>

            {/* ── แก้ไข / ตัวอย่าง ── */}
            <ModeTabs mode={mode} onChange={setMode} />

            {mode === "edit" ? (
                <div className="row g-4">
                    {/* ── Main: title + body ── */}
                    <div className="col-lg-8">
                        <div style={PANEL_STYLE} className="mb-4">
                            <div style={FIELD_LABEL_STYLE}>ชื่อบทความ <Required /></div>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="เช่น คาร์บอนเครดิต คืออะไร? ทำไมถึงสำคัญ?"
                                style={{ ...INPUT_STYLE, fontSize: 18, fontWeight: 600, padding: "12px 14px" }}
                            />
                            {show("title")}
                        </div>

                        <BlockListEditor
                            blocks={blocks}
                            onChange={setBlocks}
                            attempted={attempted}
                            errors={bodyErrors}
                            makeUrl={makeUrl}
                            dropUrl={dropUrl}
                            footer={show("body")}
                        />
                    </div>

                    {/* ── Side: settings + cover — left on desktop, after the body on mobile ── */}
                    <div className="col-lg-4 order-lg-first">
                        <div style={PANEL_STYLE} className="mb-4">
                            <div className="fw-bold mb-3" style={{ color: "#1a3d2b", fontSize: 15 }}>ตั้งค่าบทความ</div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>สถานะ</div>
                                <PublishSwitch published={published} disabled={false} onChange={setPublished} />
                            </div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>หมวดหมู่ <Required /></div>
                                <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select" style={INPUT_STYLE}>
                                    {blogCategories.map((c) => (
                                        <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                </select>
                                {show("category")}
                            </div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>วันที่เผยแพร่ <Required /></div>
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT_STYLE} />
                                {date && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>แสดงเป็น {formatThaiDate(date)}</div>}
                                {show("date")}
                            </div>

                            <div className="mb-3">
                                <div style={FIELD_LABEL_STYLE}>ผู้เขียน</div>
                                <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="ทีมงาน KeptCarbon" style={INPUT_STYLE} />
                            </div>

                            <div>
                                <div style={FIELD_LABEL_STYLE}>URL ของบทความ <Required /></div>
                                <div className="d-flex align-items-stretch" style={{ border: "1px solid #e6f0ea", borderRadius: 10, overflow: "hidden" }}>
                                    <span style={{ background: "#f8fbf9", color: "#94a3b8", fontSize: 13, padding: "9px 10px", whiteSpace: "nowrap", borderRight: "1px solid #e6f0ea" }}>/kitty/blog/</span>
                                    <input
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                                        readOnly={editing}
                                        placeholder="เช่น carbon-credit-101"
                                        style={{ ...INPUT_STYLE, border: "none", borderRadius: 0, minWidth: 0, ...(editing ? { background: "#f8fbf9", color: "#5a7a65" } : {}) }}
                                    />
                                </div>
                                {attempted && errors.slug
                                    ? <div style={ERROR_STYLE}>{errors.slug}</div>
                                    : <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                                        {editing ? "เปลี่ยน URL ไม่ได้หลังสร้างบทความแล้ว (ลิงก์และชื่อไฟล์รูปผูกกับ URL นี้)" : "ภาษาอังกฤษตัวเล็ก ตัวเลข และขีด (-)"}
                                    </div>}
                            </div>

                            <div className="mt-3">
                                <div style={FIELD_LABEL_STYLE}>Tag</div>
                                <TagInput value={tags} onChange={setTags} />
                            </div>
                        </div>

                        <div style={PANEL_STYLE}>
                            <div className="fw-bold mb-3" style={{ color: "#1a3d2b", fontSize: 15 }}>ภาพปก <Required /></div>
                            <ImagePicker
                                src={cover?.src ?? null}
                                fileName={cover?.fileName ?? ""}
                                height={180}
                                error={coverError ?? undefined}
                                onPick={(file) => {
                                    const problem = imageProblem(file);
                                    setCoverError(problem);
                                    if (problem) return;
                                    dropUrl(cover?.src);
                                    setCover({ src: makeUrl(file), file, fileName: file.name });
                                }}
                            />
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>แนะนำแนวนอน 16:9 · JPG, PNG หรือ WebP ไม่เกิน 5 MB</div>
                            {show("cover")}
                        </div>
                    </div>
                </div>
            ) : (
                /* ── Preview — the public post layout (article column only). ── */
                <div style={{ ...PANEL_STYLE, padding: 0, overflow: "hidden" }}>
                    <div className="kc-tw bg-muted/60 px-4 py-10 sm:px-8">
                        <article className="mx-auto max-w-3xl">
                            <span className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: badge.color, color: badge.ink }}>
                                {categoryInfo?.label ?? "บทความ"}
                            </span>
                            <h1 className="mt-3 mb-5 text-2xl leading-snug font-bold tracking-tight text-foreground wrap-anywhere md:text-4xl">
                                {title || <span className="text-muted-foreground">ยังไม่มีชื่อบทความ</span>}
                            </h1>
                            <div className="mb-6 flex items-center gap-3">
                                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
                                    <Image src="/assets/img/keptcarbon-logo.png" alt="" width={44} height={44} className="size-9 object-contain" />
                                </span>
                                <div>
                                    <div className="text-sm font-semibold text-foreground">{author.trim() || "ทีมงาน KeptCarbon"}</div>
                                    <div className="text-xs text-muted-foreground">{date ? formatThaiDate(date) : "—"}</div>
                                </div>
                            </div>
                            <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-card">
                                {cover
                                    ? <Image src={cover.src} alt="" fill unoptimized className="object-cover" />
                                    : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">ยังไม่มีภาพปก</div>}
                            </div>
                            {blocks.map((b) => {
                                const block = toPostBlock(b);
                                return block ? <PostBlockView key={b.id} block={block} /> : null;
                            })}
                            {!blocks.some((b) => toPostBlock(b)) && (
                                <p className="m-0 rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                                    ยังไม่มีเนื้อหา
                                </p>
                            )}
                        </article>
                    </div>
                </div>
            )}

            {/* ── Save bar ── */}
            <div className="d-flex flex-column align-items-end gap-2 mt-4">
                {attempted && hasErrors && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบก่อนบันทึก
                    </div>
                )}
                {saveError && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />{saveError}
                    </div>
                )}
                <div className="d-flex gap-2">
                    <Link
                        href="/rnd/kitty-content/"
                        className="btn"
                        style={SECONDARY_BUTTON_STYLE}
                    >
                        ยกเลิก
                    </Link>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="btn"
                        style={PRIMARY_BUTTON_STYLE}
                    >
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
