"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTag, sameTag, tagProblem } from "@/app/(main)/(landing)/kitty/blog/tags";

// Tag chip input with auto-complete from tbl_blog_tag (GET /api/rnd/blog-tags).
//   Enter / comma — add the highlighted suggestion, or what's typed
//   Backspace on an empty box — remove the last chip
//   ↑ ↓ — move through suggestions · Esc — close them

type Suggestion = { name: string; uses: number };

export default function TagInput({ value, onChange }: {
    value: string[];
    onChange: (tags: string[]) => void;
}) {
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState("");
    const [open, setOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [active, setActive] = useState(0);
    const [problem, setProblem] = useState<string | null>(null);

    const typed = normalizeTag(draft);

    // ── Fetch suggestions (debounced) while the box is open ──
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`/api/rnd/blog-tags/?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
                .then((res) => (res.ok ? res.json() : { tags: [] }))
                .then((data) => setSuggestions(data.tags ?? []))
                .catch(() => { /* aborted or offline — keep the old list */ });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [typed, open]);

    // Options: matching tags not already chosen, then "add new" for what's typed.
    // Re-filtered by the current text, so a reply still in flight for an
    // older query can't put a non-matching tag under Enter.
    const options: { name: string; isNew: boolean; uses?: number }[] = suggestions
        .filter((s) => s.name.toLowerCase().includes(typed.toLowerCase()))
        .filter((s) => !value.some((v) => sameTag(v, s.name)))
        .map((s) => ({ name: s.name, isNew: false, uses: s.uses }));
    if (typed && !suggestions.some((s) => sameTag(s.name, typed)) && !value.some((v) => sameTag(v, typed))) {
        options.push({ name: typed, isNew: true });
    }
    const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
    const showList = open && options.length > 0 && value.length < MAX_TAGS;

    function add(raw: string) {
        const tag = normalizeTag(raw);
        // Reuse an existing tag's spelling when it differs only by case.
        const existing = suggestions.find((s) => sameTag(s.name, tag))?.name ?? tag;
        const why = tagProblem(existing, value);
        if (why) { setProblem(why); return; }
        onChange([...value, existing]);
        setDraft("");
        setActive(0);
        setProblem(null);
    }

    function remove(tag: string) {
        onChange(value.filter((t) => t !== tag));
        setProblem(null);
        inputRef.current?.focus();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (showList && options[activeIndex]) add(options[activeIndex].name);
            else if (typed) add(typed);
        } else if (e.key === "Backspace" && !draft && value.length) {
            remove(value[value.length - 1]);
        } else if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((activeIndex + 1) % options.length);
        } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setActive((activeIndex - 1 + options.length) % options.length);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    }

    return (
        <div style={{ position: "relative" }}>
            {/* Chips + text box, styled as one field */}
            <div
                onClick={() => inputRef.current?.focus()}
                className="d-flex flex-wrap align-items-center"
                style={{
                    gap: 6, minHeight: 42, padding: "6px 8px", cursor: "text",
                    border: `1px solid ${open ? "#1e7a47" : "#e6f0ea"}`, borderRadius: 10, background: "#fff",
                }}
            >
                {value.map((tag) => (
                    <span
                        key={tag}
                        className="d-inline-flex align-items-center"
                        style={{ gap: 4, background: "#edfaf3", color: "#1e7a47", border: "1px solid #cfe9db", borderRadius: 999, padding: "2px 4px 2px 10px", fontSize: 12.5, fontWeight: 500 }}
                    >
                        {tag}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); remove(tag); }}
                            aria-label={`ลบ Tag ${tag}`}
                            style={{ border: "none", background: "transparent", color: "#1e7a47", width: 18, height: 18, padding: 0, borderRadius: "50%", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                            <i className="bi bi-x" style={{ fontSize: 14 }} />
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value.slice(0, MAX_TAG_LENGTH + 5)); setOpen(true); setActive(0); setProblem(null); }}
                    onKeyDown={onKeyDown}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    disabled={value.length >= MAX_TAGS}
                    placeholder={value.length >= MAX_TAGS ? "" : value.length ? "เพิ่ม Tag…" : "พิมพ์แล้วกด Enter เช่น คาร์บอนเครดิต"}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
                    aria-label="Tag"
                    style={{ flex: "1 1 120px", minWidth: 120, border: "none", outline: "none", fontSize: 14, color: "#1a3d2b", padding: "4px 2px", background: "transparent" }}
                />
            </div>

            {/* Suggestions */}
            {showList && (
                <ul
                    id={listId}
                    role="listbox"
                    className="list-unstyled mb-0"
                    style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e6f0ea", borderRadius: 10, boxShadow: "0 8px 24px rgba(26,61,43,0.10)", padding: 4, maxHeight: 240, overflowY: "auto" }}
                >
                    {options.map((o, i) => (
                        <li
                            key={`${o.isNew}-${o.name}`}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={i === activeIndex}
                            // mousedown (not click) so the input keeps focus
                            onMouseDown={(e) => { e.preventDefault(); add(o.name); }}
                            onMouseEnter={() => setActive(i)}
                            className="d-flex align-items-center"
                            style={{ gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, color: "#1a3d2b", background: i === activeIndex ? "#edfaf3" : "transparent" }}
                        >
                            {o.isNew ? (
                                <>
                                    <i className="bi bi-plus-circle" style={{ color: "#1e7a47" }} />
                                    <span>เพิ่ม Tag ใหม่ &ldquo;<strong>{o.name}</strong>&rdquo;</span>
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-tag" style={{ color: "#5a7a65" }} />
                                    <span className="flex-grow-1">{o.name}</span>
                                    <span style={{ fontSize: 11.5, color: "#94a3b8" }}>{o.uses} บทความ</span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div className="d-flex justify-content-between" style={{ fontSize: 12, marginTop: 4 }}>
                <span style={{ color: problem ? "#dc2626" : "#94a3b8" }}>
                    {problem ?? "ใช้จัด “บทความที่เกี่ยวข้อง”: บทความที่มี Tag ตรงกันมากจะแสดงก่อน"}
                </span>
                <span style={{ color: "#94a3b8", whiteSpace: "nowrap", marginLeft: 8 }}>{value.length}/{MAX_TAGS}</span>
            </div>
        </div>
    );
}
