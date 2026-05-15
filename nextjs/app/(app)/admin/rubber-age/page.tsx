"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Alert, Card, Eyebrow } from "@/app/components";
import RubberAgeMap from "./RubberAgeMap";
import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    type ChartItem,
} from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ─── Types ──────────────────────────────────────────────────────────────────

type ParcelRow = {
    id: number;
    farm_name: string;
    farm_idc: string;
    app_no: string;
    land_seq: number;
    tambon: string;
    amphoe_t: string;
    province: string;
    grow_year: number | null;
    rubber_age: number | null;
    gee_plant_year: number | null;
    gee_age: number | null;
    gee_confidence: number | null;
    rip_type: string;
    grow_area: string;
    geometry: GeoJSON.Geometry;
};

type BfastResult = {
    state: "idle" | "loading" | "done" | "error";
    plantingYear?: number | null;
    age?: number | null;
    confidence?: number;
    method?: "bfast" | "raster";
    reason?: string | null;
};

type FilterState = {
    province: string;
    amphoe_t: string;
};

const CURRENT_YEAR = new Date().getFullYear();

const REASON_LABELS: Record<string, string> = {
    no_valid_pixels:      "ไม่พบข้อมูลราสเตอร์",
    empty_window:         "แปลงเล็กเกินไปสำหรับราสเตอร์",
    outside_raster_extent:"นอกพื้นที่ราสเตอร์",
    raster_missing_crs:   "ราสเตอร์ไม่มี CRS",
    raster_invalid:       "ราสเตอร์ไม่ถูกต้อง",
};
const DEFAULT_FILTERS: FilterState = {
    province: "ระยอง",
    amphoe_t: "",
};

function bboxFromGeometry(g: GeoJSON.Geometry): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const push = (x: number, y: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        has = true;
    };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let has = false;

    const walk = (coords: any) => {
        if (!coords) return;
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
            push(coords[0], coords[1]);
            return;
        }
        if (Array.isArray(coords)) {
            for (const c of coords) walk(c);
        }
    };

    if (g.type === "Polygon" || g.type === "MultiPolygon" || g.type === "LineString" || g.type === "MultiLineString") {
        walk(g.coordinates);
    } else if (g.type === "Point") {
        const [x, y] = g.coordinates;
        push(x, y);
    } else if (g.type === "MultiPoint") {
        walk(g.coordinates);
    } else if (g.type === "GeometryCollection") {
        for (const gg of g.geometries ?? []) {
            const b = bboxFromGeometry(gg);
            if (b) {
                push(b.minX, b.minY);
                push(b.maxX, b.maxY);
            }
        }
    }

    return has ? { minX, minY, maxX, maxY } : null;
}

function bboxPolygon(b: { minX: number; minY: number; maxX: number; maxY: number }): GeoJSON.Polygon {
    return {
        type: "Polygon",
        coordinates: [[
            [b.minX, b.minY],
            [b.maxX, b.minY],
            [b.maxX, b.maxY],
            [b.minX, b.maxY],
            [b.minX, b.minY],
        ]],
    };
}

function fmt(v: unknown) {
    return v == null || v === "" ? "—" : String(v);
}

