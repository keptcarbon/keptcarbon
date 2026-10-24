"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/app/components";
import { BOOKS, SECTION_ICONS, sectionIcon } from "@/app/(main)/(landing)/kitty/book";
import type { Book, OutlinePage, OutlineSection } from "@/app/(main)/(landing)/kitty/book";
import {
    ERROR_STYLE,
    HERO_BG,
    ICON_BUTTON_STYLE,
    INPUT_STYLE,
    PANEL_STYLE,
    PRIMARY_BUTTON_STYLE,
    SECONDARY_BUTTON_STYLE,
} from "../editor-ui";

// จัดการสารบัญ — one book's sections (handbook หมวด with an icon /
// textbook บท) and the order of their pages: add, rename, reorder and
// delete sections, move pages up / down (across section boundaries too).
// Nothing is saved until "บันทึกสารบัญ" — then PUT
// /api/rnd/kitty-book/<book> stores it all in one go. Pages themselves are
// created, edited and deleted from the content list.

type DraftSection = {
    /** List key — stays the same while a new section has no id yet. */
    key: string;
    id: number | null;
    title: string;
    icon: string | null;
    pages: OutlinePage[];
};

const DEFAULT_ICON = "BookOpen";

export default function OutlineEditor({ book, initial }: { book: Book; initial: OutlineSection[] }) {
    const router = useRouter();
    const { label: bookLabel, pageLabel, sectionLabel } = BOOKS[book];
    const backHref = `/rnd/kitty-content/?tab=${book}`;

    const [sections, setSections] = useState<DraftSection[]>(() =>
        initial.map((s) => ({ key: `s${s.id}`, id: s.id, title: s.title, icon: s.icon, pages: s.pages }))
    );
    const newKey = useRef(0);
    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const update = (key: string, patch: Partial<DraftSection>) =>
        setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

    const addSection = () =>
        setSections((prev) => [
            ...prev,
            { key: `new${++newKey.current}`, id: null, title: "", icon: book === "handbook" ? DEFAULT_ICON : null, pages: [] },
        ]);

    const moveSection = (i: number, dir: -1 | 1) =>
        setSections((prev) => {
            const j = i + dir;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const removeSection = (key: string) => setSections((prev) => prev.filter((s) => s.key !== key));

    /** Up / down one place; past the first / last page it crosses into the
        previous section's end / the next section's start. */
    const movePage = (si: number, pi: number, dir: -1 | 1) =>
        setSections((prev) => {
            const next = prev.map((s) => ({ ...s, pages: [...s.pages] }));
            const from = next[si].pages;
            const target = pi + dir;
            if (target >= 0 && target < from.length) {
                [from[pi], from[target]] = [from[target], from[pi]];
                return next;
            }
            const other = next[si + dir];
            if (!other) return prev;
            const [page] = from.splice(pi, 1);
            if (dir === -1) other.pages.push(page);
            else other.pages.unshift(page);
            return next;
        });

    const titleError = (s: DraftSection) => (!s.title.trim() ? `กรุณากรอกชื่อ${sectionLabel}` : null);
    const hasErrors = sections.some(titleError);

    async function handleSave() {
        setAttempted(true);
        setSaveError(null);
        if (hasErrors) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/rnd/kitty-book/${book}/`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sections: sections.map((s) => ({ id: s.id, title: s.title.trim(), icon: s.icon, pages: s.pages.map((p) => p.id) })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "บันทึกสารบัญไม่สำเร็จ");
            router.push(`${backHref}&outline=saved`);
        } catch (err) {
            setSaveError((err as Error).message);
            setSaving(false);
        }
    }

    const removedCount = initial.filter((s) => !sections.some((d) => d.id === s.id)).length;

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <Link href={backHref} className="d-inline-flex align-items-center gap-1 mb-3 text-decoration-none" style={{ fontSize: 13, fontWeight: 600, color: "#1e7a47" }}>
                        <i className="bi bi-chevron-left" />จัดการ KITTY Content
                    </Link>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>
                        จัดการสารบัญ · {bookLabel}
                    </h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        เพิ่ม เปลี่ยนชื่อ และเรียงลำดับ{sectionLabel} · เลื่อน{pageLabel}ขึ้น/ลง (ข้าม{sectionLabel}ได้) — ลำดับนี้คือลำดับในแถบสารบัญและปุ่ม ก่อนหน้า / ถัดไป
                    </div>
                </div>
            </Card>

            <div className="d-flex flex-column gap-3">
                {sections.map((s, si) => {
                    const Icon = sectionIcon(s.icon);
                    const error = attempted ? titleError(s) : null;
                    return (
                        <div key={s.key} style={{ ...PANEL_STYLE, padding: 16, borderColor: error ? "#fca5a5" : "#e6f0ea" }}>
                            {/* Section header: number · (icon) · title · move / delete */}
                            <div className="d-flex flex-wrap align-items-center gap-2">
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5a7a65", minWidth: 52 }}>
                                    {book === "textbook" ? `บทที่ ${si + 1}` : `หมวด ${si + 1}`}
                                </span>
                                {book === "handbook" && (
                                    <div className="d-flex align-items-center gap-1">
                                        <span className="d-inline-flex align-items-center justify-content-center" style={{ width: 34, height: 34, borderRadius: 9, background: "#edfaf3", color: "#1e7a47" }}>
                                            <Icon size={16} aria-hidden="true" />
                                        </span>
                                        <select
                                            value={s.icon ?? DEFAULT_ICON}
                                            onChange={(e) => update(s.key, { icon: e.target.value })}
                                            className="form-select form-select-sm"
                                            aria-label="ไอคอนของหมวด"
                                            style={{ ...INPUT_STYLE, width: 130, padding: "6px 28px 6px 10px", fontSize: 13 }}
                                        >
                                            {Object.entries(SECTION_ICONS).map(([name, { label }]) => (
                                                <option key={name} value={name}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <input
                                    value={s.title}
                                    onChange={(e) => update(s.key, { title: e.target.value })}
                                    placeholder={`ชื่อ${sectionLabel} เช่น ${book === "handbook" ? "การประเมินคาร์บอน" : "ความรู้เบื้องต้นเกี่ยวกับคาร์บอน"}`}
                                    aria-label={`ชื่อ${sectionLabel}ที่ ${si + 1}`}
                                    style={{ ...INPUT_STYLE, flex: "1 1 220px", fontWeight: 600 }}
                                />
                                <div className="d-flex gap-1 ms-auto">
                                    <button type="button" style={ICON_BUTTON_STYLE} disabled={si === 0} onClick={() => moveSection(si, -1)} aria-label={`เลื่อน${sectionLabel}ขึ้น`} title={`เลื่อน${sectionLabel}ขึ้น`}>
                                        <i className="bi bi-arrow-up" />
                                    </button>
                                    <button type="button" style={ICON_BUTTON_STYLE} disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)} aria-label={`เลื่อน${sectionLabel}ลง`} title={`เลื่อน${sectionLabel}ลง`}>
                                        <i className="bi bi-arrow-down" />
                                    </button>
                                    <button
                                        type="button"
                                        style={{ ...ICON_BUTTON_STYLE, color: s.pages.length ? "#cbd5e1" : "#c53030" }}
                                        disabled={s.pages.length > 0}
                                        onClick={() => removeSection(s.key)}
                                        aria-label={`ลบ${sectionLabel}`}
                                        title={s.pages.length ? `ลบได้เมื่อไม่มี${pageLabel}เหลือ — ย้ายหรือลบ${pageLabel}ก่อน` : `ลบ${sectionLabel}`}
                                    >
                                        <i className="bi bi-trash" />
                                    </button>
                                </div>
                            </div>
                            {error && <div style={ERROR_STYLE}>{error}</div>}

                            {/* Pages */}
                            {s.pages.length === 0 ? (
                                <div className="mt-2 px-3 py-2" style={{ fontSize: 12.5, color: "#94a3b8", border: "1px dashed #e6f0ea", borderRadius: 10 }}>
                                    ยังไม่มี{pageLabel} — สร้างจากหน้ารายการ หรือเลื่อน{pageLabel}จาก{sectionLabel}ข้างเคียงมาที่นี่
                                </div>
                            ) : (
                                <ol className="list-unstyled m-0 mt-2 d-flex flex-column gap-1">
                                    {s.pages.map((p, pi) => {
                                        const first = si === 0 && pi === 0;
                                        const last = si === sections.length - 1 && pi === s.pages.length - 1;
                                        return (
                                            <li key={p.id} className="d-flex align-items-center gap-2 px-3 py-2" style={{ background: "#fcfdfc", border: "1px solid #eef4f0", borderRadius: 10 }}>
                                                <span style={{ fontSize: 12.5, color: "#5a7a65", minWidth: 34, fontVariantNumeric: "tabular-nums" }}>
                                                    {book === "textbook" ? `${si + 1}.${pi + 1}` : `${pi + 1}.`}
                                                </span>
                                                <span className="flex-grow-1" style={{ fontSize: 13.5, color: "#1a3d2b", overflowWrap: "anywhere" }}>
                                                    {p.title}
                                                    {!p.published && <span className="ms-2" style={{ fontSize: 11, color: "#94a3b8" }}>(ซ่อนอยู่)</span>}
                                                </span>
                                                <button type="button" style={ICON_BUTTON_STYLE} disabled={first} onClick={() => movePage(si, pi, -1)} aria-label={`เลื่อน ${p.title} ขึ้น`} title={pi === 0 ? `ย้ายไปท้าย${sectionLabel}ก่อนหน้า` : "เลื่อนขึ้น"}>
                                                    <i className={`bi ${pi === 0 ? "bi-box-arrow-in-up" : "bi-arrow-up"}`} />
                                                </button>
                                                <button type="button" style={ICON_BUTTON_STYLE} disabled={last} onClick={() => movePage(si, pi, 1)} aria-label={`เลื่อน ${p.title} ลง`} title={pi === s.pages.length - 1 ? `ย้ายไปต้น${sectionLabel}ถัดไป` : "เลื่อนลง"}>
                                                    <i className={`bi ${pi === s.pages.length - 1 ? "bi-box-arrow-in-down" : "bi-arrow-down"}`} />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    );
                })}

                <button
                    type="button"
                    onClick={addSection}
                    className="btn"
                    style={{ border: "1px dashed #cfe3d6", borderRadius: 12, background: "#fff", color: "#1e7a47", padding: "12px", fontWeight: 600, fontSize: "0.88rem" }}
                >
                    <i className="bi bi-plus-lg me-1" />เพิ่ม{sectionLabel}
                </button>
            </div>

            {/* ── Save bar ── */}
            <div className="d-flex flex-column align-items-end gap-2 mt-4">
                {removedCount > 0 && (
                    <div style={{ fontSize: 12.5, color: "#b45309" }}>
                        <i className="bi bi-exclamation-triangle me-1" />จะลบ {removedCount} {sectionLabel}ที่ว่างอยู่เมื่อบันทึก
                    </div>
                )}
                {attempted && hasErrors && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />กรุณากรอกชื่อ{sectionLabel}ให้ครบก่อนบันทึก
                    </div>
                )}
                {saveError && (
                    <div style={{ fontSize: 12.5, color: "#dc2626" }}>
                        <i className="bi bi-exclamation-circle me-1" />{saveError}
                    </div>
                )}
                <div className="d-flex gap-2">
                    <Link href={backHref} className="btn" style={SECONDARY_BUTTON_STYLE}>ยกเลิก</Link>
                    <button type="button" onClick={handleSave} disabled={saving} className="btn" style={PRIMARY_BUTTON_STYLE}>
                        {saving
                            ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                            : "บันทึกสารบัญ"}
                    </button>
                </div>
            </div>
        </>
    );
}
