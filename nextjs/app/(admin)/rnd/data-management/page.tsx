"use client";

import { useEffect, useMemo, useState } from "react";
import { fromArrayBuffer, GeoTIFFImage } from "geotiff";
import initSqlJs from "sql.js";
import { Alert, Card } from "@/app/components";

// Raster header metadata read client-side from the .tif itself (geotiff.js)
// — only applies to the establishment-year-map category.
type TiffMeta = {
    kind: "tiff";
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
    crsValid: boolean;
    noDataValid: boolean;
    pixelSizeValid: boolean;
};

// GeoPackage layer metadata read client-side from the .gpkg itself (sql.js —
// a .gpkg is literally a SQLite file) — only applies to the lulc_map category.
type GpkgField = { name: string; type: string };
type GpkgMeta = {
    kind: "gpkg";
    layerName: string;
    geomColumn: string;
    featureCount: number;
    crs: string;
    fields: GpkgField[];
    crsValid: boolean;
    schemaValid: boolean;
    missingFields: string[];
};

// CSV preview read client-side (plain text parsing, no upload) — only
// applies to the biomass_profile category.
type CsvMeta = {
    kind: "csv";
    rowCount: number; // data rows, excludes the header
    headers: string[];
    sampleRows: string[][]; // up to 6 data rows
    columnsValid: boolean;
    missingColumns: string[];
    rowCountValid: boolean;
};

type FileMeta = TiffMeta | GpkgMeta | CsvMeta;

const CSV_SAMPLE_ROW_COUNT = 5;

// geo_biomass_profile's expected CSV shape — one row per integer age 0..35.
const BIOMASS_REQUIRED_COLUMNS = ["age", "dbh_est", "agb", "bgb", "biomass_est", "ci", "biomass_ci_lower", "biomass_ci_upper"] as const;
const BIOMASS_EXPECTED_ROW_COUNT = 36;

// Minimal RFC4180-ish line splitter: handles quoted fields, embedded commas,
// and "" escaped quotes. Doesn't handle a quoted field spanning multiple
// physical lines — good enough for a preview table, not a full CSV engine.
function splitCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            fields.push(current);
            current = "";
        } else {
            current += c;
        }
    }
    fields.push(current);
    return fields;
}

// geo_landuse's fixed column schema — a .gpkg must carry exactly these as
// TEXT fields, and be surveyed in EPSG:32647 (UTM 47N), to be importable.
const LULC_EXPECTED_CRS = "EPSG:32647";
const LULC_REQUIRED_FIELDS = ["LU_CODE", "LU_DES_TH", "LU_DES_EN", "LUL1_CODE", "LUL2_CODE", "LU_DES"] as const;

// Required alongside the CSV for biomass_profile — identifies which
// clone/model/equation the profile data was derived from.
const RUBBER_CLONE_OPTIONS = ["RRIM 600", "RRIT 251"] as const;
const GROWTH_MODEL_OPTIONS = [
    { label: "Cubic Polynomial", value: "cubic_poly" },
    { label: "Chapman-Richards", value: "chapman_richards" },
    { label: "Gompertz", value: "gompertz" },
    { label: "Schumacher", value: "schumacher" },
    { label: "Weibull", value: "weibull" },
] as const;
const ALLOMETRY_OPTIONS = [
    { label: "Hytönen et al. (2018)", value: "hytonen_2018" },
    { label: "Chiarawipa et al. (2024)", value: "chiarawipa_2024" },
] as const;

// geo_establishment_year's expected raster spec — a .tif must match all of
// these to be importable.
const TIFF_EXPECTED_CRS = "EPSG:32647";
const TIFF_EXPECTED_NODATA = -9999;
const TIFF_EXPECTED_PIXEL_SIZE = 10;
// Pixel size is a floating-point affine-transform value — allow a tiny
// tolerance so harmless float rounding doesn't fail an otherwise-correct file.
const PIXEL_SIZE_TOLERANCE = 0.01;

// Rasters above this pixel count are downsampled before scanning for
// min/max, so a province-wide .tif doesn't freeze the browser.
const MAX_SAMPLES_FOR_MINMAX = 25_000_000;

type DatasetCategory = "establishment_year_map" | "lulc_map" | "biomass_profile";
type DatasetStatus = "active" | "draft" | "archived";

// Categories with a real duplicate-check endpoint (p_code + year) — used to
// block re-importing a combination already in the target table.
const DUPLICATE_CHECK_ENDPOINT: Partial<Record<DatasetCategory, string>> = {
    establishment_year_map: "/api/rnd/geo-establishment-year",
    lulc_map: "/api/rnd/geo-landuse",
};

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

