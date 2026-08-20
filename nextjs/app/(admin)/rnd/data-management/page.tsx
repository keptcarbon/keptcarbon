"use client";

import { useEffect, useMemo, useState } from "react";
import { fromArrayBuffer, GeoTIFFImage } from "geotiff";
import { Alert, Card } from "@/app/components";

// Raster header metadata read client-side from the .tif itself (geotiff.js)
// — only applies to the establishment-year-map category.
type TiffMeta = {
    bandCount: number;
    noData: number | null;
    min: number | null;
    max: number | null;
    crs: string;
    pixelSizeX: number | null;
    pixelSizeY: number | null;
    // Unit the pixel size is expressed in, inferred from whether the CRS
    // is geographic (degrees) or projected (usually meters).
    pixelSizeUnit: "deg" | "m" | null;
    // "tag": read from the embedded GDAL STATISTICS_MINIMUM/MAXIMUM metadata
    // (fast, no pixel scan). "scan": no such tag, computed from every pixel.
    // "scan-downsampled": no tag, and the raster was too large to scan at
    // full resolution, so it was resampled down first — real data, but an
    // approximation rather than the exact pixel-perfect min/max.
    minMaxSource: "tag" | "scan" | "scan-downsampled" | null;
};

// Rasters above this pixel count are downsampled before scanning for
// min/max, so a province-wide .tif doesn't freeze the browser.
const MAX_SAMPLES_FOR_MINMAX = 25_000_000;

type DatasetCategory = "establishment_year_map" | "lulc_map" | "biomass_profile";
type DatasetStatus = "active" | "draft" | "archived";

type ResearchDataset = {
    id: string;
    name: string;
    category: DatasetCategory;
    pCode: string;
    provinceName: string;
    version: string;
    description: string;
    updatedAt: string;
    status: DatasetStatus;
};

// A dataset's p_code ties it to a province in geo_thailand — the same key
// used when importing other data into related tables.
type GeoProvince = {
    pCode: string;
    provCode: string;
    nameTh: string;
    nameEn: string;
    region: string;
};

const REGION_LABELS: Record<string, string> = {
    C: "ภาคกลาง",
    N: "ภาคเหนือ",
    E: "ภาคตะวันออก",
    W: "ภาคตะวันตก",
    NE: "ภาคตะวันออกเฉียงเหนือ",
    S: "ภาคใต้",
};

// Seeded from backend/app/core/constants.py REGION_CONFIG — the live source
// of truth until this page is wired to a datasets API.
const INITIAL_DATASETS: ResearchDataset[] = [
    {
        id: "establishment-year-rayong",
        name: "Establishment Year Map — Rayong (RAY)",
        category: "establishment_year_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2026",
        description: "แผนที่ปีปลูกยางพารา จังหวัดระยอง",
        updatedAt: "2026-02-01",
        status: "active",
    },
    {
        id: "establishment-year-qa-rayong",
        name: "Establishment Year Map QA — Rayong (RAY)",
        category: "establishment_year_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2026 QA",
        description: "แผนที่ปีปลูกฉบับตรวจสอบคุณภาพ จังหวัดระยอง",
        updatedAt: "2026-01-20",
        status: "draft",
    },
    {
        id: "lulc-rayong",
        name: "LULC Map — Rayong (RAY)",
        category: "lulc_map",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2567",
        description: "แผนที่การใช้ประโยชน์ที่ดิน จังหวัดระยอง",
        updatedAt: "2025-11-02",
        status: "active",
    },
    {
        id: "biomass-profile-rrim600",
        name: "Biomass Profile — RRIM 600",
        category: "biomass_profile",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "v1",
        description: "ข้อมูลชีวมวลอ้างอิงพันธุ์ยาง RRIM 600",
        updatedAt: "2025-08-20",
        status: "active",
    },
    {
        id: "biomass-profile-hytonen",
        name: "Biomass Profile — Hytonen 2018",
        category: "biomass_profile",
        pCode: "RAY",
        provinceName: "ระยอง",
        version: "2018",
        description: "ข้อมูลชีวมวลอ้างอิงตามวิธี Hytonen (2018)",
        updatedAt: "2025-06-11",
        status: "archived",
    },
];

const CATEGORY_META: Record<DatasetCategory, { label: string; bg: string; color: string }> = {
    establishment_year_map: { label: "Map of Establishment Year", bg: "rgba(59,130,246,0.10)", color: "#1e40af" },
    lulc_map: { label: "Map of LULC", bg: "rgba(168,85,247,0.10)", color: "#7e22ce" },
    biomass_profile: { label: "Biomass Profile", bg: "rgba(236,72,153,0.10)", color: "#be185d" },
};

