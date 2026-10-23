"use client";

// Publish / hide toggle for one blog post.
export default function PublishSwitch({ published, disabled, onChange }: {
    published: boolean;
    disabled: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="d-flex align-items-center gap-2">
            <button
                type="button"
                role="switch"
                aria-checked={published}
                aria-label={published ? "เผยแพร่อยู่ — คลิกเพื่อซ่อน" : "ซ่อนอยู่ — คลิกเพื่อเผยแพร่"}
                disabled={disabled}
                onClick={() => onChange(!published)}
                style={{
                    position: "relative", width: 40, height: 22, flexShrink: 0,
                    borderRadius: 999, border: "none", padding: 0,
                    background: published ? "#1e7a47" : "#cbd5e1",
                    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
                    transition: "background 0.2s",
                }}
            >
                <span
                    style={{
                        position: "absolute", top: 3, left: published ? 21 : 3,
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 0.2s",
                    }}
                />
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: published ? "#1e7a47" : "#94a3b8", whiteSpace: "nowrap" }}>
                {published ? "เผยแพร่" : "ซ่อน"}
            </span>
        </div>
    );
}
