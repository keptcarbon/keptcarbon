"use client";

import { useRef, useState } from "react";
import { accents, badInlineLinks, linkHref } from "@/app/(main)/(landing)/kitty/blog/content";
import type { AccentName, PostBlock } from "@/app/(main)/(landing)/kitty/blog/content";
import {
    ERROR_STYLE,
    FIELD_LABEL_STYLE,
    ICON_BUTTON_STYLE,
    INPUT_STYLE,
    ImagePicker,
    PANEL_STYLE,
    Required,
    SAVED_IMAGE_LABEL,
    imageProblem,
} from "./editor-ui";

// The body of a KITTY page as a list of blocks — paragraphs, headings
// (h2 / h3), numbered or bulleted lists, quotes, images and links — with
// move / delete per block, B / I / U and inline links in text. Used by the
// blog editor and the handbook / textbook page editor; both send the
// result to the API with appendBody and validate it with blockErrors.

const QUOTE_COLORS: { name: AccentName; label: string }[] = [
    { name: "green", label: "เขียว" },
    { name: "blue", label: "น้ำเงิน" },
    { name: "amber", label: "ส้ม" },
    { name: "red", label: "แดง" },
    { name: "yellow", label: "เหลือง" },
];

// ── Draft blocks — PostBlock plus an id (list key) and, for images, the
//    picked file (uploaded on save) and its preview URL; an image the page
//    already has keeps its URL in src with file = null. A list is edited as
//    one text, one item per line. ──
export type DraftBlock =
    | { id: number; type: "paragraph"; text: string }
    | { id: number; type: "heading"; level: 2 | 3; text: string }
    | { id: number; type: "list"; ordered: boolean; text: string }
    | { id: number; type: "quote"; color: AccentName; text: string }
    | { id: number; type: "image"; src: string | null; file: File | null; fileName: string; alt: string; caption: string }
    | { id: number; type: "link"; url: string; text: string };

type BlockType = DraftBlock["type"];

const BLOCK_META: Record<BlockType, { label: string; icon: string }> = {
    paragraph: { label: "ย่อหน้า", icon: "bi-text-paragraph" },
    heading: { label: "หัวข้อ", icon: "bi-type-h2" },
    list: { label: "รายการ", icon: "bi-list-ol" },
    quote: { label: "ข้อความเน้น", icon: "bi-quote" },
    image: { label: "รูปภาพ", icon: "bi-image" },
    link: { label: "ลิงก์", icon: "bi-link-45deg" },
};

/** Blocks whose text takes B / I / U and inline links. */
const hasText = (b: DraftBlock): b is Extract<DraftBlock, { type: "paragraph" | "heading" | "list" | "quote" }> =>
    b.type === "paragraph" || b.type === "heading" || b.type === "list" || b.type === "quote";

function newBlock(id: number, type: BlockType): DraftBlock {
    switch (type) {
        case "heading": return { id, type, level: 2, text: "" };
        case "list": return { id, type, ordered: true, text: "" };
        case "quote": return { id, type, color: "green", text: "" };
        case "image": return { id, type, src: null, file: null, fileName: "", alt: "", caption: "" };
        case "link": return { id, type, url: "", text: "" };
        default: return { id, type, text: "" };
    }
}

/** A list draft's items: one per non-empty line. */
const listItems = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// ── Text formatting markers (rendered by InlineText on the public page) ──
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

/** Saved blocks back into editable drafts (ids 1, 2, 3…). */
export function toDrafts(body: PostBlock[]): DraftBlock[] {
    return body.map((b, i): DraftBlock => {
        const id = i + 1;
        switch (b.type) {
            case "image":
                return { id, type: "image", src: b.src, file: null, fileName: SAVED_IMAGE_LABEL, alt: b.alt, caption: b.caption ?? "" };
            case "link":
                return { id, type: "link", url: b.url, text: b.text ?? "" };
            case "heading":
                return { id, type: "heading", level: b.level ?? 2, text: b.text };
            case "list":
                return { id, type: "list", ordered: b.ordered, text: b.items.join("\n") };
            case "paragraph":
                return { id, type: "paragraph", text: b.text };
            default:
                return { id, type: "quote", color: (b.type.replace(/^quote-?/, "") || "green") as AccentName, text: b.text };
        }
    });
}

/** A first, empty paragraph for a new page. */
export const emptyDrafts = (): DraftBlock[] => [newBlock(1, "paragraph")];

/** The draft as the public page would render it (unfinished blocks skipped). */
export function toPostBlock(b: DraftBlock): PostBlock | null {
    switch (b.type) {
        case "image":
            return b.src ? { type: "image", src: b.src, alt: b.alt, caption: b.caption || undefined } : null;
        case "quote":
            return b.text.trim() ? { type: b.color === "green" ? "quote" : `quote-${b.color}`, text: b.text } : null;
        case "link": {
            const url = linkHref(b.url);
            return url ? { type: "link", url, text: b.text.trim() || undefined } : null;
        }
        case "heading":
            return b.text.trim() ? { type: "heading", text: b.text, level: b.level } : null;
        case "list": {
            const items = listItems(b.text);
            return items.length ? { type: "list", ordered: b.ordered, items } : null;
        }
        default:
            return b.text.trim() ? { type: b.type, text: b.text } : null;
    }
}