const CATEGORY_FILE_EXT: Record<DatasetCategory, string> = {
    establishment_year_map: ".tif",
    lulc_map: ".gpkg",
    biomass_profile: ".csv",
};

const STATUS_META: Record<DatasetStatus, { label: string; bg: string; color: string }> = {
    active: { label: "ใช้งานอยู่", bg: "#edfaf3", color: "#1e7a47" },
    draft: { label: "ฉบับร่าง", bg: "rgba(234,179,8,0.12)", color: "#a16207" },
    archived: { label: "เก็บถาวร", bg: "#f1f6f3", color: "#5a7a65" },
};

const HERO_BG =
    "radial-gradient(900px 420px at -5% -20%, rgba(45,158,95,0.16) 0%, rgba(45,158,95,0) 62%)," +
    "radial-gradient(700px 360px at 108% 0%, rgba(30,122,71,0.10) 0%, rgba(30,122,71,0) 58%)," +
    "linear-gradient(135deg, #ffffff 0%, #f8fbf9 100%)";

const TH_STYLE: React.CSSProperties = {
    fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "#5a7a65",
};

type TabKey = "list" | "import";

const TABS: { key: TabKey; label: string }[] = [
    { key: "list", label: "รายการข้อมูล" },
    { key: "import", label: "นำเข้าข้อมูล" },
];

type ImportStep = 1 | 2 | 3 | 4;
const LAST_IMPORT_STEP: ImportStep = 4;

const IMPORT_STEPS: { step: ImportStep; label: string }[] = [
    { step: 1, label: "เลือกจังหวัด" },
    { step: 2, label: "เลือกประเภทและไฟล์" },
    { step: 3, label: "ตรวจสอบข้อมูล" },
    { step: 4, label: "ยืนยันการนำเข้า" },
];

