"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

// Look-and-feel shared by the KITTY content editors — blog (blog/…) and
// handbook / textbook pages (book/…): panel and field styles, the image
// picker, and blob: preview URLs for picked files.

export const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

export const FIELD_LABEL_STYLE: React.CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5a7a65",
    marginBottom: 4,
};

export const INPUT_STYLE: React.CSSProperties = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid #e6f0ea",
    background: "#fff",
    padding: "9px 12px",
    fontSize: 14,
    color: "#1a3d2b",
    outline: "none",
};

export const PANEL_STYLE: React.CSSProperties = {
    background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: 20,
};

export const ERROR_STYLE: React.CSSProperties = { fontSize: 12, color: "#dc2626", marginTop: 4 };

export const HINT_STYLE: React.CSSProperties = { fontSize: 12, color: "#94a3b8", marginTop: 4 };

export const ICON_BUTTON_STYLE: React.CSSProperties = {
    border: "1px solid #e6f0ea", borderRadius: 8, background: "#fff", color: "#5a7a65",
    width: 30, height: 30, padding: 0, fontSize: 13,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
};

export const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
    background: "#1e7a47", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px",
    fontWeight: 600, fontSize: "0.9rem", width: "auto", whiteSpace: "nowrap",
};

export const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
    border: "1px solid #e6f0ea", background: "#fff", color: "#1a3d2b", borderRadius: 10, padding: "10px 18px",
    fontWeight: 600, fontSize: "0.9rem", width: "auto", whiteSpace: "nowrap",
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The red "*" after a required field's label. */
export function Required() {
    return <span aria-hidden="true" style={{ color: "#dc2626" }}>*</span>;
}

/** แก้ไข / ตัวอย่าง tabs above an editor. */
export function ModeTabs({ mode, onChange }: { mode: "edit" | "preview"; onChange: (mode: "edit" | "preview") => void }) {
    return (
        <div className="d-flex align-items-center gap-1 mb-4" style={{ borderBottom: "1px solid #e6f0ea" }}>
            {([["edit", "แก้ไข", "bi-pencil"], ["preview", "ตัวอย่าง", "bi-eye"]] as const).map(([key, label, icon]) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => onChange(key)}
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
    );
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Why this file can't be used, or null if it's a JPG / PNG / WebP ≤ 5 MB. */
export function imageProblem(file: File): string | null {
    if (!IMAGE_TYPES.includes(file.type) || !IMAGE_EXTENSIONS.test(file.name)) {
        return `"${file.name}" ไม่ใช่ไฟล์ที่รองรับ — ใช้ได้เฉพาะ JPG, PNG หรือ WebP`;
    }
    if (file.size > MAX_IMAGE_BYTES) return `"${file.name}" มีขนาดเกิน 5 MB`;
    return null;
}

/** Name shown on an image the page already has (stored in the database, so
    it has no file name of its own). */
export const SAVED_IMAGE_LABEL = "รูปที่บันทึกไว้";

/** blob: URLs for picked images — revoked when replaced/removed (dropUrl)
    and when the editor unmounts. */
export function useObjectUrls() {
    const urls = useRef(new Set<string>());
    useEffect(() => {
        const current = urls.current;
        return () => current.forEach((u) => URL.revokeObjectURL(u));
    }, []);
    return {
        makeUrl(file: File) {
            const url = URL.createObjectURL(file);
            urls.current.add(url);
            return url;
        },
        dropUrl(url: string | null | undefined) {
            if (!url || !urls.current.has(url)) return;
            URL.revokeObjectURL(url);
            urls.current.delete(url);
        },
    };
}

// Click-to-pick image box with a preview of the chosen file.
export function ImagePicker({ src, fileName, height, error, onPick }: {
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