function formatThaiYear(year: number | null | undefined) {
    if (year == null) return "—";
    return year >= 2400 ? String(year) : String(year + 543);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminRubberAgePage() {
    const router = useRouter();
    const { ready, user } = useAuth();

    // Guard: admin only
    useEffect(() => {
        if (ready && (!user || user.role !== "admin")) {
            router.replace("/");
        }
    }, [ready, user, router]);

    // ── Parcel list state ──
    const [parcels, setParcels] = useState<ParcelRow[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [fetchingParcels, setFetchingParcels] = useState(false);
    const [parcelErr, setParcelErr] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

    // ── Filter dropdown options ──
    const [provinceOptions, setProvinceOptions] = useState<string[]>([]);
    const [amphoeOptions, setAmphoeOptions] = useState<string[]>([]);

    useEffect(() => {
        fetch("/api/admin/parcels/filters", { credentials: "include" })
            .then((r) => r.json())
            .then((d: { provinces?: string[] }) => setProvinceOptions(d.provinces ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!filters.province) { setAmphoeOptions([]); return; }
        fetch(`/api/admin/parcels/filters?province=${encodeURIComponent(filters.province)}`, { credentials: "include" })
            .then((r) => r.json())
            .then((d: { amphoe_ts?: string[] }) => setAmphoeOptions(d.amphoe_ts ?? []))
            .catch(() => {});
    }, [filters.province]);

    // ── Selection state ──
    const [selected, setSelected] = useState<Set<number>>(new Set()); // Set of parcel `id`

    // ── BFAST state ──
    const [bfastMap, setBfastMap] = useState<Record<number, BfastResult>>({}); // keyed by parcel id
    const [bfastRunning, setBfastRunning] = useState(false);
    const [bfastProgress, setBfastProgress] = useState({ done: 0, total: 0 });

    // ── Method ──
    const [calcMethod, setCalcMethod] = useState<"raster" | "bfast">("raster");

    // ── DB update state ──
    const [updating, setUpdating] = useState(false);
    const [updateMsg, setUpdateMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // ── Raster generation state ──
    const [rasterGenerating, setRasterGenerating] = useState(false);
    const [rasterMsg, setRasterMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [rasterReady, setRasterReady] = useState(false);
    const [rasterFilename, setRasterFilename] = useState("rubber_age_selected_area.tif");
    const [rasterTileUrl, setRasterTileUrl] = useState<string | null>(null);
    const [focusedParcelId, setFocusedParcelId] = useState<number | null>(null);

    // ── Chart ──
    const chartRef = useRef<Chart | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ── Derive BFAST-done rows ──
    const bfastDoneCount = Object.values(bfastMap).filter((r) => r.state === "done").length;

    // ── Fetch parcels ──
    const fetchParcels = useCallback(async (override?: Partial<FilterState>) => {
        const active = { ...filters, ...(override ?? {}) };
        setFetchingParcels(true);
        setParcelErr(null);
        setParcels([]);
        setTotal(null);
        setSelected(new Set());
        setBfastMap({});
        setUpdateMsg(null);
        setRasterMsg(null);
        setRasterReady(false);
        setRasterTileUrl(null);

        const sp = new URLSearchParams();
        if (active.province.trim()) sp.set("province", active.province.trim());
        if (active.amphoe_t.trim()) sp.set("amphoe_t", active.amphoe_t.trim());
        sp.set("limit", "2000");

        try {
            const res = await fetch(`/api/admin/parcels?${sp.toString()}`, {
                credentials: "include",
            });
            const data = await res.json() as {
                features?: Array<{ properties: ParcelRow; geometry: GeoJSON.Geometry }>;
                total?: number;
                error?: string;
            };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            const rows = (data.features ?? []).map((f) => ({
                ...f.properties,
                geometry: f.geometry,
            }));
            setParcels(rows);
            setSelected(new Set(rows.slice(0, 100).map((p) => p.id)));
            setTotal(data.total ?? rows.length);
        } catch (err) {
            setParcelErr(err instanceof Error ? err.message : String(err));
        } finally {
            setFetchingParcels(false);
        }
    }, [filters]);

    // Initial load
    useEffect(() => {
        if (!ready || !user || user.role !== "admin") return;
        if (fetchingParcels || total !== null) return;
        fetchParcels();
    }, [ready, user, fetchParcels, fetchingParcels, total]);

    // Auto-fetch when filters change (skip first render — initial load handles it)
    const filtersMountedRef = useRef(false);
    useEffect(() => {
        if (!filtersMountedRef.current) { filtersMountedRef.current = true; return; }
        if (!ready || !user || user.role !== "admin") return;
        fetchParcels();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    // ── Chart: age distribution from GEE+BFAST results ──
    useEffect(() => {
        if (!canvasRef.current) return;
        chartRef.current?.destroy();

        const ages = Object.values(bfastMap)
            .filter((r) => r.state === "done" && r.age != null)
            .map((r) => Number(r.age))
            .filter((a) => a > 0);
        if (ages.length === 0) return;

        const brackets = [0, 0, 0, 0, 0];
        for (const a of ages) {
            if (a <= 5) brackets[0]++;
            else if (a <= 10) brackets[1]++;
            else if (a <= 15) brackets[2]++;
            else if (a <= 20) brackets[3]++;
            else brackets[4]++;
        }

        chartRef.current = new Chart(canvasRef.current as unknown as ChartItem, {
            type: "bar",
            data: {
                labels: ["0–5 ปี", "6–10 ปี", "11–15 ปี", "16–20 ปี", "20+ ปี"],
                datasets: [{
                    data: brackets,
                    backgroundColor: [
                        "rgba(16,185,129,0.8)",
                        "rgba(5,150,105,0.8)",
                        "rgba(4,120,87,0.8)",
                        "rgba(217,119,6,0.8)",
                        "rgba(180,83,9,0.8)",
                    ],
                    borderRadius: 5,
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.05)" } },
                },
            },
        });

        return () => { chartRef.current?.destroy(); chartRef.current = null; };
    }, [bfastMap]);

    // ── GEE+BFAST calculation ──
    const runBfast = useCallback(async (ids: Set<number>) => {
        const targets = parcels.filter((p) => ids.has(p.id));
        if (targets.length === 0 || bfastRunning) return;

        setBfastRunning(true);
        setBfastProgress({ done: 0, total: targets.length });

        // Mark all loading
        setBfastMap((prev) => {
            const next = { ...prev };
            for (const p of targets) next[p.id] = { state: "loading", method: "bfast" };
            return next;
        });

        // Chunk into groups of 10 to avoid huge requests
        const CHUNK = 10;
        let done = 0;
        for (let i = 0; i < targets.length; i += CHUNK) {
            const chunk = targets.slice(i, i + CHUNK);
            const features = chunk.map((p) => ({
                plot_id: String(p.farm_idc ?? p.id),
                geometry: p.geometry,
            }));

            try {
                const res = await fetch("/api/rubber-age/bfast", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        features,
                        startDate: "2017-01-01",
                        endDate: new Date().toISOString().slice(0, 10),
                        currentYear: CURRENT_YEAR,
                        maxPlots: features.length,
                    }),
                });
                const data = await res.json() as {
                    rows?: Array<Record<string, unknown>>;
                    error?: string;
                };

                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

                const byPlot = new Map<string, Record<string, unknown>>();
                for (const row of data.rows ?? []) {
                    byPlot.set(String(row.plot_id ?? ""), row);
                }

                setBfastMap((prev) => {
                    const next = { ...prev };
                    for (const p of chunk) {
                        const pid = String(p.farm_idc ?? p.id);
                        const row = byPlot.get(pid);
                        if (!row) {
                            next[p.id] = { state: "error" };
                        } else {
                            next[p.id] = {
                                state: "done",
                                method: "bfast",
                                plantingYear: row.planting_year == null ? null : Number(row.planting_year),
                                age: row.age == null ? null : Number(row.age),
                                confidence: Number(row.confidence ?? 0),
                            };
                        }
                    }
                    return next;
                });
            } catch {
                setBfastMap((prev) => {
                    const next = { ...prev };
                    for (const p of chunk) next[p.id] = { state: "error" };
                    return next;
                });
            }

            done += chunk.length;
            setBfastProgress({ done, total: targets.length });
        }

        setBfastRunning(false);
    }, [parcels, bfastRunning]);

    // ── Raster sampling calculation (raster-first → reduce per parcel) ──
    const runRasterSample = useCallback(async (ids: Set<number>) => {
        const targets = parcels.filter((p) => ids.has(p.id));
        if (targets.length === 0 || bfastRunning) return;

        setBfastRunning(true);
        setBfastProgress({ done: 0, total: targets.length });

        setBfastMap((prev) => {
            const next = { ...prev };
            for (const p of targets) next[p.id] = { state: "loading", method: "raster" };
            return next;
        });

        const CHUNK = 20;
        let done = 0;
        for (let i = 0; i < targets.length; i += CHUNK) {
            const chunk = targets.slice(i, i + CHUNK);

            await Promise.all(chunk.map(async (p) => {
                try {
                    const res = await fetch("/api/rubber-age/from-raster", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            geometry: p.geometry,
                            rasterFilename,
                        }),
                    });
                    const data = await res.json() as {
                        planting_year?: number | null;
                        rubber_age?: number | null;
                        confidence?: number | null;
                        reason?: string | null;
                        error?: string;
                    };
                    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

                    setBfastMap((prev) => ({
                        ...prev,
                        [p.id]: {
                            state: "done",
                            method: "raster",
                            plantingYear: data.planting_year == null ? null : Number(data.planting_year),
                            age: data.rubber_age == null ? null : Number(data.rubber_age),
                            confidence: data.confidence == null ? 0 : Math.max(0, Math.min(1, Number(data.confidence) / 100)),
                            reason: data.reason ?? null,
                        },
                    }));
                } catch {
                    setBfastMap((prev) => ({ ...prev, [p.id]: { state: "error", method: "raster" } }));
                }
            }));

            done += chunk.length;
            setBfastProgress({ done, total: targets.length });
        }

        setBfastRunning(false);
    }, [parcels, bfastRunning, rasterFilename]);

    const generateRasterInGee = useCallback(async () => {
        if (rasterGenerating || bfastRunning || updating) return;
        setRasterGenerating(true);
        setRasterMsg(null);
        setRasterReady(false);
        try {
            const targets = parcels.filter((p) => selected.has(p.id));
            if (targets.length === 0) throw new Error("กรุณาเลือกแปลงก่อนสร้าง Raster");
            let bbox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
            for (const p of targets) {
                const b = bboxFromGeometry(p.geometry);
                if (!b) continue;
                if (!bbox) bbox = { ...b };
                else {
                    bbox.minX = Math.min(bbox.minX, b.minX);
                    bbox.minY = Math.min(bbox.minY, b.minY);
                    bbox.maxX = Math.max(bbox.maxX, b.maxX);
                    bbox.maxY = Math.max(bbox.maxY, b.maxY);
                }
            }
            if (!bbox) throw new Error("ไม่พบ geometry สำหรับสร้าง Raster");

            // Add small padding to bbox (degrees) to avoid edge clipping.
            const pad = 0.02;
            bbox = { minX: bbox.minX - pad, minY: bbox.minY - pad, maxX: bbox.maxX + pad, maxY: bbox.maxY + pad };
            const regionGeojson = bboxPolygon(bbox);

            const res = await fetch("/api/rubber-age/bfast-raster/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    regionGeojson,
                    filename: "rubber_age_selected_area",
                    exportMode: "download",
                    scale: 30,
                }),
            });
            const data = await res.json() as { saved_filename?: string; saved_path?: string; tile_url?: string; error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setRasterMsg({
                ok: true,
                text: `สร้าง Raster สำเร็จ: ${data.saved_filename ?? "rubber_age_selected_area.tif"}`,
            });
            setRasterFilename(data.saved_filename ?? "rubber_age_selected_area.tif");
            setRasterTileUrl(data.tile_url ?? null);
            setRasterReady(true);
        } catch (err) {
            setRasterMsg({
                ok: false,
                text: err instanceof Error ? err.message : "สร้าง Raster ไม่สำเร็จ",
            });
        } finally {
            setRasterGenerating(false);
        }
    }, [rasterGenerating, bfastRunning, updating, parcels, selected]);

    // ── DB update ──
    const saveToDb = useCallback(async () => {
        const updates = parcels
            .filter((p) => {
                const r = bfastMap[p.id];
                return selected.has(p.id) && r?.state === "done" && r.age != null;
            })
            .map((p) => {
                const r = bfastMap[p.id]!;
                return {
                    id: p.id,
                    rubber_age: r.age as number,
                    gee_plant_year: r.plantingYear ?? null,
                    gee_age: r.age ?? null,
                    gee_confidence: r.confidence ?? null,
                };
            });

        if (updates.length === 0) return;
        setUpdating(true);
        setUpdateMsg(null);

        try {
            const res = await fetch("/api/admin/rubber-age", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ updates }),
            });
            const data = await res.json() as { updated?: number; error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

            // Update local parcels array with new values
            setParcels((prev) =>
                prev.map((p) => {
                    const u = updates.find((x) => x.id === p.id);
                    if (!u) return p;
                    return {
                        ...p,
                        rubber_age: Math.round(u.rubber_age),
                        gee_plant_year: u.gee_plant_year != null ? Math.round(u.gee_plant_year) : p.gee_plant_year,
                        gee_age: u.gee_age != null ? Math.round(u.gee_age) : p.gee_age,
                        gee_confidence: u.gee_confidence ?? p.gee_confidence,
                    };
                }),
            );
            setUpdateMsg({ text: `อัปเดตสำเร็จ ${data.updated} แปลง`, ok: true });
        } catch (err) {
            setUpdateMsg({ text: err instanceof Error ? err.message : "เกิดข้อผิดพลาด", ok: false });
        } finally {
            setUpdating(false);
        }
    }, [parcels, bfastMap, selected]);

    // ── Selection helpers ──
    const toggleOne = (id: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const toggleAll = () =>
        setSelected((prev) =>
            prev.size === parcels.length ? new Set() : new Set(parcels.map((p) => p.id)),
        );

    // ── Guard render ──
    if (!ready || !user) {
        return (
            <div className="container py-5 text-center">
                <div className="spinner-border text-success" role="status" />
            </div>
        );
    }

    if (user.role !== "admin") return null;

    // ── Helpers for stats ──
    const computedAges = Object.values(bfastMap)
        .filter((r) => r.state === "done" && r.age != null)
        .map((r) => Number(r.age));

    const avgAge = computedAges.length > 0
        ? (computedAges.reduce((sum, age) => sum + age, 0) / computedAges.length).toFixed(1)
        : "—";

    const readyToSaveCount = parcels.filter(
        (p) => selected.has(p.id) && bfastMap[p.id]?.state === "done" && bfastMap[p.id]?.age != null,
    ).length;

    const selectedCount = selected.size;
    const selectedIds = new Set(Array.from(selected));
    const selectedDone = parcels.filter((p) => selectedIds.has(p.id) && bfastMap[p.id]?.state === "done").length;
    const selectedError = parcels.filter((p) => selectedIds.has(p.id) && bfastMap[p.id]?.state === "error").length;
    const selectedPending = Math.max(selectedCount - selectedDone - selectedError, 0);

    // ─── JSX ────────────────────────────────────────────────────────────────
    return (
        <div className="container py-5" style={{ marginTop: "60px" }}>

            {/* Header */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div
                    className="p-4 p-md-5"
                    style={{
                        background:
                            "radial-gradient(1200px 500px at -10% -10%, rgba(16,185,129,0.20) 0%, rgba(16,185,129,0) 60%)," +
                            "radial-gradient(900px 450px at 110% 0%, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 58%)," +
                            "radial-gradient(700px 360px at 30% 120%, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0) 55%)," +
                            "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.86) 100%)",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                    }}
                >
                    <div>
                        <h1 className="fw-bold mb-3" style={{ letterSpacing: "-0.02em" }}>
                            คำนวณอายุต้นยาง
                        </h1>
                        <div className="row g-3" style={{ fontSize: 12.5 }}>
                                {/* Raster */}
                                <div className="col-md-6">
                                <div className="p-3 rounded-3 h-100" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)" }}>
                                    <div className="fw-bold mb-2" style={{ color: "#065f46", fontSize: 13 }}>
                                        Raster
                                        <span className="fw-normal text-muted ms-2" style={{ fontSize: 11 }}>pixel-wise บน GEE · เร็ว · แนะนำ</span>
                                    </div>
                                    <div className="text-muted mb-2" style={{ lineHeight: 1.7 }}>
                                        คำนวณ NDVI median รายปี (Landsat 5/7/8/9, ช่วง Nov–Apr) ครอบทั้งพื้นที่พร้อมกัน
                                        แล้วหา <strong style={{ color: "#374151" }}>ปีที่ score สูงสุด</strong> ในแต่ละ pixel
                                    </div>
                                    <code style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 4, padding: "4px 8px", color: "#374151", display: "block", marginBottom: 8 }}>
                                        score = 0.4×pre_bare + 0.4×post_green + 0.2×level_jump
                                    </code>
                                    <div className="text-muted" style={{ lineHeight: 1.75 }}>
                                        <div>· <span className="fw-medium" style={{ color: "#374151" }}>pre_bare</span> — NDVI เฉลี่ย 2 ปีก่อน ต่ำ หมายถึงดินโล่ง/พึ่งโค่น</div>
                                        <div>· <span className="fw-medium" style={{ color: "#374151" }}>post_green</span> — NDVI เฉลี่ย 2 ปีหลัง สูง หมายถึงต้นไม้เริ่มฟื้นตัว</div>
                                        <div>· <span className="fw-medium" style={{ color: "#374151" }}>level_jump</span> — ส่วนต่างระหว่าง post และ pre</div>
                                    </div>
                                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(16,185,129,0.15)", color: "#374151" }}>
                                        ข้อมูล Landsat ย้อนหลังถึงปี 2000 · ความแม่นยำระดับ <strong>ปี</strong>
                                    </div>
                                </div>
                                </div>
                                {/* BFAST */}
                                <div className="col-md-6">
                                <div className="p-3 rounded-3 h-100" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)" }}>
                                    <div className="fw-bold mb-2" style={{ color: "#1e40af", fontSize: 13 }}>
                                        BFAST
                                        <span className="fw-normal text-muted ms-2" style={{ fontSize: 11 }}>รายแปลง · ช้ากว่า</span>
                                    </div>
                                    <div className="text-muted mb-2" style={{ lineHeight: 1.7 }}>
                                        ดึง NDVI mean รายปี (Landsat Nov–Apr) ของแต่ละแปลงแยกกัน
                                        แล้วหา <strong style={{ color: "#374151" }}>breakpoint</strong> ด้วย sliding window 2 ปี pre/post
                                    </div>
                                    <code style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 4, padding: "4px 8px", color: "#374151", display: "block", marginBottom: 8 }}>
                                        score = 0.4×pre_bare + 0.4×post_green + 0.2×level_jump
                                    </code>
                                    <div className="text-muted" style={{ lineHeight: 1.75 }}>
                                        <div>· ใช้ score formula เดียวกับ Raster แต่คำนวณต่อแปลง ไม่ใช่ต่อ pixel</div>
                                        <div>· ต้องมีข้อมูลอย่างน้อย 6 ปีที่ถ่ายได้ (ไม่มีเมฆ) จึงจะตรวจได้</div>
                                        <div>· score ต้องผ่าน threshold 0.35 จึงถือว่าพบ breakpoint</div>
                                    </div>
                                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(59,130,246,0.15)", color: "#374151" }}>
                                        ข้อมูล Landsat ย้อนหลังถึงปี 2000 · ความแม่นยำระดับ <strong>ปี</strong>
                                    </div>
                                </div>
                                </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Filters (collapsible) */}
            <Card className="border-0 shadow-sm mb-4">
                <details open className="p-3 p-md-4">
                    <summary
                        className="d-flex align-items-center justify-content-between"
                        style={{ cursor: "pointer", listStyle: "none" }}
                    >
                        <div className="d-flex align-items-center gap-2">
                            <span className="badge rounded-pill text-bg-dark">Step 1</span>
                            <i className="bi bi-funnel text-success" />
                            <div className="fw-bold">ตัวกรองแปลง</div>
                            <div className="small text-muted d-none d-md-inline">กรองก่อนคำนวณเพื่อลดเวลา</div>
                        </div>
                        <span className="small text-muted">คลิกเพื่อย่อ/ขยาย</span>
                    </summary>

                    <div className="mt-3 row g-2 align-items-end">
                        <div className="col-md-5">
                            <label className="form-label small mb-1">จังหวัด</label>
                            <select
                                className="form-select form-select-sm"
                                value={filters.province}
                                disabled={fetchingParcels || bfastRunning || updating}
                                onChange={(e) => setFilters((prev) => ({ ...prev, province: e.target.value, amphoe_t: "" }))}
                            >
                                <option value="">ทุกจังหวัด</option>
                                {provinceOptions.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-5">
                            <label className="form-label small mb-1">อำเภอ</label>
                            <select
                                className="form-select form-select-sm"
                                value={filters.amphoe_t}
                                disabled={!filters.province || amphoeOptions.length === 0 || fetchingParcels || bfastRunning || updating}
                                onChange={(e) => setFilters((prev) => ({ ...prev, amphoe_t: e.target.value }))}
                            >
                                <option value="">ทุกอำเภอ</option>
                                {amphoeOptions.map((a) => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-2 d-flex align-items-end gap-2">
                            {fetchingParcels && (
                                <span className="spinner-border spinner-border-sm text-success" style={{ width: 16, height: 16 }} />
                            )}
                            <button
                                className="btn btn-sm"
                                disabled={fetchingParcels || bfastRunning || updating}
                                onClick={() => setFilters(DEFAULT_FILTERS)}
                                title="ล้างตัวกรอง"
                                style={{
                                    borderRadius: 8,
                                    border: "1.5px solid #d1d5db",
                                    background: "white",
                                    color: "#6b7280",
                                    fontWeight: 500,
                                    padding: "5px 14px",
                                    transition: "all 0.15s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                <i className="bi bi-x-circle me-1" />ล้างตัวกรอง
                            </button>
                        </div>
                    </div>
                    {parcels.length > 0 && (
                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                            <span className="small text-muted">
                                เลือกแล้ว{" "}
                                <span className="fw-semibold" style={{ color: "#065f46" }}>{selected.size.toLocaleString()}</span>
                                {" "}/ โหลดมา{" "}
                                <span className="fw-semibold" style={{ color: "#111827" }}>{parcels.length.toLocaleString()}</span>
                                {total !== null && total > parcels.length && (
                                    <> / ทั้งหมด <span className="fw-semibold" style={{ color: "#111827" }}>{total.toLocaleString()}</span></>
                                )}
                                {" "}แปลง
                            </span>
                        </div>
                    )}
                </details>
            </Card>

            {/* ── Messages ── */}
            {parcelErr && (
                <Alert type="error" className="mb-3">
                    <div className="d-flex align-items-start justify-content-between gap-3 w-100">
                        <div>{parcelErr}</div>
                        <button className="btn btn-sm btn-light border" onClick={() => setParcelErr(null)}>
                            ปิด
                        </button>
                    </div>
                </Alert>
            )}
            {updateMsg && (
                <Alert type={updateMsg.ok ? "success" : "error"} className="mb-3">
                    <div className="d-flex align-items-start justify-content-between gap-3 w-100">
                        <div>{updateMsg.text}</div>
                        <button className="btn btn-sm btn-light border" onClick={() => setUpdateMsg(null)}>
                            ปิด
                        </button>
                    </div>
                </Alert>
            )}

            {/* ── Results ── */}
            {total !== null && (
                <>
                    {/* Stats row */}
                    <div className="row g-3 mb-4">
                        <div className="col-sm-3">
                            <Card className="border-0 shadow-sm h-100">
                                <div className="p-3 text-center">
                                    <div className="fs-3 fw-bold text-success">{total.toLocaleString()}</div>
                                    <div className="small text-muted">แปลงทั้งหมดในฐานข้อมูล</div>
                                </div>
                            </Card>
                        </div>
                        <div className="col-sm-3">
                            <Card className="border-0 shadow-sm h-100">
                                <div className="p-3 text-center">
                                    <div className="fs-3 fw-bold text-primary">{parcels.length.toLocaleString()}</div>
                                    <div className="small text-muted">แปลงที่โหลดมา</div>
                                </div>
                            </Card>
                        </div>
                        <div className="col-sm-3">
                            <Card className="border-0 shadow-sm h-100">
                                <div className="p-3 text-center">
                                    <div className="fs-3 fw-bold text-warning">{avgAge}</div>
                                    <div className="small text-muted">อายุเฉลี่ย (ปี, GEE+BFAST)</div>
                                </div>
                            </Card>
                        </div>
                        <div className="col-sm-3">
                            <Card className="border-0 shadow-sm h-100">
                                <div className="p-3 text-center">
                                    <div className="fs-3 fw-bold text-danger">{bfastDoneCount.toLocaleString()}</div>
                                    <div className="small text-muted">แปลงที่คำนวณแล้ว (GEE+BFAST)</div>
                                </div>
                            </Card>
                        </div>
                    </div>

                    {/* Chart */}
                    {parcels.length > 0 && (
                        <Card className="border-0 shadow-sm mb-4">
                            <div className="p-4">
                                <h6 className="fw-bold mb-3">
                                    <i className="bi bi-bar-chart-line me-2 text-success"></i>การกระจายอายุต้นยาง (GEE+BFAST)
                                </h6>
                                <canvas ref={canvasRef} height={80} />
                            </div>
                        </Card>
                    )}

                    {/* Guided steps */}
                    {total !== null && (
                        <div className="mb-3">
                            <Card className="border-0 shadow-sm">
                                <div className="p-3 p-md-4">
                                    <div className="row g-3">
                                        {/* Step 2 */}
                                        <div className="col-12 col-lg-4">
                                            <div className="p-3 rounded-4 border h-100" style={{ background: "rgba(240,253,244,0.55)" }}>
                                                <div className="d-flex align-items-center justify-content-between mb-2">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="badge rounded-pill text-bg-dark">Step 2</span>
                                                        <span className="fw-semibold">สร้าง Raster ใน GEE</span>
                                                    </div>
                                                    <span className={`badge rounded-pill ${rasterReady ? "text-bg-success" : "text-bg-light border"}`}>
                                                        {rasterReady ? "พร้อมใช้" : "ยังไม่พร้อม"}
                                                    </span>
                                                </div>

                                                <div className="d-grid gap-2">
                                                    <button
                                                        className="btn"
                                                        disabled={rasterGenerating || bfastRunning || updating || selected.size === 0}
                                                        onClick={generateRasterInGee}
                                                        style={{
                                                            background: (rasterGenerating || bfastRunning || updating || selected.size === 0)
                                                                ? "#d1fae5"
                                                                : "linear-gradient(135deg, #065f46 0%, #059669 100%)",
                                                            color: (rasterGenerating || bfastRunning || updating || selected.size === 0) ? "#6b7280" : "white",
                                                            border: "none",
                                                            borderRadius: 10,
                                                            padding: "9px 16px",
                                                            fontWeight: 600,
                                                            fontSize: "0.85rem",
                                                            letterSpacing: "0.01em",
                                                            boxShadow: "none",
                                                            transition: "all 0.15s ease",
                                                        }}
                                                    >
                                                        {rasterGenerating
                                                            ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 14, height: 14 }} />กำลังสร้าง…</>
                                                            : <><i className="bi bi-globe2 me-1" />สร้าง Raster</>}
                                                    </button>
                                                    {selected.size === 0 && (
                                                        <div className="small text-muted">เลือกแปลงใน Step 1 ก่อน</div>
                                                    )}

                                                    <details className="small">
                                                        <summary className="text-muted" style={{ cursor: "pointer" }}>
                                                            เลือกโมเดล
                                                        </summary>
                                                        <div className="mt-2 d-flex" style={{ background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2 }}>
                                                            {(["raster", "bfast"] as const).map((m) => (
                                                                <button
                                                                    key={m}
                                                                    className="btn btn-sm flex-fill"
                                                                    onClick={() => setCalcMethod(m)}
                                                                    disabled={bfastRunning || updating}
                                                                    style={{
                                                                        borderRadius: 6,
                                                                        border: "none",
                                                                        fontWeight: calcMethod === m ? 600 : 400,
                                                                        background: calcMethod === m ? "white" : "transparent",
                                                                        color: calcMethod === m ? "#065f46" : "#6b7280",
                                                                        boxShadow: "none",
                                                                        transition: "all 0.15s",
                                                                        fontSize: "0.8rem",
                                                                    }}
                                                                >
                                                                    {m === "raster" ? "Raster" : "BFAST"}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="mt-2 p-2 rounded-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 10.5, lineHeight: 1.7, color: "#475569" }}>
                                                            {calcMethod === "raster" ? (
                                                                <>
                                                                    <div className="fw-semibold mb-1" style={{ color: "#065f46" }}>Raster (แนะนำ)</div>
                                                                    <div>· ข้อมูล: Landsat 5/7/8/9 ย้อนหลังถึงปี 2000</div>
                                                                    <div>· NDVI median รายปี ช่วง Nov–Apr</div>
                                                                    <div>· เปรียบ 2 ปีก่อน vs 2 ปีหลัง → หาปีที่ดินเปลี่ยนจากโล่งเป็นเขียว</div>
                                                                    <div>· เร็ว — คำนวณทุก pixel พร้อมกันบน GEE</div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="fw-semibold mb-1" style={{ color: "#1e40af" }}>BFAST</div>
                                                                    <div>· ข้อมูล: Landsat 5/7/8/9 ย้อนหลังถึงปี 2000</div>
                                                                    <div>· ดึง NDVI mean รายปีต่อแปลง แล้วหา breakpoint</div>
                                                                    <div>· Sliding window 2 ปี pre/post</div>
                                                                    <div>· ช้ากว่า — คำนวณทีละแปลง</div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </details>
                                                </div>

                                                {rasterMsg && (
                                                    <div className="small mt-2 text-muted">{rasterMsg.text}</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Step 3 */}
                                        <div className="col-12 col-lg-4">
                                            <div className="p-3 rounded-4 border h-100" style={{ background: "rgba(239,246,255,0.55)" }}>
                                                <div className="d-flex align-items-center justify-content-between mb-2">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="badge rounded-pill text-bg-dark">Step 3</span>
                                                        <span className="fw-semibold">คำนวณลงแปลงที่เลือก</span>
                                                    </div>
                                                    <span className="small text-muted">{selectedDone}/{selectedCount}</span>
                                                </div>

                                                <div className="d-grid gap-2">
                                                    {(() => {
                                                        const step3Disabled = selected.size === 0 || bfastRunning || parcels.length === 0 || (calcMethod === "raster" && !rasterReady && rasterGenerating);
                                                        return (
                                                            <button
                                                                className="btn"
                                                                disabled={step3Disabled}
                                                                onClick={async () => {
                                                                    if (calcMethod === "raster" && !rasterReady) {
                                                                        await generateRasterInGee();
                                                                    }
                                                                    if (calcMethod === "raster") {
                                                                        await runRasterSample(selected);
                                                                    } else {
                                                                        await runBfast(selected);
                                                                    }
                                                                }}
                                                                style={{
                                                                    background: step3Disabled
                                                                        ? "#dbeafe"
                                                                        : "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
                                                                    color: step3Disabled ? "#6b7280" : "white",
                                                                    border: "none",
                                                                    borderRadius: 10,
                                                                    padding: "9px 16px",
                                                                    fontWeight: 600,
                                                                    fontSize: "0.85rem",
                                                                    letterSpacing: "0.01em",
                                                                    boxShadow: "none",
                                                                    transition: "all 0.15s ease",
                                                                }}
                                                            >
                                                                {bfastRunning
                                                                    ? <>
                                                                        <span className="spinner-border spinner-border-sm me-1" style={{ width: 14, height: 14 }} />
                                                                        กำลังทำงาน… ({bfastProgress.done}/{bfastProgress.total})
                                                                    </>
                                                                    : <>
                                                                        <i className="bi bi-cpu me-1" />
                                                                        {selected.size === 0 ? "เลือกแปลงก่อน" : "คำนวณอายุให้แปลงที่เลือก"}
                                                                    </>}
                                                            </button>
                                                        );
                                                    })()}
                                                    <div className="d-flex flex-wrap gap-2">
                                                        <span className="badge rounded-pill text-bg-success">สำเร็จ {selectedDone}</span>
                                                        <span className="badge rounded-pill text-bg-danger">ผิดพลาด {selectedError}</span>
                                                        <span className="badge rounded-pill text-bg-secondary">รอ {selectedPending}</span>
                                                    </div>
                                                </div>

                                                {bfastRunning && bfastProgress.total > 0 && (
                                                    <div className="progress mt-2" role="progressbar" aria-valuenow={Math.round((bfastProgress.done / bfastProgress.total) * 100)} aria-valuemin={0} aria-valuemax={100} style={{ height: 8 }}>
                                                        <div
                                                            className="progress-bar progress-bar-striped progress-bar-animated bg-success"
                                                            style={{ width: `${Math.round((bfastProgress.done / bfastProgress.total) * 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Step 4 */}
                                        <div className="col-12 col-lg-4">
                                            <div className="p-3 rounded-4 border h-100" style={{ background: "rgba(255,247,237,0.55)" }}>
                                                <div className="d-flex align-items-center justify-content-between mb-2">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="badge rounded-pill text-bg-dark">Step 4</span>
                                                        <span className="fw-semibold">บันทึกลงฐานข้อมูล</span>
                                                    </div>
                                                    <span className="badge rounded-pill text-bg-light border">{readyToSaveCount} พร้อมบันทึก</span>
                                                </div>

                                                <div className="d-grid gap-2">
                                                    {(() => {
                                                        const step4Disabled = readyToSaveCount === 0 || updating || parcels.length === 0;
                                                        return (
                                                            <button
                                                                className="btn"
                                                                disabled={step4Disabled}
                                                                onClick={saveToDb}
                                                                style={{
                                                                    background: step4Disabled
                                                                        ? "#f1f5f9"
                                                                        : "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
                                                                    color: step4Disabled ? "#9ca3af" : "white",
                                                                    border: step4Disabled ? "1.5px solid #e2e8f0" : "none",
                                                                    borderRadius: 10,
                                                                    padding: "9px 16px",
                                                                    fontWeight: 600,
                                                                    fontSize: "0.85rem",
                                                                    letterSpacing: "0.01em",
                                                                    boxShadow: "none",
                                                                    transition: "all 0.15s ease",
                                                                }}
                                                            >
                                                                {updating
                                                                    ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 14, height: 14 }} />กำลังบันทึก…</>
                                                                    : <><i className="bi bi-cloud-upload me-1" />บันทึกผล ({readyToSaveCount} แปลง)</>}
                                                            </button>
                                                        );
                                                    })()}
                                                    {readyToSaveCount === 0 && selectedDone > 0 && (
                                                        <div className="small text-warning fw-medium">
                                                            <i className="bi bi-exclamation-triangle me-1" />
                                                            GEE คำนวณแล้ว {selectedDone} แปลง แต่ไม่พบอายุ — อาจต้องสร้าง Raster ใหม่
                                                        </div>
                                                    )}
                                                    <div className="small text-muted">
                                                        แสดง {parcels.length.toLocaleString()} / {total.toLocaleString()} รายการ
                                                        {total > parcels.length && " · ตอนนี้โหลดชุดแรก"}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Map */}
                    {parcels.length > 0 && (
                        <Card className="border-0 shadow-sm mb-4">
                            <div className="p-3 pb-0 d-flex align-items-center gap-2">
                                <i className="bi bi-map text-success" />
                                <span className="fw-bold">แผนที่อายุต้นยาง</span>
                                <span className="small text-muted">(คลิกแปลงเพื่อดูรายละเอียด)</span>
                            </div>
                            <div className="p-3">
                                <RubberAgeMap parcels={parcels} bfastMap={bfastMap} tileUrl={rasterTileUrl ?? undefined} focusParcelId={focusedParcelId} />
                            </div>
                        </Card>
                    )}

                    {/* Table */}
                    {parcels.length > 0 && (
                        <Card className="border-0 shadow-sm overflow-hidden">
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                                    <thead className="table-light">
                                        <tr>
                                            <th className="px-3 py-2" style={{ width: 36 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected.size === parcels.length && parcels.length > 0}
                                                    onChange={toggleAll}
                                                />
                                            </th>
                                            <th className="py-2">ชื่อ / เลขทะเบียน</th>
                                            <th className="py-2">พื้นที่</th>
                                            <th className="py-2">จังหวัด / อำเภอ</th>
                                            <th className="py-2 text-center">สถานะ</th>
                                            <th className="py-2 text-center">ปีปลูก (DB)</th>
                                            <th className="py-2 text-center">อายุ (DB)</th>
                                            <th className="py-2 text-center">ปีปลูก (GEE)</th>
                                            <th className="py-2 text-center">อายุ (GEE) ปี</th>
                                            <th className="py-2 text-center">ความเชื่อมั่น</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parcels.map((p) => {
                                            const bfast = bfastMap[p.id];
                                            const isSelected = selected.has(p.id);

                                            return (
                                                <tr
                                                    key={p.id}
                                                    className={isSelected ? "table-success" : ""}
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => setFocusedParcelId(p.id)}
                                                >
                                                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleOne(p.id)}
                                                        />
                                                    </td>

                                                    {/* Name / ID */}
                                                    <td>
                                                        <div className="fw-medium text-truncate" style={{ maxWidth: 180 }}>
                                                            {fmt(p.farm_name)}
                                                        </div>
                                                        <div className="text-muted" style={{ fontSize: 11 }}>
                                                            {fmt(p.farm_idc)} · แปลงที่ {fmt(p.land_seq)}
                                                        </div>
                                                    </td>

                                                    {/* Area */}
                                                    <td className="text-muted">{fmt(p.grow_area)}</td>

                                                    {/* Province / Amphur */}
                                                    <td>
                                                        <div>{fmt(p.province)}</div>
                                                        <div className="text-muted" style={{ fontSize: 11 }}>{fmt(p.amphoe_t)}</div>
                                                    </td>

                                                    {/* Row status */}
                                                    <td className="text-center">
                                                        {bfast?.state === "loading" && (
                                                            <span className="badge rounded-pill text-bg-warning text-dark">กำลังคำนวณ</span>
                                                        )}
                                                        {bfast?.state === "done" && (
                                                            bfast.age == null
                                                                ? <div>
                                                                    <span className="badge rounded-pill text-bg-warning text-dark">ไม่มีข้อมูล</span>
                                                                    {bfast.reason && (
                                                                        <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                                                                            {REASON_LABELS[bfast.reason] ?? bfast.reason}
                                                                        </div>
                                                                    )}
                                                                  </div>
                                                                : <span className="badge rounded-pill text-bg-success">สำเร็จ</span>
                                                        )}
                                                        {bfast?.state === "error" && (
                                                            <span className="badge rounded-pill text-bg-danger">ผิดพลาด</span>
                                                        )}
                                                        {(!bfast || bfast.state === "idle") && (
                                                            p.gee_age != null
                                                                ? <span className="badge rounded-pill" style={{ background: "rgba(16,185,129,0.12)", color: "#065f46" }}>บันทึกแล้ว</span>
                                                                : <span className="badge rounded-pill text-bg-light border">รอคำนวณ</span>
                                                        )}
                                                    </td>

                                                    {/* DB grow year */}
                                                    <td className="text-center">
                                                        {formatThaiYear(p.grow_year)}
                                                    </td>

                                                    {/* DB rubber age */}
                                                    <td className="text-center fw-medium">
                                                        {p.rubber_age != null
                                                            ? <span className="badge rounded-pill text-bg-success">{p.rubber_age} ปี</span>
                                                            : <span className="text-muted">—</span>}
                                                    </td>

                                                    {/* GEE planting year — live result takes priority, fall back to DB-saved value */}
                                                    <td className="text-center">
                                                        {bfast?.state === "loading" && (
                                                            <span className="spinner-border spinner-border-sm text-success" style={{ width: 12, height: 12 }} />
                                                        )}
                                                        {bfast?.state === "error" && <span className="text-danger">✗</span>}
                                                        {bfast?.state === "done"
                                                            ? (bfast.plantingYear != null ? formatThaiYear(bfast.plantingYear) : "—")
                                                            : (!bfast || bfast.state === "idle")
                                                                ? (p.gee_plant_year != null ? formatThaiYear(p.gee_plant_year) : <span className="text-muted">—</span>)
                                                                : null}
                                                    </td>

                                                    {/* GEE age — live result takes priority, fall back to DB-saved value */}
                                                    <td className="text-center fw-bold">
                                                        {bfast?.state === "loading" && (
                                                            <span className="spinner-border spinner-border-sm text-success" style={{ width: 12, height: 12 }} />
                                                        )}
                                                        {bfast?.state === "error" && <span className="text-danger small">ผิดพลาด</span>}
                                                        {bfast?.state === "done"
                                                            ? (bfast.age != null ? bfast.age : "—")
                                                            : (!bfast || bfast.state === "idle")
                                                                ? (p.gee_age != null ? p.gee_age : <span className="text-muted">—</span>)
                                                                : null}
                                                    </td>

                                                    {/* Confidence — live result takes priority, fall back to DB-saved value */}
                                                    {(() => {
                                                        const conf = bfast?.state === "done" && bfast.confidence != null
                                                            ? bfast.confidence
                                                            : (!bfast || bfast.state === "idle") && p.gee_confidence != null
                                                                ? Number(p.gee_confidence)
                                                                : null;
                                                        return (
                                                            <td className="text-center">
                                                                {conf != null && (
                                                                    <span
                                                                        className={`badge rounded-pill ${conf >= 0.7 ? "bg-success" : conf >= 0.4 ? "bg-warning text-dark" : "bg-danger"}`}
                                                                        style={{ fontSize: 10 }}
                                                                    >
                                                                        {(conf * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })()}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {total > parcels.length && (
                                <div className="px-4 py-2 bg-light border-top text-muted small text-center">
                                    แสดง {parcels.length.toLocaleString()} แถวแรก จาก {total.toLocaleString()} รายการ · ปรับตัวกรองเพื่อโหลดแปลงอื่น
                                </div>
                            )}
                        </Card>
                    )}

                    {parcels.length === 0 && !fetchingParcels && (
                        <div className="text-center py-5 text-muted">
                            <i className="bi bi-inbox fs-2 d-block mb-2"></i>
                            ไม่พบแปลงที่ตรงกับเงื่อนไข
                        </div>
                    )}
                </>
            )}

            {total === null && !fetchingParcels && (
                <div className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-2 d-block mb-2 opacity-40"></i>
                    ไม่มีข้อมูลแปลงให้แสดง
                </div>
            )}
        </div>
    );
}
