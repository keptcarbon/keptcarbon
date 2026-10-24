"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/app/components";
import { accents, badInlineLinks, blogCategories, formatThaiDate, linkHref } from "@/app/(main)/(landing)/kitty/blog/content";
import type { AccentName, PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import PostBlockView from "@/app/(main)/(landing)/kitty/blog/PostBlockView";
import PublishSwitch from "../PublishSwitch";
import TagInput from "./TagInput";

// The Keppy Blog editor — สร้าง blog (blog/new) and แก้ไข blog
// (blog/[slug]/edit). Saves through POST /api/rnd/blog or PUT
// /api/rnd/blog/<slug> (tbl_blog + image files). New images are previewed
// from local blob: URLs until saved; when editing, images the post already
// has are kept unless replaced or removed. Only JPG, PNG and WebP up to
// 5 MB are accepted here — the API checks the same again from the bytes.
// The URL (slug) is fixed once a post exists.

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

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const FIELD_LABEL_STYLE: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5a7a65",
    marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid #e6f0ea",
    background: "#fff",
    padding: "9px 12px",
    fontSize: 14,
    color: "#1a3d2b",
    outline: "none",
};

const PANEL_STYLE: React.CSSProperties = {
    background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20,
};

/** The red "*" after a required field's label. */
function Required() {
    return <span aria-hidden="true" style={{ color: "#dc2626" }}>*</span>;
}

const ERROR_STYLE: React.CSSProperties = { fontSize: 12, color: "#dc2626", marginTop: 4 };

const ICON_BUTTON_STYLE: React.CSSProperties = {
    border: "1px solid #e6f0ea", borderRadius: 8, background: "#fff", color: "#5a7a65",
    width: 30, height: 30, padding: 0, fontSize: 13,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Why this file can't be used, or null if it's a JPG / PNG / WebP ≤ 5 MB. */
function imageProblem(file: File): string | null {
    if (!IMAGE_TYPES.includes(file.type) || !IMAGE_EXTENSIONS.test(file.name)) {
        return `"${file.name}" ไม่ใช่ไฟล์ที่รองรับ — ใช้ได้เฉพาะ JPG, PNG หรือ WebP`;
    }
    if (file.size > MAX_IMAGE_BYTES) return `"${file.name}" มีขนาดเกิน 5 MB`;
    return null;
}

const QUOTE_COLORS: { name: AccentName; label: string }[] = [
    { name: "green", label: "เขียว" },
    { name: "blue", label: "น้ำเงิน" },
    { name: "amber", label: "ส้ม" },
    { name: "red", label: "แดง" },
    { name: "yellow", label: "เหลือง" },
];

// ── Draft blocks — PostBlock plus an id (list key) and, for images, the
//    picked file (uploaded on save) and its preview URL; an image the post
//    already has keeps its URL in src with file = null. ──
type DraftBlock =
    | { id: number; type: "paragraph"; text: string }
    | { id: number; type: "heading"; text: string }
    | { id: number; type: "quote"; color: AccentName; text: string }
    | { id: number; type: "image"; src: string | null; file: File | null; fileName: string; alt: string; caption: string }
    | { id: number; type: "link"; url: string; text: string };

type BlockType = DraftBlock["type"];

const BLOCK_META: Record<BlockType, { label: string; icon: string }> = {
    paragraph: { label: "ย่อหน้า", icon: "bi-text-paragraph" },
    heading: { label: "หัวข้อ", icon: "bi-type-h2" },
    quote: { label: "ข้อความเน้น", icon: "bi-quote" },
    image: { label: "รูปภาพ", icon: "bi-image" },
    link: { label: "ลิงก์", icon: "bi-link-45deg" },
};

function newBlock(id: number, type: BlockType): DraftBlock {
    switch (type) {
        case "quote": return { id, type, color: "green", text: "" };
        case "image": return { id, type, src: null, file: null, fileName: "", alt: "", caption: "" };
        case "link": return { id, type, url: "", text: "" };
        default: return { id, type, text: "" };
    }
}

// ── Text formatting markers (rendered by InlineText on the post page) ──
type FormatKind = "b" | "i" | "u";
const FORMAT_MARK: Record<FormatKind, string> = { b: "**", i: "*", u: "__" };
const FORMAT_BUTTONS: { kind: FormatKind; label: string; title: string; style: React.CSSProperties }[] = [
    { kind: "b", label: "B", title: "ตัวหนา (Ctrl/⌘+B)", style: { fontWeight: 800 } },
    { kind: "i", label: "I", title: "ตัวเอียง (Ctrl/⌘+I)", style: { fontStyle: "italic", fontFamily: "Georgia, serif" } },
    { kind: "u", label: "U", title: "ขีดเส้นใต้ (Ctrl/⌘+U)", style: { textDecoration: "underline" } },
];

const runBefore = (t: string, pos: number, ch: string) => { let n = 0; while (pos - n - 1 >= 0 && t[pos - n - 1] === ch) n++; return n; };
const runAfter = (t: string, pos: number, ch: string) => { let n = 0; while (pos + n < t.length && t[pos + n] === ch) n++; return n; };

/** Adds or removes a format's markers around [start, end) — removes when
    the selection is already wrapped (so B on bold text un-bolds it).
    Surrounding spaces are left outside the markers, which must touch the
    text. With nothing selected it inserts an empty pair, caret inside. */
function toggleFormat(text: string, start: number, end: number, kind: FormatKind) {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    const mark = FORMAT_MARK[kind];
    const ch = mark[0];
    const before = runBefore(text, start, ch);
    const after = runAfter(text, end, ch);
    // * vs **: italic is an odd run of stars around the text, bold ≥ 2.
    const wrapped = kind === "i" ? before % 2 === 1 && after % 2 === 1 : before >= 2 && after >= 2;
    if (wrapped && start < end) {
        return {
            text: text.slice(0, start - mark.length) + text.slice(start, end) + text.slice(end + mark.length),
            start: start - mark.length,
            end: end - mark.length,
        };
    }
    return {
        text: text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end),
        start: start + mark.length,
        end: end + mark.length,
    };
}