/** Why each block can't be saved yet, by block id. */
export function blockErrors(blocks: DraftBlock[]) {
    const errors = new Map<number, string>();
    for (const b of blocks) {
        if (b.type === "image" && !b.src) errors.set(b.id, "กรุณาเลือกรูปภาพ หรือลบส่วนนี้");
        else if (b.type === "image" && !b.alt.trim()) errors.set(b.id, "กรุณาใส่คำอธิบายรูป (alt) สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ");
        else if (b.type === "link" && !b.url.trim()) errors.set(b.id, "กรุณาใส่ URL ของลิงก์ หรือลบส่วนนี้");
        else if (b.type === "link" && !linkHref(b.url)) errors.set(b.id, "URL ไม่ถูกต้อง — ใช้ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https:// เช่น https://www.tgo.or.th");
        else if (hasText(b) && !b.text.trim()) errors.set(b.id, "ส่วนนี้ยังว่างอยู่ — กรอกข้อความหรือลบส่วนนี้");
        else if (hasText(b) && badInlineLinks(b.text).length) {
            errors.set(b.id, `ลิงก์ในข้อความไม่ถูกต้อง (${badInlineLinks(b.text)[0]}) — ใช้ URL ที่ขึ้นต้นด้วย http:// หรือ https://`);
        }
    }
    return errors;
}

/** Adds the body to a save form: "body" (JSON blocks, in order) plus one
    form field per newly picked image, named in its block's "file" so the
    API can match them up. Images the page already has keep their src. */
export function appendBody(form: FormData, blocks: DraftBlock[]) {
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
            case "heading":
                return { type: "heading", text: b.text.trim(), level: b.level };
            case "list":
                return { type: "list", ordered: b.ordered, items: listItems(b.text) };
            default:
                return { type: b.type, text: b.text.trim() };
        }
    });
    form.append("body", JSON.stringify(body));
}

const SEGMENT_STYLE = (active: boolean): React.CSSProperties => ({
    ...ICON_BUTTON_STYLE,
    width: "auto",
    padding: "0 9px",
    fontSize: 12,
    fontWeight: 700,
    color: active ? "#fff" : "#5a7a65",
    background: active ? "#1e7a47" : "#fff",
    borderColor: active ? "#1e7a47" : "#e6f0ea",
});