// A GeoPackage geometry BLOB is a small header (magic "GP", version, flags,
// SRS id, optional envelope) followed by plain WKB — strip the header and
// what's left is standard WKB that PostGIS's ST_GeomFromWKB reads directly.
// See OGC GeoPackage spec §2.1.3 "GeoPackage Binary Format".
function gpkgBlobToWkbHex(blob: Uint8Array): string {
    if (blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) {
        throw new Error("geometry BLOB ไม่ใช่รูปแบบ GeoPackage Binary ที่ถูกต้อง");
    }
    const flags = blob[3];
    const envelopeCode = (flags >> 1) & 0x07;
    const envelopeBytes = [0, 32, 48, 48, 64][envelopeCode] ?? 0;
    const wkbStart = 8 + envelopeBytes;
    const wkb = blob.subarray(wkbStart);
    return Array.from(wkb).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
    // biomass_profile-only fields — which clone/growth model/allometry the
    // uploaded CSV's coefficients were derived from.
    const [importClone, setImportClone] = useState("");
    const [importGrowthModel, setImportGrowthModel] = useState("");
    const [importAllometry, setImportAllometry] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
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

    // ── Duplicate check (p_code + year) — geo_establishment_year for
    // establishment_year_map, geo_landuse for lulc_map. ──
    const [yearExists, setYearExists] = useState<boolean | null>(null);
    const [yearExistsLoading, setYearExistsLoading] = useState(false);

    useEffect(() => {
        const endpoint = importCategory ? DUPLICATE_CHECK_ENDPOINT[importCategory] : undefined;
        if (!endpoint || !selectedProvince || !/^\d+$/.test(importVersion.trim())) {
            setYearExists(null);
            return;
        }
        let cancelled = false;
        setYearExistsLoading(true);
        fetch(`${endpoint}?pCode=${encodeURIComponent(selectedProvince.pCode)}&year=${encodeURIComponent(importVersion.trim())}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(res)))
            .then((data) => {
                if (!cancelled) setYearExists(Boolean(data.exists));
            })
            .catch(() => {
                if (!cancelled) setYearExists(null);
            })
            .finally(() => {
                if (!cancelled) setYearExistsLoading(false);
            });
        return () => { cancelled = true; };
    }, [importCategory, selectedProvince, importVersion]);

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
        setImportClone("");
        setImportGrowthModel("");
        setImportAllometry("");
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

            // Must match geo_establishment_year's expected raster spec
            // exactly — otherwise upload stays blocked at the confirm step.
            const crsValid = crs === TIFF_EXPECTED_CRS;
            const noDataValid = noData === TIFF_EXPECTED_NODATA;
            const pixelSizeValid =
                pixelSizeX !== null && pixelSizeY !== null &&
                Math.abs(pixelSizeX - TIFF_EXPECTED_PIXEL_SIZE) < PIXEL_SIZE_TOLERANCE &&
                Math.abs(pixelSizeY - TIFF_EXPECTED_PIXEL_SIZE) < PIXEL_SIZE_TOLERANCE;

            debugLog.resolvedMinMaxSource = minMaxSource;
            debugLog.resolvedMin = min;
            debugLog.resolvedMax = max;
            debugLog.crsValid = crsValid;
            debugLog.noDataValid = noDataValid;
            debugLog.pixelSizeValid = pixelSizeValid;
            console.log(`[readTiffMetadata] ${file.name}`, debugLog);
            setFileDebug(debugLog);
            setFileMeta({
                kind: "tiff", bandCount, noData, min, max, crs, pixelSizeX, pixelSizeY, pixelSizeUnit, minMaxSource,
                crsValid, noDataValid, pixelSizeValid,
            });
        } catch (err) {
            debugLog.error = err instanceof Error ? err.message : String(err);
            console.log(`[readTiffMetadata] ${file.name} — failed`, debugLog);
            setFileDebug(debugLog);
            setFileMetaError("ไม่สามารถอ่าน metadata จากไฟล์นี้ได้ — ไฟล์อาจไม่ใช่ GeoTIFF ที่ถูกต้อง");
        } finally {
            setFileMetaLoading(false);
        }
    }

    // A .gpkg is a SQLite file — sql.js (SQLite compiled to WASM) opens it
    // directly and queries its OGC-standard gpkg_* system tables for the
    // feature layer's name, CRS, row count, and column schema.
    async function readGpkgMetadata(file: File) {
        setFileMeta(null);
        setFileMetaError(null);
        setFileDebug(null);
        setFileMetaLoading(true);
        const debugLog: Record<string, unknown> = {};
        let db: Awaited<ReturnType<typeof initSqlJs>>["Database"]["prototype"] | null = null;
        try {
            const SQL = await initSqlJs({ locateFile: (f) => `/${f}` });
            const bytes = new Uint8Array(await file.arrayBuffer());
            db = new SQL.Database(bytes);

            const contents = db.exec(
                "SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features'"
            );
            debugLog.gpkgContents = contents;
            const layerRow = contents[0]?.values?.[0];
            if (!layerRow) {
                throw new Error("ไม่พบเลเยอร์ประเภท features ใน GeoPackage นี้");
            }
            const tableName = String(layerRow[0]);
            const srsId = layerRow[1];
            const quotedTable = `"${tableName.replace(/"/g, '""')}"`;

            const countResult = db.exec(`SELECT COUNT(*) FROM ${quotedTable}`);
            const featureCount = Number(countResult[0]?.values?.[0]?.[0] ?? 0);

            const srsResult = db.exec(
                "SELECT organization, organization_coordsys_id FROM gpkg_spatial_ref_sys WHERE srs_id = ?",
                [srsId as number]
            );
            debugLog.gpkgSrs = srsResult;
            const srsRow = srsResult[0]?.values?.[0];
            const crs = srsRow ? `${srsRow[0]}:${srsRow[1]}` : `srs_id ${srsId}`;

            const tableInfo = db.exec(`PRAGMA table_info(${quotedTable})`);
            debugLog.gpkgTableInfo = tableInfo;
            const fields: GpkgField[] = (tableInfo[0]?.values ?? []).map((row) => ({
                name: String(row[1]),
                type: String(row[2]),
            }));

            const geomColResult = db.exec(
                "SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?",
                [tableName]
            );
            const geomColumn = geomColResult[0]?.values?.[0]?.[0];
            if (!geomColumn) {
                throw new Error(`ไม่พบคอลัมน์ geometry สำหรับเลเยอร์ "${tableName}" ใน gpkg_geometry_columns`);
            }

            // Must match geo_landuse's fixed schema exactly: EPSG:32647, and
            // every required field present as TEXT — otherwise upload stays
            // blocked at the confirm step.
            const crsValid = crs === LULC_EXPECTED_CRS;
            const missingFields = LULC_REQUIRED_FIELDS.filter((required) => {
                const match = fields.find((f) => f.name.toUpperCase() === required);
                // OGR-exported GeoPackage text fields commonly declare a
                // length, e.g. "TEXT(254)" — still TEXT affinity, just not
                // a bare "TEXT" string.
                return !match || !/^TEXT(\(\d+\))?$/i.test(match.type.trim());
            });
            const schemaValid = missingFields.length === 0;

            debugLog.layerName = tableName;
            debugLog.geomColumn = geomColumn;
            debugLog.featureCount = featureCount;
            debugLog.resolvedCrs = crs;
            debugLog.crsValid = crsValid;
            debugLog.missingFields = missingFields;
            debugLog.schemaValid = schemaValid;
            console.log(`[readGpkgMetadata] ${file.name}`, debugLog);
            setFileDebug(debugLog);
            setFileMeta({
                kind: "gpkg",
                layerName: tableName,
                geomColumn: String(geomColumn),
                featureCount,
                crs,
                fields,
                crsValid,
                schemaValid,
                missingFields,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            debugLog.error = message;
            console.log(`[readGpkgMetadata] ${file.name} — failed`, debugLog);
            setFileDebug(debugLog);
            // Show the real error instead of a generic message — sql.js/SQL
            // failures (wrong table name, bad bind param, WASM load issue,
            // etc.) look identical to "not a GeoPackage" otherwise.
            setFileMetaError(message);
        } finally {
            db?.close();
            setFileMetaLoading(false);
        }
    }

    async function readCsvMetadata(file: File) {
        // No on-page debug panel for CSV — it's a simple preview, not worth
        // the "Metadata ที่อ่านได้จากไฟล์" treatment the raster/vector readers get.
        setFileMeta(null);
        setFileMetaError(null);
        setFileMetaLoading(true);
        try {
            const text = await file.text();
            const lines = text.split(/\r\n|\r|\n/);
            // Drop a trailing blank line from the file's final newline.
            if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
            if (lines.length === 0) {
                throw new Error("ไฟล์ CSV ว่างเปล่า");
            }

            const headers = splitCsvLine(lines[0]);
            const dataLines = lines.slice(1);
            const rowCount = dataLines.length;
            const sampleRows = dataLines.slice(0, CSV_SAMPLE_ROW_COUNT).map(splitCsvLine);

            // Must match geo_biomass_profile's expected shape exactly —
            // otherwise upload stays blocked at the confirm step.
            const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()));
            const missingColumns = BIOMASS_REQUIRED_COLUMNS.filter((col) => !headerSet.has(col));
            const columnsValid = missingColumns.length === 0;
            const rowCountValid = rowCount === BIOMASS_EXPECTED_ROW_COUNT;

            setFileMeta({ kind: "csv", rowCount, headers, sampleRows, columnsValid, missingColumns, rowCountValid });
        } catch (err) {
            setFileMetaError(err instanceof Error ? err.message : String(err));
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
        } else if (file && importCategory === "lulc_map") {
            void readGpkgMetadata(file);
        } else if (file && importCategory === "biomass_profile") {
            void readCsvMetadata(file);
        }
    }

    // Each category accepts a different file type — a file picked for the
    // previous category is no longer valid, so clear it and force reselection.
    function handleImportCategoryChange(category: DatasetCategory) {
        setImportCategory(category);
        setImportFile(null);
        setFileMeta(null);
        setFileMetaError(null);
        setFileDebug(null);
        setImportClone("");
        setImportGrowthModel("");
        setImportAllometry("");
    }

    // Re-opens the .gpkg (sql.js state from the preview read isn't kept
    // around) and pulls every feature's 6 required fields + geometry, ready
    // to POST to /api/rnd/geo-landuse.
    async function extractLulcRows(file: File, meta: GpkgMeta) {
        const SQL = await initSqlJs({ locateFile: (f) => `/${f}` });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const db = new SQL.Database(bytes);
        try {
            const quotedTable = `"${meta.layerName.replace(/"/g, '""')}"`;
            const quotedGeomCol = `"${meta.geomColumn.replace(/"/g, '""')}"`;
            const result = db.exec(
                `SELECT LU_CODE, LU_DES_TH, LU_DES_EN, LUL1_CODE, LUL2_CODE, LU_DES, ${quotedGeomCol} FROM ${quotedTable}`
            );
            const values = result[0]?.values ?? [];
            return values.map((row) => {
                const geomBlob = row[6];
                if (!(geomBlob instanceof Uint8Array)) {
                    throw new Error("ไม่สามารถอ่านค่าคอลัมน์ geometry ได้");
                }
                return {
                    luCode: row[0] === null ? null : String(row[0]),
                    luDesTh: row[1] === null ? null : String(row[1]),
                    luDesEn: row[2] === null ? null : String(row[2]),
                    lul1Code: row[3] === null ? null : String(row[3]),
                    lul2Code: row[4] === null ? null : String(row[4]),
                    luDes: row[5] === null ? null : String(row[5]),
                    geomWkbHex: gpkgBlobToWkbHex(geomBlob),
                };
            });
        } finally {
            db.close();
        }
    }

    // Re-reads the CSV (only a sample was kept in state) and maps each row's
    // 8 required columns to numbers by header name (case-insensitive),
    // ready to POST to /api/rnd/biomass-profile.
    async function extractBiomassRows(file: File, headers: string[]) {
        const text = await file.text();
        const lines = text.split(/\r\n|\r|\n/);
        if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
        const dataLines = lines.slice(1);

        const colIndex = (name: string) => headers.findIndex((h) => h.trim().toLowerCase() === name);
        const idx = {
            age: colIndex("age"),
            dbhEst: colIndex("dbh_est"),
            agb: colIndex("agb"),
            bgb: colIndex("bgb"),
            biomassEst: colIndex("biomass_est"),
            ci: colIndex("ci"),
            biomassCiLower: colIndex("biomass_ci_lower"),
            biomassCiUpper: colIndex("biomass_ci_upper"),
        };

        return dataLines.map((line) => {
            const cells = splitCsvLine(line);
            const num = (i: number): number | null => {
                const v = cells[i]?.trim();
                if (!v) return null;
                const n = Number(v);
                return Number.isNaN(n) ? null : n;
            };
            const ageValue = num(idx.age);
            if (ageValue === null || !Number.isInteger(ageValue)) {
                throw new Error(`พบแถวที่คอลัมน์ age ไม่ใช่จำนวนเต็ม: "${cells[idx.age] ?? ""}"`);
            }
            return {
                age: ageValue,
                dbhEst: num(idx.dbhEst),
                agb: num(idx.agb),
                bgb: num(idx.bgb),
                biomassEst: num(idx.biomassEst),
                ci: num(idx.ci),
                biomassCiLower: num(idx.biomassCiLower),
                biomassCiUpper: num(idx.biomassCiUpper),
            };
        });
    }

    async function handleConfirmImport() {
        if (!selectedProvince || !importCategory || !importVersion.trim() || !importFile) return;
        setConfirmError(null);
        setImporting(true);

        if (importCategory === "establishment_year_map") {
            // Blocked well before this point by the confirm button itself,
            // but re-checked here so a stale click can't slip through.
            if (fileMeta?.kind !== "tiff" || !fileMeta.crsValid || !fileMeta.noDataValid || !fileMeta.pixelSizeValid || yearExists !== false) {
                setConfirmError("ไฟล์ยังไม่ผ่านเงื่อนไข CRS/No-Data/Pixel Size หรือจังหวัด+ปีนี้มีข้อมูลอยู่แล้ว ย้อนกลับไปตรวจสอบข้อมูลอีกครั้ง");
                setImporting(false);
                return;
            }
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

        if (importCategory === "lulc_map") {
            // Blocked well before this point by the confirm button itself,
            // but re-checked here so a stale click can't slip through.
            if (fileMeta?.kind !== "gpkg" || !fileMeta.crsValid || !fileMeta.schemaValid || yearExists !== false) {
                setConfirmError("ไฟล์ยังไม่ผ่านการตรวจสอบ CRS/โครงสร้างฟิลด์ หรือจังหวัด+ปีนี้มีข้อมูลอยู่แล้ว ย้อนกลับไปตรวจสอบข้อมูลอีกครั้ง");
                setImporting(false);
                return;
            }
            try {
                const rows = await extractLulcRows(importFile, fileMeta);
                const res = await fetch("/api/rnd/geo-landuse", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pCode: selectedProvince.pCode, year: Number(importVersion.trim()), rows }),
                });
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
                setSuccess(`นำเข้า “${newDataset.name}” สำเร็จ (${data.featureCount} features)`);
                setTimeout(() => setSuccess(null), 3000);
                resetImportWizard();
            } catch (err) {
                setConfirmError(err instanceof Error ? err.message : "นำเข้าไฟล์ไม่สำเร็จ");
            } finally {
                setImporting(false);
            }
            return;
        }

        // importCategory === "biomass_profile" — real import, persisted into
        // tbl_biomass_profile.
        // Blocked well before this point by the confirm button itself,
        // but re-checked here so a stale click can't slip through.
        if (fileMeta?.kind !== "csv" || !fileMeta.columnsValid || !fileMeta.rowCountValid) {
            setConfirmError("ไฟล์ยังไม่ผ่านเงื่อนไขคอลัมน์/จำนวนแถว ย้อนกลับไปตรวจสอบข้อมูลอีกครั้ง");
            setImporting(false);
            return;
        }
        try {
            const rows = await extractBiomassRows(importFile, fileMeta.headers);
            const res = await fetch("/api/rnd/biomass-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pCode: selectedProvince.pCode,
                    version: importVersion.trim() || null,
                    clone: importClone,
                    growthModel: importGrowthModel,
                    allometry: importAllometry,
                    rows,
                }),
            });
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
            setSuccess(`นำเข้า “${newDataset.name}” สำเร็จ (${data.rowCount} แถว)`);
            setTimeout(() => setSuccess(null), 3000);
            resetImportWizard();
        } catch (err) {
            setConfirmError(err instanceof Error ? err.message : "นำเข้าไฟล์ไม่สำเร็จ");
        } finally {
            setImporting(false);
        }
    }

    // Block "ถัดไป" out of step 2 while the .tif metadata read is still in
    // flight — the review step needs fileMeta settled before the user moves on.
    // geo_establishment_year.year and geo_landuse.lu_year are both integer
    // columns — free text like "v1" doesn't fit, so these categories require
    // a numeric year specifically.
    const requiresNumericVersion = importCategory === "establishment_year_map" || importCategory === "lulc_map";
    const versionIsValid = requiresNumericVersion
        ? /^\d+$/.test(importVersion.trim())
        : !!importVersion.trim();

    const biomassFieldsMissing =
        importCategory === "biomass_profile" && (!importClone || !importGrowthModel || !importAllometry);

    const nextDisabled =
        (importStep === 1 && !importPCode) ||
        (importStep === 2 && (!importCategory || !versionIsValid || !importFile || fileMetaLoading || biomassFieldsMissing));

    // lulc_map may only be confirmed once the .gpkg has been read AND
    // matches geo_landuse's fixed schema exactly (CRS + the 6 required
    // text fields) AND this province+year combination isn't already in the
    // table — checked client-side before ever hitting the API.
    const lulcSchemaOk =
        importCategory !== "lulc_map" ||
        (fileMeta?.kind === "gpkg" && fileMeta.crsValid && fileMeta.schemaValid && yearExists === false);
    // establishment_year_map may only be confirmed once the .tif matches the
    // expected raster spec exactly (CRS, NoData, Pixel Size) AND this
    // province+year combination isn't already in the table.
    const tiffSpecOk =
        importCategory !== "establishment_year_map" ||
        (fileMeta?.kind === "tiff" && fileMeta.crsValid && fileMeta.noDataValid && fileMeta.pixelSizeValid && yearExists === false);
    // biomass_profile may only be confirmed once the CSV has all 8 required
    // columns AND exactly 36 rows (age 0-35).
    const biomassCsvOk =
        importCategory !== "biomass_profile" ||
        (fileMeta?.kind === "csv" && fileMeta.columnsValid && fileMeta.rowCountValid);
    const confirmDisabled = importing || !lulcSchemaOk || !tiffSpecOk || !biomassCsvOk;

    const reviewRows: { label: string; value: string }[] = [
        { label: "จังหวัด", value: selectedProvince ? `${selectedProvince.nameTh} (${selectedProvince.pCode})` : "-" },
        { label: "ประเภทข้อมูล", value: importCategory ? CATEGORY_META[importCategory].label : "-" },
        { label: "เวอร์ชัน/ปี", value: importVersion.trim() },
    ];
    if (importCategory === "biomass_profile") {
        reviewRows.push(
            { label: "พันธุ์ยาง (Clone)", value: importClone || "-" },
            { label: "สมการ Growth Model", value: GROWTH_MODEL_OPTIONS.find((m) => m.value === importGrowthModel)?.label ?? "-" },
            { label: "สมการ Allometry", value: ALLOMETRY_OPTIONS.find((eq) => eq.value === importAllometry)?.label ?? "-" },
        );
    }
    reviewRows.push(
        { label: "ไฟล์", value: importFile?.name ?? "-" },
        { label: "ขนาดไฟล์", value: importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "-" },
    );
    if (importCategory === "establishment_year_map" || importCategory === "lulc_map" || importCategory === "biomass_profile") {
        if (fileMetaLoading) {
            reviewRows.push({ label: "Metadata ไฟล์", value: "กำลังอ่าน…" });
        } else if (fileMetaError) {
            reviewRows.push({ label: "Metadata ไฟล์", value: fileMetaError });
        } else if (fileMeta?.kind === "tiff") {
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
        } else if (fileMeta?.kind === "gpkg") {
            reviewRows.push(
                { label: "เลเยอร์ (Layer)", value: fileMeta.layerName },
                { label: "จำนวน Feature", value: fileMeta.featureCount.toLocaleString("th-TH") },
                { label: "ระบบพิกัด (CRS)", value: fileMeta.crs },
                { label: "จำนวนฟิลด์ (Fields)", value: String(fileMeta.fields.length) },
            );
        } else if (fileMeta?.kind === "csv") {
            reviewRows.push(
                { label: "จำนวนแถวข้อมูล (Rows)", value: fileMeta.rowCount.toLocaleString("th-TH") },
                { label: "จำนวนคอลัมน์ (Columns)", value: String(fileMeta.headers.length) },
            );
        }
    }

    return (
        <>
            {/* ── Hero card ── */}
            <Card className="border-0 shadow-sm mb-4 overflow-hidden">
                <div className="p-4 p-md-5" style={{ background: HERO_BG, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <h1 className="fw-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1a3d2b", fontSize: 26 }}>จัดการข้อมูล GeoAI</h1>
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
                                <th className="py-3" style={TH_STYLE}>ปี</th>
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
                                    onChange={(e) => handleImportCategoryChange(e.target.value as DatasetCategory)}
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
                                    placeholder={requiresNumericVersion ? "เช่น 2568" : "เช่น v1, 2568"}
                                    inputMode={requiresNumericVersion ? "numeric" : "text"}
                                    maxLength={10}
                                    style={{ width: "100%", borderRadius: 10, border: "1px solid #e6f0ea", background: "#fff", padding: "9px 12px", fontSize: 14, outline: "none", color: "#1a3d2b" }}
                                />
                                {requiresNumericVersion && importVersion.trim() !== "" && !versionIsValid && (
                                    <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 4 }}>
                                        ต้องเป็นตัวเลขปี (year) ที่เป็นจำนวนเต็มเท่านั้น
                                    </div>
                                )}
                            </div>
                            {importCategory === "biomass_profile" && (
                                <>
                                    <div className="mb-3">
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>
                                            พันธุ์ยาง (Clone) <span style={{ color: "#dc2626" }}>*</span>
                                        </div>
                                        <select
                                            value={importClone}
                                            onChange={(e) => setImportClone(e.target.value)}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">เลือกพันธุ์ยาง…</option>
                                            {RUBBER_CLONE_OPTIONS.map((clone) => (
                                                <option key={clone} value={clone}>{clone}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>
                                            สมการ Growth Model <span style={{ color: "#dc2626" }}>*</span>
                                        </div>
                                        <select
                                            value={importGrowthModel}
                                            onChange={(e) => setImportGrowthModel(e.target.value)}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">เลือกสมการ Growth Model…</option>
                                            {GROWTH_MODEL_OPTIONS.map((model) => (
                                                <option key={model.value} value={model.value}>{model.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#5a7a65", marginBottom: 4 }}>
                                            สมการ Allometry <span style={{ color: "#dc2626" }}>*</span>
                                        </div>
                                        <select
                                            value={importAllometry}
                                            onChange={(e) => setImportAllometry(e.target.value)}
                                            className="form-select"
                                            style={{ borderRadius: 10, border: "1px solid #e6f0ea", fontSize: 14, color: "#1a3d2b", padding: "9px 12px" }}
                                        >
                                            <option value="">เลือกสมการ Allometry…</option>
                                            {ALLOMETRY_OPTIONS.map((eq) => (
                                                <option key={eq.value} value={eq.value}>{eq.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
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
                                            {(importCategory === "establishment_year_map" || importCategory === "lulc_map") && (
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
                                        key={importCategory}
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

                            {fileMeta?.kind === "gpkg" && (
                                <div className="mt-3">
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65", marginBottom: 6 }}>
                                        Fields
                                    </div>
                                    <div style={{ border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
                                        <div className="table-responsive" style={{ maxHeight: 260, overflowY: "auto" }}>
                                            <table className="table table-sm mb-0" style={{ fontSize: 12.5 }}>
                                                <thead style={{ background: "#f8fbf9" }}>
                                                    <tr>
                                                        <th className="px-3 py-2" style={TH_STYLE}>ชื่อฟิลด์</th>
                                                        <th className="px-3 py-2" style={TH_STYLE}>ชนิดข้อมูล</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fileMeta.fields.map((field) => (
                                                        <tr key={field.name}>
                                                            <td className="px-3 py-2" style={{ color: "#1a3d2b" }}>{field.name}</td>
                                                            <td className="px-3 py-2" style={{ color: "#5a7a65" }}>{field.type || "-"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {fileMeta?.kind === "csv" && (
                                <div className="mt-3">
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65", marginBottom: 6 }}>
                                        ตัวอย่างข้อมูล ({fileMeta.sampleRows.length} จาก {fileMeta.rowCount.toLocaleString("th-TH")} แถว)
                                    </div>
                                    <div style={{ border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
                                        <div className="table-responsive" style={{ maxHeight: 260, overflowY: "auto" }}>
                                            <table className="table table-sm mb-0" style={{ fontSize: 12.5 }}>
                                                <thead style={{ background: "#f8fbf9" }}>
                                                    <tr>
                                                        {fileMeta.headers.map((header, i) => (
                                                            <th key={i} className="px-3 py-2" style={TH_STYLE}>{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fileMeta.sampleRows.map((row, i) => (
                                                        <tr key={i}>
                                                            {row.map((cell, j) => (
                                                                <td key={j} className="px-3 py-2" style={{ color: "#1a3d2b" }}>{cell || "-"}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                            {importCategory === "lulc_map" && (
                                <div style={{
                                    marginTop: 12, padding: "12px 16px", borderRadius: 10, textAlign: "left",
                                    background: lulcSchemaOk ? "#f8fbf9" : "#fef2f2",
                                    border: `1px solid ${lulcSchemaOk ? "#e6f0ea" : "#fecaca"}`,
                                }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65", marginBottom: 6 }}>
                                        เงื่อนไขการนำเข้าข้อมูลการใช้ประโยชน์ที่ดิน (LULC)
                                    </div>
                                    {[
                                        {
                                            ok: fileMeta?.kind === "gpkg" && fileMeta.crsValid,
                                            label: `CRS = ${LULC_EXPECTED_CRS}${fileMeta?.kind === "gpkg" ? ` (พบ ${fileMeta.crs})` : ""}`,
                                        },
                                        {
                                            ok: fileMeta?.kind === "gpkg" && fileMeta.schemaValid,
                                            label: (
                                                <>
                                                    มีฟิลด์ {LULC_REQUIRED_FIELDS.join(", ")} ครบ
                                                    {fileMeta?.kind === "gpkg" && fileMeta.missingFields.length > 0 && (
                                                        <> — ขาด/ผิดชนิด: {fileMeta.missingFields.join(", ")}</>
                                                    )}
                                                </>
                                            ),
                                        },
                                        {
                                            ok: yearExists === false,
                                            label: yearExistsLoading
                                                ? `กำลังตรวจสอบว่าจังหวัด+ปีนี้เคยนำเข้าแล้วหรือไม่…`
                                                : yearExists === true
                                                    ? `จังหวัด ${selectedProvince?.pCode} ปี ${importVersion.trim()} มีข้อมูลอยู่แล้ว`
                                                    : `จังหวัด+ปีนี้ยังไม่เคยนำเข้า`,
                                        },
                                    ].map((check, i) => (
                                        <div key={i} className="d-flex align-items-center gap-2" style={{ fontSize: 13, marginBottom: i < 2 ? 4 : 0 }}>
                                            <i className={`bi ${check.ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}`}
                                               style={{ color: check.ok ? "#1e7a47" : "#dc2626" }} />
                                            <span>{check.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {importCategory === "establishment_year_map" && (
                                <div style={{
                                    marginTop: 12, padding: "12px 16px", borderRadius: 10, textAlign: "left",
                                    background: tiffSpecOk ? "#f8fbf9" : "#fef2f2",
                                    border: `1px solid ${tiffSpecOk ? "#e6f0ea" : "#fecaca"}`,
                                }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65", marginBottom: 6 }}>
                                        เงื่อนไขการนำเข้าข้อมูลแผนที่ปีเริ่มปลูก(TIFF)
                                    </div>
                                    {[
                                        {
                                            ok: fileMeta?.kind === "tiff" && fileMeta.crsValid,
                                            label: `CRS = ${TIFF_EXPECTED_CRS}${fileMeta?.kind === "tiff" ? ` (พบ ${fileMeta.crs})` : ""}`,
                                        },
                                        {
                                            ok: fileMeta?.kind === "tiff" && fileMeta.noDataValid,
                                            label: `No-Data = ${TIFF_EXPECTED_NODATA}${fileMeta?.kind === "tiff" ? ` (พบ ${fileMeta.noData ?? "ไม่ระบุ"})` : ""}`,
                                        },
                                        {
                                            ok: fileMeta?.kind === "tiff" && fileMeta.pixelSizeValid,
                                            label: `Pixel Size = ${TIFF_EXPECTED_PIXEL_SIZE} × ${TIFF_EXPECTED_PIXEL_SIZE}${fileMeta?.kind === "tiff" && fileMeta.pixelSizeX !== null && fileMeta.pixelSizeY !== null ? ` (พบ ${fileMeta.pixelSizeX} × ${fileMeta.pixelSizeY})` : ""}`,
                                        },
                                        {
                                            ok: yearExists === false,
                                            label: yearExistsLoading
                                                ? `กำลังตรวจสอบว่าจังหวัด+ปีนี้เคยนำเข้าแล้วหรือไม่…`
                                                : yearExists === true
                                                    ? `จังหวัด ${selectedProvince?.pCode}  ${importVersion.trim()} มีข้อมูลอยู่แล้ว`
                                                    : `จังหวัด+ปีนี้ยังไม่เคยนำเข้า`,
                                        },
                                    ].map((check, i) => (
                                        <div key={i} className="d-flex align-items-center gap-2" style={{ fontSize: 13, marginBottom: i < 3 ? 4 : 0 }}>
                                            <i className={`bi ${check.ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}`}
                                               style={{ color: check.ok ? "#1e7a47" : "#dc2626" }} />
                                            <span>{check.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {importCategory === "biomass_profile" && (
                                <div style={{
                                    marginTop: 12, padding: "12px 16px", borderRadius: 10, textAlign: "left",
                                    background: biomassCsvOk ? "#f8fbf9" : "#fef2f2",
                                    border: `1px solid ${biomassCsvOk ? "#e6f0ea" : "#fecaca"}`,
                                }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a7a65", marginBottom: 6 }}>
                                        เงื่อนไขการนำเข้า Biomass Profile (CSV)
                                    </div>
                                    {[
                                        {
                                            ok: fileMeta?.kind === "csv" && fileMeta.columnsValid,
                                            label: (
                                                <>
                                                    มีคอลัมน์ {BIOMASS_REQUIRED_COLUMNS.join(", ")} ครบ
                                                    {fileMeta?.kind === "csv" && fileMeta.missingColumns.length > 0 && (
                                                        <> — ขาด: {fileMeta.missingColumns.join(", ")}</>
                                                    )}
                                                </>
                                            ),
                                        },
                                        {
                                            ok: fileMeta?.kind === "csv" && fileMeta.rowCountValid,
                                            label: `มี ${BIOMASS_EXPECTED_ROW_COUNT} แถว (age 0-35)${fileMeta?.kind === "csv" ? ` (พบ ${fileMeta.rowCount} แถว)` : ""}`,
                                        },
                                    ].map((check, i) => (
                                        <div key={i} className="d-flex align-items-center gap-2" style={{ fontSize: 13, marginBottom: i < 1 ? 4 : 0 }}>
                                            <i className={`bi ${check.ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}`}
                                               style={{ color: check.ok ? "#1e7a47" : "#dc2626" }} />
                                            <span>{check.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                                disabled={confirmDisabled}
                                className="btn"
                                style={{
                                    background: "#1e7a47", color: "#fff", border: "none",
                                    borderRadius: 10, padding: "9px 20px", fontWeight: 600, fontSize: "0.85rem",
                                    opacity: confirmDisabled ? 0.5 : 1,
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