/** Name shown on an image the post already has (stored in the database, so
    it has no file name of its own). */
const SAVED_IMAGE_LABEL = "รูปที่บันทึกไว้";

/** A saved block back into an editable draft. */
function toDraft(b: PostBlock, id: number): DraftBlock {
    switch (b.type) {
        case "image":
            return { id, type: "image", src: b.src, file: null, fileName: SAVED_IMAGE_LABEL, alt: b.alt, caption: b.caption ?? "" };
        case "link":
            return { id, type: "link", url: b.url, text: b.text ?? "" };
        case "paragraph":
        case "heading":
            return { id, type: b.type, text: b.text };
        default:
            return { id, type: "quote", color: (b.type.replace(/^quote-?/, "") || "green") as AccentName, text: b.text };
    }
}

/** The draft as the public post page would render it (unfinished blocks skipped). */
function toPostBlock(b: DraftBlock): PostBlock | null {
    switch (b.type) {
        case "image":
            return b.src ? { type: "image", src: b.src, alt: b.alt, caption: b.caption || undefined } : null;
        case "quote":
            return b.text.trim() ? { type: b.color === "green" ? "quote" : `quote-${b.color}`, text: b.text } : null;
        case "link": {
            const url = linkHref(b.url);
            return url ? { type: "link", url, text: b.text.trim() || undefined } : null;
        }
        default:
            return b.text.trim() ? { type: b.type, text: b.text } : null;
    }
}

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
        initial?.body.length ? initial.body.map((b, i) => toDraft(b, i + 1)) : [newBlock(1, "paragraph")]
    );
    const nextId = useRef((initial?.body.length ?? 1) + 1);

    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Rejected picks, keyed "cover" or the image block's id.
    const [pickErrors, setPickErrors] = useState<Record<string, string>>({});

    // ── แทรกลิงก์: insert [ข้อความ](URL) into a paragraph / heading / quote
    //    at the cursor (or over the selected text, which becomes the label). ──
    const fieldRefs = useRef(new Map<number, HTMLInputElement | HTMLTextAreaElement>());
    const fieldRef = (id: number) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
        if (el) fieldRefs.current.set(id, el);
        else fieldRefs.current.delete(id);
    };
    // Last cursor / selection per field, kept as it changes — reading it on
    // click is too late once focus has moved to the button (e.g. by Tab).
    const selections = useRef(new Map<number, [number, number]>());
    const rememberSelection = (id: number) => (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const el = e.currentTarget;
        selections.current.set(id, [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]);
    };
    const [linkForm, setLinkForm] = useState<{
        blockId: number; start: number; end: number; text: string; url: string; error: string | null;
    } | null>(null);

    function openLinkForm(id: number, text: string) {
        const [start, end] = selections.current.get(id) ?? [text.length, text.length];
        setLinkForm({ blockId: id, start, end, text: text.slice(start, end), url: "", error: null });
    }

    function applyFormat(id: number, kind: FormatKind) {
        const block = blocks.find((b) => b.id === id);
        if (!block || !("text" in block)) return;
        const [start, end] = selections.current.get(id) ?? [block.text.length, block.text.length];
        const next = toggleFormat(block.text, start, end, kind);
        updateBlock(id, { text: next.text });
        selections.current.set(id, [next.start, next.end]);
        requestAnimationFrame(() => {
            const el = fieldRefs.current.get(id);
            el?.focus();
            el?.setSelectionRange(next.start, next.end);
        });
    }

    // Ctrl/⌘ + B / I / U in a text field.
    const formatKeys = (id: number) => (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
        const kind = ({ b: "b", i: "i", u: "u" } as Record<string, FormatKind>)[e.key.toLowerCase()];
        if (!kind) return;
        e.preventDefault();
        const el = e.currentTarget;
        selections.current.set(id, [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]);
        applyFormat(id, kind);
    };

    function insertLink() {
        if (!linkForm) return;
        const href = linkHref(linkForm.url);
        if (!href) {
            setLinkForm({ ...linkForm, error: "URL ไม่ถูกต้อง — ใช้ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://" });
            return;
        }
        // Brackets and line breaks would end the [label] early.
        const label = linkForm.text.replace(/[[\]\n]/g, " ").trim() || href;
        const snippet = `[${label}](${href})`;
        const block = blocks.find((b) => b.id === linkForm.blockId);
        if (!block || !("text" in block)) return;
        updateBlock(block.id, { text: block.text.slice(0, linkForm.start) + snippet + block.text.slice(linkForm.end) });
        const caret = linkForm.start + snippet.length;
        setLinkForm(null);
        requestAnimationFrame(() => {
            const el = fieldRefs.current.get(block.id);
            el?.focus();
            el?.setSelectionRange(caret, caret);
        });
    }
    const setPickError = (key: string, message: string | null) =>
        setPickErrors((prev) => {
            const next = { ...prev };
            if (message) next[key] = message;
            else delete next[key];
            return next;
        });

    // ── blob: URLs for picked images — revoked when replaced/removed and on leave. ──
    const objectUrls = useRef(new Set<string>());
    const makeUrl = (file: File) => {
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        return url;
    };
    const dropUrl = (url: string | null | undefined) => {
        if (!url) return;
        URL.revokeObjectURL(url);
        objectUrls.current.delete(url);
    };
    useEffect(() => {
        const urls = objectUrls.current;
        return () => urls.forEach((u) => URL.revokeObjectURL(u));
    }, []);

    // ── Block list ops ──
    const addBlock = (type: BlockType) => {
        setBlocks((prev) => [...prev, newBlock(nextId.current++, type)]);
    };
    const updateBlock = (id: number, patch: Partial<DraftBlock>) =>
        setBlocks((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as DraftBlock) : b)));
    const removeBlock = (id: number) =>
        setBlocks((prev) => {
            const gone = prev.find((b) => b.id === id);
            if (gone?.type === "image") dropUrl(gone.src);
            return prev.filter((b) => b.id !== id);
        });
    const moveBlock = (id: number, dir: -1 | 1) =>
        setBlocks((prev) => {
            const i = prev.findIndex((b) => b.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    // ── Validation ──
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "กรุณากรอกชื่อบทความ";
    if (!slug) errors.slug = "กรุณากำหนด URL ของบทความ";
    else if (!SLUG_PATTERN.test(slug)) errors.slug = "ใช้ได้เฉพาะ a-z, 0-9 และขีด (-) เช่น carbon-credit-101";
    if (!category) errors.category = "กรุณาเลือกหมวดหมู่";
    if (!date) errors.date = "กรุณาเลือกวันที่เผยแพร่";
    if (!cover) errors.cover = "กรุณาเลือกภาพปก";
    if (!blocks.some((b) => toPostBlock(b))) errors.body = "กรุณาเพิ่มเนื้อหาอย่างน้อย 1 ส่วน";
    const blockErrors = new Map<number, string>();
    for (const b of blocks) {
        if (b.type === "image" && !b.src) blockErrors.set(b.id, "กรุณาเลือกรูปภาพ หรือลบส่วนนี้");
        else if (b.type === "image" && !b.alt.trim()) blockErrors.set(b.id, "กรุณาใส่คำอธิบายรูป (alt) สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ");
        else if (b.type === "link" && !b.url.trim()) blockErrors.set(b.id, "กรุณาใส่ URL ของลิงก์ หรือลบส่วนนี้");
        else if (b.type === "link" && !linkHref(b.url)) blockErrors.set(b.id, "URL ไม่ถูกต้อง — ใช้ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https:// เช่น https://www.tgo.or.th");
        else if (b.type !== "image" && b.type !== "link" && !b.text.trim()) blockErrors.set(b.id, "ส่วนนี้ยังว่างอยู่ — กรอกข้อความหรือลบส่วนนี้");
        else if (b.type !== "image" && b.type !== "link" && badInlineLinks(b.text).length) {
            blockErrors.set(b.id, `ลิงก์ในข้อความไม่ถูกต้อง (${badInlineLinks(b.text)[0]}) — ใช้ URL ที่ขึ้นต้นด้วย http:// หรือ https://`);
        }
    }
    const hasErrors = Object.keys(errors).length > 0 || blockErrors.size > 0;
    const show = (key: string) => attempted && errors[key] ? <div style={ERROR_STYLE}>{errors[key]}</div> : null;

    async function handleSave() {
        setAttempted(true);
        setSaveError(null);
        if (hasErrors || !cover) return;

        // multipart: fields + cover + one form field per body image, named
        // in the image block's "file" so the API can match them up.
        const form = new FormData();
        form.append("title", title.trim());
        if (!editing) form.append("slug", slug);
        form.append("category", category);
        form.append("date", date);
        form.append("author", author.trim());
        form.append("published", String(published));
        form.append("tags", JSON.stringify(tags));
        if (cover.file) form.append("cover", cover.file, cover.file.name); // else keep the current one
        const body = blocks.map((b) => {
            switch (b.type) {
                case "image": {
                    const meta = { alt: b.alt.trim(), caption: b.caption.trim() || undefined };
                    if (!b.file) return { type: "image", src: b.src, ...meta }; // already saved — keep it
                    const field = `image-${b.id}`;
                    form.append(field, b.file, b.file.name);
                    return { type: "image", file: field, ...meta };
                }
                case "quote":
                    return { type: b.color === "green" ? "quote" : `quote-${b.color}`, text: b.text.trim() };
                case "link":
                    return { type: "link", url: linkHref(b.url), text: b.text.trim() || undefined };
                default:
                    return { type: b.type, text: b.text.trim() };
            }
        });
        form.append("body", JSON.stringify(body));

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
            <div className="d-flex align-items-center gap-1 mb-4" style={{ borderBottom: "1px solid #e6f0ea" }}>
                {([["edit", "แก้ไข", "bi-pencil"], ["preview", "ตัวอย่าง", "bi-eye"]] as const).map(([key, label, icon]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setMode(key)}
                        className="btn"
                        style={{
                            border: "none", background: "transparent", borderRadius: 0,
                            padding: "10px 18px", fontWeight: 600, fontSize: "0.9rem",
                            width: "auto", whiteSpace: "nowrap",
                            color: mode === key ? "#1e7a47" : "#5a7a65",
                            borderBottom: mode === key ? "2px solid #1e7a47" : "2px solid transparent",
                            marginBottom: -1,
                        }}
                    >
                        <i className={`bi ${icon} me-2`} />{label}
                    </button>
                ))}
            </div>

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

                        <div style={PANEL_STYLE}>
                            <div className="d-flex align-items-center justify-content-between mb-3">
                                <div className="fw-bold" style={{ color: "#1a3d2b", fontSize: 15 }}>เนื้อหา</div>
                                <div style={{ fontSize: 12, color: "#94a3b8" }}>{blocks.length} ส่วน</div>
                            </div>
                            <div className="mb-3" style={{ fontSize: 12, color: "#5a7a65", background: "#f8fbf9", border: "1px solid #e6f0ea", borderRadius: 8, padding: "6px 10px" }}>
                                <i className="bi bi-type me-1" />
                                จัดรูปแบบในย่อหน้า หัวข้อ และข้อความเน้น: เลือกข้อความแล้วกด <b>B</b> <i>I</i> <u>U</u> หรือ แทรกลิงก์ —
                                จะแสดงเป็น {["**ตัวหนา**", "*ตัวเอียง*", "__ขีดเส้นใต้__", "[ข้อความ](URL)"].map((m) => (
                                    <code key={m} className="mx-1" style={{ color: "#1e7a47", fontSize: 11.5 }}>{m}</code>
                                ))} · ดูผลจริงที่แท็บ &ldquo;ตัวอย่าง&rdquo;
                            </div>

                            <div className="d-flex flex-column gap-3">
                                {blocks.map((b, i) => (
                                    <div key={b.id} style={{ border: `1px solid ${attempted && blockErrors.has(b.id) ? "#fca5a5" : "#e6f0ea"}`, borderRadius: 12, padding: 14, background: "#fcfdfc" }}>
                                        {/* Block header: type · move / delete */}
                                        <div className="d-flex align-items-center gap-2 mb-2">
                                            <i className={`bi ${BLOCK_META[b.type].icon}`} style={{ color: "#1e7a47" }} />
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65" }}>{BLOCK_META[b.type].label}</span>
                                            <div className="ms-auto d-flex gap-1">
                                                {(b.type === "paragraph" || b.type === "heading" || b.type === "quote") && FORMAT_BUTTONS.map((f) => (
                                                    <button
                                                        key={f.kind}
                                                        type="button"
                                                        // mousedown keeps the field's selection
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => applyFormat(b.id, f.kind)}
                                                        style={{ ...ICON_BUTTON_STYLE, ...f.style, color: "#1a3d2b", fontSize: 13 }}
                                                        title={f.title}
                                                        aria-label={f.title}
                                                    >
                                                        {f.label}
                                                    </button>
                                                ))}
                                                {(b.type === "paragraph" || b.type === "heading" || b.type === "quote") && (
                                                    <button
                                                        type="button"
                                                        // mousedown keeps the field's selection for openLinkForm
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => openLinkForm(b.id, b.text)}
                                                        style={{ ...ICON_BUTTON_STYLE, width: "auto", padding: "0 9px", gap: 4, fontSize: 12, color: "#1e7a47" }}
                                                        title="แทรกลิงก์ในข้อความ — เลือกข้อความก่อนเพื่อใช้เป็นข้อความของลิงก์"
                                                    >
                                                        <i className="bi bi-link-45deg" />แทรกลิงก์
                                                    </button>
                                                )}
                                                <button type="button" style={ICON_BUTTON_STYLE} disabled={i === 0} onClick={() => moveBlock(b.id, -1)} aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น">
                                                    <i className="bi bi-arrow-up" />
                                                </button>
                                                <button type="button" style={ICON_BUTTON_STYLE} disabled={i === blocks.length - 1} onClick={() => moveBlock(b.id, 1)} aria-label="เลื่อนลง" title="เลื่อนลง">
                                                    <i className="bi bi-arrow-down" />
                                                </button>
                                                <button type="button" style={{ ...ICON_BUTTON_STYLE, color: "#c53030" }} onClick={() => removeBlock(b.id)} aria-label="ลบส่วนนี้" title="ลบส่วนนี้">
                                                    <i className="bi bi-trash" />
                                                </button>
                                            </div>
                                        </div>

                                        {b.type === "paragraph" && (
                                            <textarea
                                                ref={fieldRef(b.id)}
                                                onSelect={rememberSelection(b.id)}
                                                onKeyDown={formatKeys(b.id)}
                                                value={b.text}
                                                onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                                rows={4}
                                                placeholder="พิมพ์เนื้อหาย่อหน้า…"
                                                style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.7 }}
                                            />
                                        )}
                                        {b.type === "heading" && (
                                            <input
                                                ref={fieldRef(b.id)}
                                                onSelect={rememberSelection(b.id)}
                                                onKeyDown={formatKeys(b.id)}
                                                value={b.text}
                                                onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                                placeholder="เช่น ทำไมคาร์บอนเครดิตถึงสำคัญ?"
                                                style={{ ...INPUT_STYLE, fontWeight: 700, fontSize: 16 }}
                                            />
                                        )}
                                        {b.type === "link" && (
                                            <div className="row g-2">
                                                <div className="col-sm-7">
                                                    <div style={FIELD_LABEL_STYLE}>URL <Required /></div>
                                                    <input
                                                        type="url"
                                                        inputMode="url"
                                                        value={b.url}
                                                        onChange={(e) => updateBlock(b.id, { url: e.target.value })}
                                                        placeholder="https://www.tgo.or.th"
                                                        style={INPUT_STYLE}
                                                    />
                                                </div>
                                                <div className="col-sm-5">
                                                    <div style={FIELD_LABEL_STYLE}>ข้อความที่แสดง</div>
                                                    <input
                                                        value={b.text}
                                                        onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                                        placeholder="ไม่บังคับ — ถ้าว่างจะแสดง URL"
                                                        style={INPUT_STYLE}
                                                    />
                                                </div>
                                                <div className="col-12" style={{ fontSize: 12, color: "#94a3b8" }}>
                                                    <i className="bi bi-box-arrow-up-right me-1" />เปิดในแท็บใหม่เมื่อผู้อ่านคลิก
                                                </div>
                                            </div>
                                        )}
                                        {b.type === "quote" && (
                                            <>
                                                <div className="d-flex align-items-center gap-2 mb-2" role="radiogroup" aria-label="สีข้อความเน้น">
                                                    <span style={{ fontSize: 12, color: "#5a7a65" }}>สี</span>
                                                    {QUOTE_COLORS.map(({ name, label }) => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={b.color === name}
                                                            aria-label={label}
                                                            title={label}
                                                            onClick={() => updateBlock(b.id, { color: name })}
                                                            style={{
                                                                width: 22, height: 22, borderRadius: "50%", padding: 0,
                                                                background: accents[name].color,
                                                                border: "2px solid #fff",
                                                                boxShadow: b.color === name ? "0 0 0 2px #1a3d2b" : "0 0 0 1px #e6f0ea",
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                <textarea
                                                    ref={fieldRef(b.id)}
                                                onSelect={rememberSelection(b.id)}
                                                onKeyDown={formatKeys(b.id)}
                                                    value={b.text}
                                                    onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                                    rows={2}
                                                    placeholder="ข้อความที่ต้องการเน้น…"
                                                    style={{
                                                        ...INPUT_STYLE, resize: "vertical", fontWeight: 500,
                                                        borderLeft: `4px solid ${accents[b.color].color}`,
                                                        background: `color-mix(in srgb, ${accents[b.color].color} 8%, white)`,
                                                    }}
                                                />
                                            </>
                                        )}
                                        {b.type === "image" && (
                                            <div className="row g-3">
                                                <div className="col-sm-5">
                                                    <ImagePicker
                                                        src={b.src}
                                                        fileName={b.fileName}
                                                        height={140}
                                                        error={pickErrors[b.id]}
                                                        onPick={(file) => {
                                                            const problem = imageProblem(file);
                                                            setPickError(String(b.id), problem);
                                                            if (problem) return;
                                                            dropUrl(b.src);
                                                            updateBlock(b.id, { src: makeUrl(file), file, fileName: file.name });
                                                        }}
                                                    />
                                                </div>
                                                <div className="col-sm-7 d-flex flex-column gap-2">
                                                    <div>
                                                        <div style={FIELD_LABEL_STYLE}>คำอธิบายรูป (alt) <Required /></div>
                                                        <input value={b.alt} onChange={(e) => updateBlock(b.id, { alt: e.target.value })} placeholder="เช่น เกษตรกรกรีดยางในสวน" style={INPUT_STYLE} />
                                                    </div>
                                                    <div>
                                                        <div style={FIELD_LABEL_STYLE}>คำบรรยายใต้ภาพ</div>
                                                        <input value={b.caption} onChange={(e) => updateBlock(b.id, { caption: e.target.value })} placeholder="ไม่บังคับ" style={INPUT_STYLE} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {linkForm?.blockId === b.id && (
                                            <div
                                                className="mt-2 p-2"
                                                style={{ border: "1px solid #cfe9db", background: "#f3fbf6", borderRadius: 10 }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") { e.preventDefault(); insertLink(); }
                                                    if (e.key === "Escape") setLinkForm(null);
                                                }}
                                            >
                                                <div className="row g-2 align-items-end">
                                                    <div className="col-sm-5">
                                                        <div style={FIELD_LABEL_STYLE}>ข้อความของลิงก์</div>
                                                        <input
                                                            value={linkForm.text}
                                                            onChange={(e) => setLinkForm({ ...linkForm, text: e.target.value })}
                                                            placeholder="ถ้าว่างจะแสดง URL"
                                                            style={INPUT_STYLE}
                                                        />
                                                    </div>
                                                    <div className="col-sm-5">
                                                        <div style={FIELD_LABEL_STYLE}>URL <Required /></div>
                                                        <input
                                                            type="url"
                                                            inputMode="url"
                                                            autoFocus
                                                            value={linkForm.url}
                                                            onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value, error: null })}
                                                            placeholder="https://www.tgo.or.th"
                                                            style={INPUT_STYLE}
                                                        />
                                                    </div>
                                                    <div className="col-sm-2 d-flex gap-1">
                                                        <button type="button" onClick={insertLink} className="btn" style={{ background: "#1e7a47", color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px", fontSize: "0.8rem", fontWeight: 600, width: "auto", flex: 1 }}>
                                                            แทรก
                                                        </button>
                                                        <button type="button" onClick={() => setLinkForm(null)} aria-label="ยกเลิก" className="btn" style={{ ...ICON_BUTTON_STYLE, width: 36, height: 36 }}>
                                                            <i className="bi bi-x-lg" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {linkForm.error
                                                    ? <div style={ERROR_STYLE}>{linkForm.error}</div>
                                                    : <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>จะแทรกเป็น [ข้อความ](URL) — ผู้อ่านคลิกแล้วเปิดในแท็บใหม่ · กด &ldquo;ตัวอย่าง&rdquo; เพื่อดูผล</div>}
                                            </div>
                                        )}

                                        {attempted && blockErrors.has(b.id) && <div style={ERROR_STYLE}>{blockErrors.get(b.id)}</div>}
                                    </div>
                                ))}
                            </div>

                            {/* Add a block */}
                            <div className="d-flex flex-wrap align-items-center gap-2 mt-3 p-3" style={{ border: "1px dashed #cfe3d6", borderRadius: 12 }}>
                                <span style={{ fontSize: 12.5, color: "#5a7a65", fontWeight: 600 }} className="me-1">เพิ่ม</span>
                                {(Object.keys(BLOCK_META) as BlockType[]).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => addBlock(type)}
                                        className="btn btn-sm"
                                        style={{ border: "1px solid #e6f0ea", borderRadius: 9, color: "#1a3d2b", background: "#fff", padding: "5px 11px", fontSize: "0.8rem", width: "auto" }}
                                    >
                                        <i className={`bi ${BLOCK_META[type].icon} me-1`} style={{ color: "#1e7a47" }} />{BLOCK_META[type].label}
                                    </button>
                                ))}
                            </div>
                            {show("body")}
                        </div>
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
                                error={pickErrors.cover}
                                onPick={(file) => {
                                    const problem = imageProblem(file);
                                    setPickError("cover", problem);
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
                        style={{ border: "1px solid #e6f0ea", background: "#fff", color: "#1a3d2b", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: "0.9rem", width: "auto", whiteSpace: "nowrap" }}
                    >
                        ยกเลิก
                    </Link>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="btn"
                        style={{ background: "#1e7a47", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: "0.9rem", width: "auto", whiteSpace: "nowrap" }}
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

// Click-to-pick image box with a preview of the chosen file.
function ImagePicker({ src, fileName, height, error, onPick }: {
    src: string | null;
    fileName: string;
    height: number;
    error?: string;
    onPick: (file: File) => void;
}) {
    return (
        <>
        <label
            className="d-block position-relative overflow-hidden mb-0"
            style={{
                height, borderRadius: 12, cursor: "pointer",
                border: error ? "1px solid #fca5a5" : src ? "1px solid #e6f0ea" : "1px dashed #cfe3d6",
                background: src ? "#fff" : "#f8fbf9",
            }}
        >
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPick(file);
                    e.target.value = "";
                }}
            />
            {src ? (
                <>
                    <Image src={src} alt="" fill unoptimized style={{ objectFit: "cover" }} />
                    <span
                        className="position-absolute bottom-0 start-0 end-0 d-flex align-items-center gap-1 px-2 py-1"
                        style={{ background: "rgba(26,61,43,0.7)", color: "#fff", fontSize: 11.5 }}
                    >
                        <i className="bi bi-arrow-repeat" />
                        <span className="text-truncate">เปลี่ยนรูป · {fileName}</span>
                    </span>
                </>
            ) : (
                <span className="d-flex flex-column align-items-center justify-content-center gap-1" style={{ position: "absolute", inset: 0, color: "#5a7a65", fontSize: 13 }}>
                    <i className="bi bi-cloud-arrow-up" style={{ fontSize: 24, color: "#1e7a47" }} />
                    คลิกเพื่อเลือกรูปภาพ
                </span>
            )}
        </label>
        {error && <div style={ERROR_STYLE}>{error}</div>}
        </>
    );
}