export default function BlockListEditor({ blocks, onChange, attempted, errors, makeUrl, dropUrl, footer }: {
    blocks: DraftBlock[];
    onChange: React.Dispatch<React.SetStateAction<DraftBlock[]>>;
    /** Save was pressed — show each block's error. */
    attempted: boolean;
    errors: Map<number, string>;
    makeUrl: (file: File) => string;
    dropUrl: (url: string | null | undefined) => void;
    /** Shown under the "add" bar, e.g. the body's own error. */
    footer?: React.ReactNode;
}) {
    // Rejected picks, by image block id.
    const [pickErrors, setPickErrors] = useState<Record<number, string>>({});

    // ── Block list ops ──
    const addBlock = (type: BlockType) =>
        onChange((prev) => [...prev, newBlock(Math.max(0, ...prev.map((b) => b.id)) + 1, type)]);
    const updateBlock = (id: number, patch: Partial<DraftBlock>) =>
        onChange((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as DraftBlock) : b)));
    const removeBlock = (id: number) =>
        onChange((prev) => {
            const gone = prev.find((b) => b.id === id);
            if (gone?.type === "image") dropUrl(gone.src);
            return prev.filter((b) => b.id !== id);
        });
    const moveBlock = (id: number, dir: -1 | 1) =>
        onChange((prev) => {
            const i = prev.findIndex((b) => b.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    // ── แทรกลิงก์: insert [ข้อความ](URL) into a text block at the cursor
    //    (or over the selected text, which becomes the label). ──
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
        if (!block || !hasText(block)) return;
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
        if (!block || !hasText(block)) return;
        updateBlock(block.id, { text: block.text.slice(0, linkForm.start) + snippet + block.text.slice(linkForm.end) });
        const caret = linkForm.start + snippet.length;
        setLinkForm(null);
        requestAnimationFrame(() => {
            const el = fieldRefs.current.get(block.id);
            el?.focus();
            el?.setSelectionRange(caret, caret);
        });
    }

    // Props every text field shares: selection tracking + B / I / U keys.
    const textField = (id: number) => ({
        ref: fieldRef(id),
        onSelect: rememberSelection(id),
        onKeyDown: formatKeys(id),
    });

    return (
        <div style={PANEL_STYLE}>
            <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="fw-bold" style={{ color: "#1a3d2b", fontSize: 15 }}>เนื้อหา</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{blocks.length} ส่วน</div>
            </div>
            <div className="mb-3" style={{ fontSize: 12, color: "#5a7a65", background: "#f8fbf9", border: "1px solid #e6f0ea", borderRadius: 8, padding: "6px 10px" }}>
                <i className="bi bi-type me-1" />
                จัดรูปแบบในย่อหน้า หัวข้อ รายการ และข้อความเน้น: เลือกข้อความแล้วกด <b>B</b> <i>I</i> <u>U</u> หรือ แทรกลิงก์ —
                จะแสดงเป็น {["**ตัวหนา**", "*ตัวเอียง*", "__ขีดเส้นใต้__", "[ข้อความ](URL)"].map((m) => (
                    <code key={m} className="mx-1" style={{ color: "#1e7a47", fontSize: 11.5 }}>{m}</code>
                ))}
            </div>

            <div className="d-flex flex-column gap-3">
                {blocks.map((b, i) => (
                    <div key={b.id} style={{ border: `1px solid ${attempted && errors.has(b.id) ? "#fca5a5" : "#e6f0ea"}`, borderRadius: 12, padding: 14, background: "#fcfdfc" }}>
                        {/* Block header: type (+ level / list style) · format · move / delete */}
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                            <i className={`bi ${b.type === "heading" && b.level === 3 ? "bi-type-h3" : b.type === "list" && !b.ordered ? "bi-list-ul" : BLOCK_META[b.type].icon}`} style={{ color: "#1e7a47" }} />
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65" }}>{BLOCK_META[b.type].label}</span>
                            {b.type === "heading" && (
                                <div className="d-flex gap-1" role="radiogroup" aria-label="ระดับหัวข้อ">
                                    {([[2, "H2", "หัวข้อหลัก"], [3, "H3", "หัวข้อย่อย"]] as const).map(([level, label, title]) => (
                                        <button key={level} type="button" role="radio" aria-checked={b.level === level} title={title}
                                            onClick={() => updateBlock(b.id, { level })} style={SEGMENT_STYLE(b.level === level)}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {b.type === "list" && (
                                <div className="d-flex gap-1" role="radiogroup" aria-label="รูปแบบรายการ">
                                    {([[true, "bi-list-ol", "1. 2. 3."], [false, "bi-list-ul", "• • •"]] as const).map(([ordered, icon, label]) => (
                                        <button key={label} type="button" role="radio" aria-checked={b.ordered === ordered}
                                            title={ordered ? "รายการแบบมีลำดับเลข" : "รายการแบบสัญลักษณ์"}
                                            onClick={() => updateBlock(b.id, { ordered })} style={{ ...SEGMENT_STYLE(b.ordered === ordered), gap: 4 }}>
                                            <i className={`bi ${icon}`} />{label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="ms-auto d-flex gap-1">
                                {hasText(b) && FORMAT_BUTTONS.map((f) => (
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
                                {hasText(b) && (
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
                                {...textField(b.id)}
                                value={b.text}
                                onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                rows={4}
                                placeholder="พิมพ์เนื้อหาย่อหน้า…"
                                style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.7 }}
                            />
                        )}
                        {b.type === "heading" && (
                            <input
                                {...textField(b.id)}
                                value={b.text}
                                onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                placeholder={b.level === 3 ? "เช่น ขั้นตอนการเลือกพื้นที่" : "เช่น ทำไมคาร์บอนเครดิตถึงสำคัญ?"}
                                style={{ ...INPUT_STYLE, fontWeight: 700, fontSize: b.level === 3 ? 14.5 : 16 }}
                            />
                        )}
                        {b.type === "list" && (
                            <>
                                <textarea
                                    {...textField(b.id)}
                                    value={b.text}
                                    onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                                    rows={Math.max(3, b.text.split("\n").length)}
                                    placeholder={"บรรทัดละ 1 ข้อ เช่น\nเลือกเมนู \"วาดแปลง\"\nคลิกบนแผนที่เพื่อวาดขอบเขตแปลง\nกด \"บันทึก\""}
                                    style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.7 }}
                                />
                                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                                    <i className="bi bi-info-circle me-1" />
                                    กด Enter เพื่อขึ้นข้อใหม่ — {b.ordered ? "แสดงเลขลำดับ 1. 2. 3. ให้อัตโนมัติ" : "แสดงเป็นสัญลักษณ์ • หน้าแต่ละข้อ"} ·{" "}
                                    {listItems(b.text).length} ข้อ
                                </div>
                            </>
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
                                    {...textField(b.id)}
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
                                            setPickErrors((prev) => {
                                                const next = { ...prev };
                                                if (problem) next[b.id] = problem;
                                                else delete next[b.id];
                                                return next;
                                            });
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

                        {attempted && errors.has(b.id) && <div style={ERROR_STYLE}>{errors.get(b.id)}</div>}
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
            {footer}
        </div>
    );
}