export default function RndDataManagementPage() {
    const [activeTab, setActiveTab] = useState<TabKey>("list");
    const [datasets, setDatasets] = useState<ResearchDataset[]>(INITIAL_DATASETS);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<DatasetCategory | "all">("all");
    const [success, setSuccess] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ResearchDataset | null>(null);

    // ── Import wizard state ──
    const [importStep, setImportStep] = useState<ImportStep>(1);
    const [importRegion, setImportRegion] = useState("");
    const [importPCode, setImportPCode] = useState("");
    const [importCategory, setImportCategory] = useState<DatasetCategory | "">("");
    const [importVersion, setImportVersion] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [fileMeta, setFileMeta] = useState<TiffMeta | null>(null);
    const [fileMetaLoading, setFileMetaLoading] = useState(false);
    const [fileMetaError, setFileMetaError] = useState<string | null>(null);
    // Raw values the parser actually saw — printed to console + shown in a
    // collapsible debug panel so a mismatch (e.g. missing STATISTICS_* tags)
    // can be diagnosed without opening devtools.
    const [fileDebug, setFileDebug] = useState<Record<string, unknown> | null>(null);

    // ── geo_thailand reference (region → province → p_code) ──
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [provincesLoading, setProvincesLoading] = useState(true);
    const [provincesError, setProvincesError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/geo-thailand")
            .then((res) => (res.ok ? res.json() : Promise.reject(res)))
            .then((data) => {
                if (!cancelled) setProvinces(data.provinces ?? []);
            })
            .catch(() => {
                if (!cancelled) setProvincesError(true);
            })
            .finally(() => {
                if (!cancelled) setProvincesLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const regions = useMemo(
        () => Array.from(new Set(provinces.map((p) => p.region))).sort(),
        [provinces]
    );
    const provincesInRegion = useMemo(
        () => provinces.filter((p) => p.region === importRegion).sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th")),
        [provinces, importRegion]
    );
    const selectedProvince = useMemo(
        () => provinces.find((p) => p.pCode === importPCode) ?? null,
        [provinces, importPCode]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return datasets.filter((d) => {
            const matchesQuery =
                !q ||
                d.name.toLowerCase().includes(q) ||
                d.description.toLowerCase().includes(q);
            const matchesCategory = categoryFilter === "all" || d.category === categoryFilter;
            return matchesQuery && matchesCategory;
        });
    }, [datasets, search, categoryFilter]);

    function handleAdd() {
        // No datasets API yet — this only demonstrates the UI flow.
        setSuccess("การอัปโหลดชุดข้อมูลใหม่ยังไม่เชื่อมต่อ API จริง");
        setTimeout(() => setSuccess(null), 3000);
    }

    function confirmDelete() {
        if (!pendingDelete) return;
        setDatasets((prev) => prev.filter((d) => d.id !== pendingDelete.id));
        setSuccess(`ลบ “${pendingDelete.name}” แล้ว`);
        setTimeout(() => setSuccess(null), 3000);
        setPendingDelete(null);
    }

    function resetImportWizard() {
        setImportStep(1);
        setImportRegion("");
        setImportPCode("");
        setImportCategory("");
        setImportVersion("");
        setImportFile(null);
        setFileMeta(null);
        setFileMetaError(null);
        setFileDebug(null);
        setConfirmError(null);
    }

    // GDAL embeds STATISTICS_MINIMUM/MAXIMUM in the GDAL_METADATA tag (42112)
    // when the file was built with stats (e.g. gdalinfo -stats). Reading that
    // is instant — far cheaper than scanning every pixel — so it's tried
    // first, before falling back to a pixel scan. geotiff.js's
    // getGDALMetadata(sample) filters strictly on the Item's "sample"
    // attribute: pass a band index to get that band's items, or null for
    // dataset-level items with no "sample" attribute at all — which is how
    // GDAL often writes stats for a single-band raster, so both are tried.
    async function readMinMaxFromGdalTags(
        image: GeoTIFFImage,
        bandCount: number,
        debugLog: Record<string, unknown>
    ): Promise<{ min: number; max: number } | null> {
        const mins: number[] = [];
        const maxs: number[] = [];
        const perSampleMeta: Record<string, unknown> = {};

        const datasetMeta = await image.getGDALMetadata(null);
        perSampleMeta.dataset = datasetMeta;
        collectMinMax(datasetMeta, mins, maxs);

        for (let sample = 0; sample < bandCount; sample++) {
            const meta = await image.getGDALMetadata(sample);
            perSampleMeta[`sample_${sample}`] = meta;
            collectMinMax(meta, mins, maxs);
        }

        debugLog.gdalMetadataByScope = perSampleMeta;
        if (mins.length === 0 || maxs.length === 0) return null;
        return { min: Math.min(...mins), max: Math.max(...maxs) };
    }

    function collectMinMax(meta: Record<string, unknown> | null, mins: number[], maxs: number[]) {
        if (!meta) return;
        const minVal = parseFloat(String(meta.STATISTICS_MINIMUM ?? ""));
        const maxVal = parseFloat(String(meta.STATISTICS_MAXIMUM ?? ""));
        if (!Number.isNaN(minVal)) mins.push(minVal);
        if (!Number.isNaN(maxVal)) maxs.push(maxVal);
    }

    async function readTiffMetadata(file: File) {
        setFileMeta(null);
        setFileMetaError(null);
        setFileDebug(null);
        setFileMetaLoading(true);
        const debugLog: Record<string, unknown> = {};
        try {
            const buffer = await file.arrayBuffer();
            const tiff = await fromArrayBuffer(buffer);
            const image = await tiff.getImage();

            const bandCount = image.getSamplesPerPixel();
            const noData = image.getGDALNoData();
            const geoKeys = image.getGeoKeys();
            const epsgCode = geoKeys?.ProjectedCSTypeGeoKey ?? geoKeys?.GeographicTypeGeoKey ?? null;
            const crs = epsgCode ? `EPSG:${epsgCode}` : "ไม่ระบุ";
            const pixelSizeUnit: TiffMeta["pixelSizeUnit"] =
                geoKeys?.ProjectedCSTypeGeoKey ? "m" : geoKeys?.GeographicTypeGeoKey ? "deg" : null;

            let pixelSizeX: number | null = null;
            let pixelSizeY: number | null = null;
            try {
                const [resX, resY] = image.getResolution();
                pixelSizeX = Math.abs(resX);
                pixelSizeY = Math.abs(resY);
            } catch {
                // No affine transform on this image — leave pixel size unset.
            }
            debugLog.pixelSizeX = pixelSizeX;
            debugLog.pixelSizeY = pixelSizeY;

            debugLog.hasGdalMetadataTag = image.fileDirectory.hasTag("GDAL_METADATA");
            debugLog.rawGdalMetadataXml = debugLog.hasGdalMetadataTag
                ? await image.fileDirectory.loadValue("GDAL_METADATA")
                : null;
            debugLog.bandCount = bandCount;
            debugLog.noData = noData;
            debugLog.width = image.getWidth();
            debugLog.height = image.getHeight();

            let min: number | null = null;
            let max: number | null = null;
            let minMaxSource: TiffMeta["minMaxSource"] = null;

            const tagStats = await readMinMaxFromGdalTags(image, bandCount, debugLog);
            if (tagStats) {
                min = tagStats.min;
                max = tagStats.max;
                minMaxSource = "tag";
            } else {
                // No embedded stats tag — scan pixels for a real min/max.
                // Large rasters (a province-wide .tif easily exceeds the cap)
                // are read at a downsampled resolution instead of being
                // skipped, so this always resolves to real values.
                const width = image.getWidth();
                const height = image.getHeight();
                const sampleCount = width * height * bandCount;
                const downsampled = sampleCount > MAX_SAMPLES_FOR_MINMAX;
                const scale = downsampled ? Math.sqrt(MAX_SAMPLES_FOR_MINMAX / sampleCount) : 1;
                const readWidth = Math.max(1, Math.round(width * scale));
                const readHeight = Math.max(1, Math.round(height * scale));

                debugLog.minMaxDownsampled = downsampled;
                debugLog.minMaxReadWidth = readWidth;
                debugLog.minMaxReadHeight = readHeight;

                const rasters = await image.readRasters(
                    downsampled ? { width: readWidth, height: readHeight, resampleMethod: "nearest" } : undefined
                );
                const bands = (Array.isArray(rasters) ? rasters : [rasters]) as ArrayLike<number>[];
                for (const band of bands) {
                    for (let i = 0; i < band.length; i++) {
                        const v = band[i];
                        if (noData !== null && v === noData) continue;
                        if (min === null || v < min) min = v;
                        if (max === null || v > max) max = v;
                    }
                }
                minMaxSource = downsampled ? "scan-downsampled" : "scan";
            }

            debugLog.resolvedMinMaxSource = minMaxSource;
            debugLog.resolvedMin = min;
            debugLog.resolvedMax = max;
            console.log(`[readTiffMetadata] ${file.name}`, debugLog);
            setFileDebug(debugLog);
            setFileMeta({ bandCount, noData, min, max, crs, pixelSizeX, pixelSizeY, pixelSizeUnit, minMaxSource });
        } catch (err) {
            debugLog.error = err instanceof Error ? err.message : String(err);
            console.log(`[readTiffMetadata] ${file.name} — failed`, debugLog);
            setFileDebug(debugLog);
            setFileMetaError("ไม่สามารถอ่าน metadata จากไฟล์นี้ได้ — ไฟล์อาจไม่ใช่ GeoTIFF ที่ถูกต้อง");
        } finally {
            setFileMetaLoading(false);
        }
    }

    function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setImportFile(file);
        setFileMeta(null);
        setFileMetaError(null);
        setFileDebug(null);
        if (file && importCategory === "establishment_year_map") {
            void readTiffMetadata(file);
        }
    }

    async function handleConfirmImport() {
        if (!selectedProvince || !importCategory || !importVersion.trim() || !importFile) return;
        setConfirmError(null);
        setImporting(true);

        if (importCategory === "establishment_year_map") {
            // Real import — persisted into geo_establishment_year via PostGIS.
            try {
                const body = new FormData();
                body.set("file", importFile);
                body.set("pCode", selectedProvince.pCode);
                body.set("year", importVersion.trim());

                const res = await fetch("/api/rnd/geo-establishment-year", { method: "POST", body });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || "นำเข้าไฟล์ไม่สำเร็จ");
                }

                const newDataset: ResearchDataset = {
                    id: `imported-${Date.now()}`,
                    name: importFile.name.replace(/\.[^/.]+$/, ""),
                    category: importCategory,
                    pCode: selectedProvince.pCode,
                    provinceName: selectedProvince.nameTh,
                    version: importVersion.trim(),
                    description: "นำเข้าโดยผู้ใช้งาน R&D",
                    updatedAt: new Date().toISOString().slice(0, 10),
                    status: "active",
                };
                setDatasets((prev) => [newDataset, ...prev]);
                setSuccess(`นำเข้า “${newDataset.name}” สำเร็จ (${data.tileCount} tiles)`);
                setTimeout(() => setSuccess(null), 3000);
                resetImportWizard();
            } catch (err) {
                setConfirmError(err instanceof Error ? err.message : "นำเข้าไฟล์ไม่สำเร็จ");
            } finally {
                setImporting(false);
            }
            return;
        }

        // lulc_map / biomass_profile have no backend endpoint yet — UI-only.
        await new Promise((resolve) => setTimeout(resolve, 700));
        const newDataset: ResearchDataset = {
            id: `imported-${Date.now()}`,
            name: importFile.name.replace(/\.[^/.]+$/, ""),
            category: importCategory,
            pCode: selectedProvince.pCode,
            provinceName: selectedProvince.nameTh,
            version: importVersion.trim(),
            description: "นำเข้าโดยผู้ใช้งาน R&D",
            updatedAt: new Date().toISOString().slice(0, 10),
            status: "draft",
        };
        setDatasets((prev) => [newDataset, ...prev]);
        setImporting(false);
        setSuccess(`นำเข้า “${newDataset.name}” สำเร็จ (ยังไม่เชื่อมต่อ API จริงสำหรับประเภทนี้)`);
        setTimeout(() => setSuccess(null), 3000);
        resetImportWizard();
    }

    // Block "ถัดไป" out of step 2 while the .tif metadata read is still in
    // flight — the review step needs fileMeta settled before the user moves on.
    // geo_establishment_year.year is an integer column — free text like "v1"
    // doesn't fit, so this category requires a numeric year specifically.
    const versionIsValid =
        importCategory === "establishment_year_map"
            ? /^\d+$/.test(importVersion.trim())
            : !!importVersion.trim();

    const nextDisabled =
        (importStep === 1 && !importPCode) ||
        (importStep === 2 && (!importCategory || !versionIsValid || !importFile || fileMetaLoading));

    // Raster metadata rows only apply to the establishment-year-map (.tif)
    // category — .gpkg/.csv have no bands/NoData/CRS concept to read here.
    const reviewRows: { label: string; value: string }[] = [
        { label: "จังหวัด", value: selectedProvince ? `${selectedProvince.nameTh} (${selectedProvince.pCode})` : "-" },
        { label: "ประเภทข้อมูล", value: importCategory ? CATEGORY_META[importCategory].label : "-" },
        { label: "เวอร์ชัน", value: importVersion.trim() },
        { label: "ไฟล์", value: importFile?.name ?? "-" },
        { label: "ขนาดไฟล์", value: importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "-" },
    ];
    if (importCategory === "establishment_year_map") {
        if (fileMetaLoading) {
            reviewRows.push({ label: "Metadata ไฟล์", value: "กำลังอ่าน…" });
        } else if (fileMetaError) {
            reviewRows.push({ label: "Metadata ไฟล์", value: fileMetaError });
        } else if (fileMeta) {
            const minMaxSuffix =
                fileMeta.minMaxSource === "tag" ? " (จาก tag สถิติ)" :
                fileMeta.minMaxSource === "scan" ? " (คำนวณจากพิกเซล)" :
                fileMeta.minMaxSource === "scan-downsampled" ? " (ประมาณจากข้อมูลย่อส่วน)" : "";
            const pixelSizeUnitLabel = fileMeta.pixelSizeUnit === "deg" ? "องศา" : "ม.";
            const pixelSize =
                fileMeta.pixelSizeX !== null && fileMeta.pixelSizeY !== null
                    ? `${fileMeta.pixelSizeX} × ${fileMeta.pixelSizeY} ${pixelSizeUnitLabel}`
                    : "-";
            reviewRows.push(
                { label: "จำนวนแบนด์ (Bands)", value: String(fileMeta.bandCount) },
                { label: "ค่า No-Data", value: fileMeta.noData !== null ? String(fileMeta.noData) : "ไม่ระบุ" },
                { label: "ค่าต่ำสุด (Min)", value: fileMeta.min !== null ? `${fileMeta.min}${minMaxSuffix}` : "-" },
                { label: "ค่าสูงสุด (Max)", value: fileMeta.max !== null ? `${fileMeta.max}${minMaxSuffix}` : "-" },
                { label: "ระบบพิกัด (CRS)", value: fileMeta.crs },
                { label: "ขนาดพิกเซล (Pixel Size)", value: pixelSize },
            );
        }
    }

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>จัดการข้อมูลอ้างอิงงานวิจัย</h1>
                    <div style={{ color: "#5a7a65", fontSize: 14 }}>
                        ชุดข้อมูลอ้างอิงทั้งหมด <span className="fw-semibold" style={{ color: "#1a3d2b" }}>{datasets.length}</span> ชุด
                        {" · "}จัดการค่าสัมประสิทธิ์ โมเดลการเติบโต และข้อมูลอ้างอิงที่ใช้ในการคำนวณคาร์บอน
                    </div>
                </div>
            </Card>

            {/* ── Tabs ── */}
            <div className="d-flex align-items-center gap-1 mb-4" style={{ borderBottom: "1px solid #e6f0ea" }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className="btn"
                        style={{
                            border: "none", background: "transparent", borderRadius: 0,
                            padding: "10px 18px", fontWeight: 600, fontSize: "0.9rem",
                            color: activeTab === tab.key ? "#1e7a47" : "#5a7a65",
                            borderBottom: activeTab === tab.key ? "2px solid #1e7a47" : "2px solid transparent",
                            marginBottom: -1,
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {success && (
                <Alert type="success" className="mb-3">
                    {success}
                </Alert>
            )}

            {activeTab === "list" && (
            <>
            {/* ── Toolbar ── */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div className="d-flex flex-wrap align-items-center gap-2">
                    <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
                        <i className="bi bi-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อหรือคำอธิบาย…"
                            style={{ width: "100%", borderRadius: 12, border: "1px solid #e6f0ea", background: "#fff", padding: "10px 14px 10px 38px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                        />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as DatasetCategory | "all")}
                        className="form-select"
                        style={{ width: "auto", borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 13, color: "#1a3d2b" }}
                    >
                        <option value="all">ทุกประเภท</option>
                        {Object.entries(CATEGORY_META).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={handleAdd}
                    className="btn"
                    style={{
                        background: "#1e7a47", color: "#fff", border: "none",
                        borderRadius: 10, padding: "9px 18px", fontWeight: 600, fontSize: "0.85rem",
                        display: "flex", alignItems: "center", gap: 6,
                    }}
                >
                    <i className="bi bi-plus-lg" />
                    เพิ่มชุดข้อมูล
                </button>
            </div>

            {/* ── Datasets table ── */}
            <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, boxShadow: "0 1px 2px rgba(16,40,28,0.04)", overflow: "hidden" }}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                        <thead style={{ background: "#f8fbf9" }}>
                            <tr>
                                <th className="px-4 py-3" style={TH_STYLE}>ชุดข้อมูล</th>
                                <th className="py-3" style={TH_STYLE}>ประเภท</th>
                                <th className="py-3" style={TH_STYLE}>จังหวัด</th>
                                <th className="py-3" style={TH_STYLE}>เวอร์ชัน</th>
                                <th className="py-3" style={TH_STYLE}>สถานะ</th>
                                <th className="py-3" style={TH_STYLE}>อัปเดตล่าสุด</th>
                                <th className="px-4 py-3 text-end" style={TH_STYLE}>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d) => {
                                const cat = CATEGORY_META[d.category];
                                const status = STATUS_META[d.status];
                                return (
                                    <tr key={d.id}>
                                        <td className="px-4 py-3">
                                            <div className="fw-semibold" style={{ color: "#1a3d2b" }}>{d.name}</div>
                                            <div style={{ fontSize: 12, color: "#5a7a65" }}>{d.description}</div>
                                        </td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: cat.bg, color: cat.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {cat.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>
                                            {d.provinceName} <span style={{ color: "#94a3b8" }}>({d.pCode})</span>
                                        </td>
                                        <td className="py-3" style={{ color: "#5a7a65" }}>{d.version}</td>
                                        <td className="py-3">
                                            <span className="badge rounded-pill" style={{ background: status.bg, color: status.color, fontWeight: 600, fontSize: 12, padding: "4px 10px" }}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="py-3" style={{ fontSize: 13, color: "#5a7a65" }}>
                                            {new Date(d.updatedAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={handleAdd}
                                                    style={{ border: "1px solid #e6f0ea", borderRadius: 9, color: "#1a3d2b", background: "#fff", padding: "5px 11px", fontSize: "0.78rem" }}
                                                >
                                                    <i className="bi bi-pencil me-1" />แก้ไข
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => setPendingDelete(d)}
                                                    style={{
                                                        background: "#fef2f2", color: "#c53030", border: "1px solid #fecaca",
                                                        borderRadius: 9, padding: "5px 11px", fontWeight: 600, fontSize: "0.78rem",
                                                    }}
                                                >
                                                    <i className="bi bi-trash me-1" />ลบ
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-5" style={{ color: "#5a7a65" }}>
                                        <i className="bi bi-search d-block mb-2" style={{ fontSize: 26, color: "#c7dbcf" }} />
                                        ไม่พบชุดข้อมูลที่ตรงกับเงื่อนไข
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            {activeTab === "import" && (
                <div style={{ background: "#fff", border: "1px solid #e6f0ea", borderRadius: 16, padding: "32px 40px", maxWidth: 640, margin: "0 auto" }}>
                    {/* ── Step indicator ── */}
                    <div className="d-flex align-items-start justify-content-center mb-4">
                        {IMPORT_STEPS.map((s, i) => (
                            <div key={s.step} className="d-flex align-items-start">
                                <div className="d-flex flex-column align-items-center" style={{ minWidth: 100 }}>
                                    <div style={{
                                        width: 34, height: 34, borderRadius: "50%",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontWeight: 700, fontSize: 14,
                                        background: importStep >= s.step ? "#1e7a47" : "#f1f6f3",
                                        color: importStep >= s.step ? "#fff" : "#5a7a65",
                                        boxShadow: importStep === s.step ? "0 0 0 4px #d7f0e1" : "none",
                                        transition: "all 0.15s ease",
                                    }}>
                                        {importStep > s.step ? <i className="bi bi-check-lg" /> : s.step}
                                    </div>
                                    <div style={{
                                        fontSize: 12, marginTop: 6, fontWeight: 600, textAlign: "center",
                                        color: importStep >= s.step ? "#1a3d2b" : "#94a3b8",
                                    }}>
                                        {s.label}
                                    </div>
                                </div>
                                {i < IMPORT_STEPS.length - 1 && (
                                    <div style={{ width: 48, height: 2, background: importStep > s.step ? "#1e7a47" : "#e6f0ea", marginTop: 16 }} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ── Step 1: province ── */}
                    {importStep === 1 && (
                        <div>
                            {provincesError ? (
                                <div style={{ fontSize: 13.5, color: "#c53030" }}>
                                    ไม่สามารถโหลดข้อมูลจังหวัดจาก geo_thailand ได้ กรุณาลองใหม่อีกครั้ง
                                </div>
                            ) : (
                                <>
                                    <div className="mb-3">
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ภาค</div>
                                        <select
                                            value={importRegion}
                                            onChange={(e) => {
                                                setImportRegion(e.target.value);
                                                setImportPCode("");
                                            }}
                                            disabled={provincesLoading}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{provincesLoading ? "กำลังโหลด…" : "เลือกภาค…"}</option>
                                            {regions.map((r) => (
                                                <option key={r} value={r}>{REGION_LABELS[r] ?? r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>จังหวัด</div>
                                        <select
                                            value={importPCode}
                                            onChange={(e) => setImportPCode(e.target.value)}
                                            disabled={!importRegion}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">{importRegion ? "เลือกจังหวัด…" : "เลือกภาคก่อน"}</option>
                                            {provincesInRegion.map((p) => (
                                                <option key={p.pCode} value={p.pCode}>{p.nameTh} ({p.pCode})</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Step 2: category + file ── */}
                    {importStep === 2 && (
                        <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 12 }}>
                                จังหวัด: <span style={{ color: "#1a3d2b" }}>{selectedProvince?.nameTh} ({selectedProvince?.pCode})</span>
                            </div>
                            <div className="mb-3">
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ประเภทข้อมูล</div>
                                <select
                                    value={importCategory}
                                    onChange={(e) => setImportCategory(e.target.value as DatasetCategory)}
                                    className="form-select"
                                    style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                >
                                    <option value="">เลือกประเภทข้อมูล…</option>
                                    {Object.entries(CATEGORY_META).map(([key, meta]) => (
                                        <option key={key} value={key}>{meta.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-3">
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>
                                    เวอร์ชัน/ปีของข้อมูล <span style={{ color: "#dc2626" }}>*</span>
                                </div>
                                <input
                                    value={importVersion}
                                    onChange={(e) => setImportVersion(e.target.value)}
                                    placeholder={importCategory === "establishment_year_map" ? "เช่น 2568" : "เช่น v1, 2568"}
                                    inputMode={importCategory === "establishment_year_map" ? "numeric" : "text"}
                                    style={{ width: "100%", borderRadius: 10, border: "1px solid #e6f0ea", background: "#fff", padding: "9px 12px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                                />
                                {importCategory === "establishment_year_map" && importVersion.trim() !== "" && !versionIsValid && (
                                    <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 4 }}>
                                        ต้องเป็นตัวเลขปีเท่านั้น (บันทึกลงคอลัมน์ year ที่เป็นจำนวนเต็ม)
                                    </div>
                                )}
                            </div>
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>ไฟล์ข้อมูล</div>
                                <label
                                    htmlFor="import-file-input"
                                    style={{
                                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                        gap: 6, padding: "28px 16px", borderRadius: 12,
                                        border: "1.5px dashed #cfe4d8", background: "#f8fbf9",
                                        cursor: "pointer", textAlign: "center",
                                    }}
                                >
                                    <i className="bi bi-cloud-arrow-up" style={{ fontSize: 26, color: "#1e7a47" }} />
                                    {importFile ? (
                                        <>
                                            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a3d2b" }}>{importFile.name}</span>
                                            {importCategory === "establishment_year_map" && (
                                                <span style={{ fontSize: 12, color: fileMetaError ? "#c53030" : "#94a3b8" }}>
                                                    {fileMetaLoading ? "กำลังอ่าน metadata ของไฟล์…" : fileMetaError ? fileMetaError : fileMeta ? "อ่าน metadata สำเร็จ" : ""}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: "#1a3d2b" }}>คลิกเพื่อเลือกไฟล์ หรือวางไฟล์ที่นี่</span>
                                            <span style={{ fontSize: 13.5, color: "#94a3b8" }}>
                                                {importCategory ? `รองรับ ${CATEGORY_FILE_EXT[importCategory]}` : "เลือกประเภทข้อมูลก่อนเพื่อดูชนิดไฟล์ที่รองรับ"}
                                            </span>
                                        </>
                                    )}
                                    <input
                                        id="import-file-input"
                                        type="file"
                                        accept={importCategory ? CATEGORY_FILE_EXT[importCategory] : undefined}
                                        onChange={handleImportFileChange}
                                        style={{ display: "none" }}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: review ── */}
                    {importStep === 3 && (
                        <div>
                            <div style={{ fontSize: 14, color: "#5a7a65", marginBottom: 16 }}>
                                ตรวจสอบข้อมูลก่อนนำเข้าสู่ระบบ
                            </div>
                            <div style={{ border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
                                {reviewRows.map((row, i) => (
                                    <div
                                        key={row.label}
                                        className="d-flex justify-content-between"
                                        style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}
                                    >
                                        <span style={{ fontSize: 13, color: "#5a7a65" }}>{row.label}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a3d2b" }}>{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            {fileDebug && (
                                <details className="mt-3">
                                    <summary style={{ fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
                                        Metadata ที่อ่านได้จากไฟล์
                                    </summary>
                                    <pre style={{
                                        marginTop: 8, padding: 12, borderRadius: 8,
                                        background: "#0f172a", color: "#d1fae5",
                                        fontSize: 11, lineHeight: 1.5, overflowX: "auto", maxHeight: 320,
                                    }}>
                                        {JSON.stringify(fileDebug, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}
                                    </pre>
                                </details>
                            )}
                        </div>
                    )}

                    {/* ── Step 4: confirm ── */}
                    {importStep === 4 && (
                        <div className="text-center">
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
                                background: "#edfaf3", display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#1e7a47", fontSize: 24,
                            }}>
                                <i className="bi bi-upload" />
                            </div>
                            <h3 className="fw-bold mb-2" style={{ fontSize: 18, color: "#1a3d2b" }}>
                                พร้อมนำเข้า &ldquo;{importFile?.name}&rdquo;
                            </h3>
                            {confirmError && (
                                <div style={{
                                    marginTop: 12, padding: "10px 14px", borderRadius: 10,
                                    background: "#fef2f2", color: "#c53030", fontSize: 13, textAlign: "left",
                                }}>
                                    <i className="bi bi-exclamation-circle me-1" />
                                    {confirmError}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Step navigation ── */}
                    <div className="d-flex justify-content-between mt-4">
                        <button
                            onClick={() => setImportStep((s) => (s > 1 ? ((s - 1) as ImportStep) : s))}
                            disabled={importStep === 1}
                            className="btn"
                            style={{
                                background: "#f1f5f9", color: "#334155", border: "none",
                                borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                opacity: importStep === 1 ? 0.5 : 1,
                            }}
                        >
                            ย้อนกลับ
                        </button>
                        {importStep < LAST_IMPORT_STEP ? (
                            <button
                                onClick={() => setImportStep((s) => (s < LAST_IMPORT_STEP ? ((s + 1) as ImportStep) : s))}
                                disabled={nextDisabled}
                                className="btn"
                                style={{
                                    background: "#1e7a47", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                    opacity: nextDisabled ? 0.5 : 1,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                }}
                            >
                                {importStep === 2 && fileMetaLoading && (
                                    <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} />
                                )}
                                {importStep === 2 && fileMetaLoading ? "กำลังอ่าน metadata…" : "ถัดไป"}
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirmImport}
                                disabled={importing}
                                className="btn"
                                style={{
                                    background: "#1e7a47", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                }}
                            >
                                {importing
                                    ? <><span className="spinner-border spinner-border-sm me-2" style={{ width: 14, height: 14 }} />กำลังนำเข้า…</>
                                    : "นำเข้าข้อมูล"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Delete confirmation modal ── */}
            {pendingDelete && (
                <div
                    onClick={() => setPendingDelete(null)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 1050,
                        background: "rgba(15,23,42,0.55)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
                            boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
                        }}
                    >
                        <div style={{ padding: "26px 26px 22px" }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
                                background: "rgba(239,68,68,0.10)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#dc2626", fontSize: 24,
                            }}>
                                <i className="bi bi-exclamation-triangle-fill" />
                            </div>
                            <h3 className="fw-bold text-center mb-2" style={{ fontSize: 19, color: "#111827" }}>
                                ลบ &ldquo;{pendingDelete.name}&rdquo;?
                            </h3>
                            <p className="text-center mb-0" style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                                ชุดข้อมูลนี้จะถูกลบออกจากระบบและ<strong>ไม่สามารถกู้คืนได้</strong>
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 10, padding: "0 26px 24px" }}>
                            <button
                                onClick={() => setPendingDelete(null)}
                                className="btn"
                                style={{
                                    flex: 1, background: "#f1f5f9", color: "#334155", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: "0.875rem",
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="btn"
                                style={{
                                    flex: 1, background: "#dc2626", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: "0.875rem",
                                }}
                            >
                                <i className="bi bi-trash me-1" />ลบถาวร
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
