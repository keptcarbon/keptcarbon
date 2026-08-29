"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CarbonBarChart, profileToBarPoints, type BarPoint } from "./CarbonBarChart";
import { assessCarbon, type CarbonAssessRequest, type CarbonAssessResponse, type YearlyAssess } from "@/lib/carbon-api";
import { generatePolygonId } from "@/lib/map-utils";
import { PlotDetailCard } from "./PlotDetailCard";
import {
    type PlotFormData,
    type CarbonResult,
    VARIETY_OPTIONS,
    SPACING_OPTIONS,
    SUPPORTED_CLONES,
    NEW_YEAR_OPTIONS,
    OLD_YEAR_OPTIONS,
    LU_DESC_MAP,
    CURRENT_BE,
    isPointInGeometry,
    getSamplePoint,
    getFriendlyErrorMessage,
    computePlot,
    aggregateProfiles,
} from "./utils";


// ── Types ─────────────────────────────────────────────────────────────────
type Props = {
    searchRunning: boolean;
    searchErr: string | null;
    searchCount: number | null;
    searchTruncated: boolean;
    parcelFeatures: GeoJSON.Feature[];
    luFeatures?: GeoJSON.Feature[];
    rawPlantationInfo?: any[];
    userDisplayName?: string;
    drawnGeometry?: GeoJSON.Geometry | null;
    onFlyTo: (feature: GeoJSON.Feature) => void;
    onReset?: () => void;
    onBack?: () => void;
    onCancel?: () => void;
    currentStep: 1 | 2 | 3;
    onStepChange: (step: 1 | 2 | 3) => void;
    selectedMapPlotIndex?: number | "total";
    onMapPlotSelected?: (idx: number | "total") => void;
    onDeleteParcel?: (idx: number) => void;
    onDrawMore?: () => void;
    drawMoreDisabled?: boolean;
    onCancelDraw?: () => void;
    onFinishDraw?: () => void;
    drawVertCount?: number;
    isDrawing?: boolean;
    onLandUseChange?: (allPlotsChecked: Record<number, Record<string, boolean>>, focusedPlotIdx?: number | null) => void;
    onProjectTypeChange?: (type: "replanting" | "existing") => void;
    projectName?: string;
    onProjectNameChange?: (name: string) => void;
    onBeforeProcess?: () => boolean;
    autoProcessTrigger?: number;
    onSave?: () => void;
    onProjectSaved?: (info: { projectId: number; guestKey: string | null }) => void;
    /** Bump this to detach from the current DB project (e.g. it was soft-deleted upstream) so the next save creates a new one. */
    resetProjectToken?: number;
    existingProjectPlots?: any[];
    editingPlotId?: string | null;
    onPlotFormsChange?: (forms: PlotFormData[]) => void;
};



// ── Accordion body: pure height slide, animates open AND close, keeps the
//    content mounted until the collapse finishes so it doesn't snap shut. ──────
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
    const [render, setRender] = useState(open);
    useEffect(() => {
        if (open) setRender(true);
    }, [open]);
    return (
        <div
            className="prp-accordion-slide"
            data-open={open ? "true" : "false"}
            onTransitionEnd={(e) => {
                if (e.propertyName === "grid-template-rows" && e.target === e.currentTarget && !open) {
                    setRender(false);
                }
            }}
        >
            <div>{render ? children : null}</div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ParcelResultsPanel({
    searchRunning,
    searchErr,
    searchCount,
    searchTruncated,
    parcelFeatures,
    luFeatures = [],
    rawPlantationInfo,
    userDisplayName = "",
    drawnGeometry = null,
    onFlyTo,
    onReset,
    onBack,
    onCancel,
    currentStep,
    onStepChange,
    selectedMapPlotIndex = "total",
    onMapPlotSelected,
    onDeleteParcel,
    onDrawMore,
    drawMoreDisabled,
    onCancelDraw,
    onFinishDraw,
    drawVertCount = 0,
    isDrawing,
    onLandUseChange,
    onProjectTypeChange,
    projectName = "",
    onProjectNameChange,
    onBeforeProcess,
    autoProcessTrigger,
    onSave,
    onProjectSaved,
    resetProjectToken,
    existingProjectPlots,
    editingPlotId,
    onPlotFormsChange,
}: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    const [expandedResultIdx, setExpandedResultIdx] = useState<number | "total" | null>(null);
    const [backendResponses, setBackendResponses] = useState<CarbonAssessResponse[] | null>(null);
    const { user } = useAuth();

    const [cloneOptions, setCloneOptions] = useState<string[]>(VARIETY_OPTIONS);
    const [spacingOptions, setSpacingOptions] = useState<string[]>(SPACING_OPTIONS);

    // Load พันธุ์ยาง / ระยะปลูก dropdown options from tbl_rubber_clone and
    // tbl_tree_density, falling back to the static defaults above on failure.
    useEffect(() => {
        let cancelled = false;
        fetch("/api/rubber-clone")
            .then(res => (res.ok ? res.json() : Promise.reject(res)))
            .then(data => {
                if (!cancelled && Array.isArray(data.rows) && data.rows.length > 0) {
                    setCloneOptions(data.rows.map((r: { clone: string }) => r.clone));
                }
            })
            .catch(() => {});
        fetch("/api/tree-density")
            .then(res => (res.ok ? res.json() : Promise.reject(res)))
            .then(data => {
                if (!cancelled && Array.isArray(data.rows) && data.rows.length > 0) {
                    setSpacingOptions(data.rows.map((r: { treeSpacing: string }) => r.treeSpacing));
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const plots = useMemo(() => parcelFeatures.map(computePlot), [parcelFeatures]);
    const totalArea = useMemo(() => plots.reduce((s, p) => s + p.areaRai, 0), [plots]);

    // Build real land-use area data from luFeatures (lu_polygon properties from plantation-info API)
    const plotsLuRealData = useMemo(() => {
        const dataArr: Record<string, { rai: number; pct: number; desc?: string }>[] = [];
        const featuresToUse = luFeatures.length > 0 ? luFeatures : parcelFeatures;

        const featsByPlot: Record<number, typeof featuresToUse> = {};
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            featsByPlot[idx] = [];
        }

        featuresToUse.forEach(feat => {
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            const plotIdxFromProp = props.plot_index !== undefined
                ? parseInt(String(props.plot_index), 10) - 1
                : -1;
            let matchedPlotIdx = 0;
            if (plotIdxFromProp >= 0 && plotIdxFromProp < parcelFeatures.length) {
                matchedPlotIdx = plotIdxFromProp;
            } else {
                const samplePoint = getSamplePoint(feat.geometry);
                for (let idx = 0; idx < parcelFeatures.length; idx++) {
                    if (isPointInGeometry(samplePoint, parcelFeatures[idx].geometry)) {
                        matchedPlotIdx = idx;
                        break;
                    }
                }
            }
            featsByPlot[matchedPlotIdx].push(feat);
        });

        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const plotFeats = featsByPlot[idx] || [];
            const data: Record<string, { rai: number; pct: number; desc?: string }> = {};
            const plotTotalArea = plots[idx]?.areaRai || 0;

            let totalIntersectedM2 = 0;
            for (const feat of plotFeats) {
                const p = (feat.properties ?? {}) as Record<string, unknown>;
                const m2 = (p.area_m2 as number) || 0;
                if (p.lu_class) totalIntersectedM2 += m2;
            }

            const scaleFactor = (totalIntersectedM2 > 0 && plotTotalArea > 0)
                ? (plotTotalArea * 1600) / totalIntersectedM2
                : 1.0;

            for (const feat of plotFeats) {
                const p = (feat.properties ?? {}) as Record<string, unknown>;
                const cls = p.lu_class as string | undefined;
                const desc = p.lu_class_desc_th as string | undefined;
                const rawM2 = (p.area_m2 as number) || 0;

                if (cls) {
                    const scaledM2 = rawM2 * scaleFactor;
                    const scaledRai = scaledM2 / 1600;
                    const scaledPct = totalIntersectedM2 > 0 ? (rawM2 / totalIntersectedM2) * 100 : 0;

                    if (!data[cls]) {
                        data[cls] = { rai: 0, pct: 0, desc: desc || "" };
                    }
                    data[cls].rai += scaledRai;
                    data[cls].pct += scaledPct;
                    if (desc) data[cls].desc = desc;
                }
            }

            let aRai = 0, aPct = 0;
            for (const key in data) {
                if (key.startsWith("A") && key !== "A") {
                    aRai += data[key].rai;
                    aPct += data[key].pct;
                }
            }
            if (aRai > 0) {
                data["A"] = { rai: aRai, pct: aPct, desc: data["A"]?.desc || LU_DESC_MAP["A"] };
            }

            const parentKeys = ["A", "U", "F", "W", "M"];
            let roundedParentRaiSum = 0, roundedParentPctSum = 0;
            let largestParentKey = "", maxRai = -1;

            for (const key in data) {
                data[key].rai = Math.round(data[key].rai * 100) / 100;
                data[key].pct = Math.round(data[key].pct * 10) / 10;
                if (parentKeys.includes(key)) {
                    roundedParentRaiSum += data[key].rai;
                    roundedParentPctSum += data[key].pct;
                    if (data[key].rai > maxRai) {
                        maxRai = data[key].rai;
                        largestParentKey = key;
                    }
                }
            }

            if (plotTotalArea > 0 && largestParentKey) {
                const raiDiff = plotTotalArea - roundedParentRaiSum;
                const pctDiff = 100.0 - roundedParentPctSum;
                if (Math.abs(raiDiff) < 0.2) {
                    data[largestParentKey].rai = Math.round((data[largestParentKey].rai + raiDiff) * 100) / 100;
                }
                if (Math.abs(pctDiff) < 2.0) {
                    data[largestParentKey].pct = Math.round((data[largestParentKey].pct + pctDiff) * 10) / 10;
                }
            }

            if (data["A"]) {
                const subKeys = Object.keys(data).filter(k => k.startsWith("A") && k !== "A");
                if (subKeys.length > 0) {
                    let roundedSubRaiSum = 0, roundedSubPctSum = 0;
                    let largestSubKey = "", maxSubRai = -1;
                    subKeys.forEach(k => {
                        roundedSubRaiSum += data[k].rai;
                        roundedSubPctSum += data[k].pct;
                        if (data[k].rai > maxSubRai) {
                            maxSubRai = data[k].rai;
                            largestSubKey = k;
                        }
                    });
                    if (largestSubKey) {
                        const subRaiDiff = data["A"].rai - roundedSubRaiSum;
                        const subPctDiff = data["A"].pct - roundedSubPctSum;
                        if (Math.abs(subRaiDiff) < 0.2) {
                            data[largestSubKey].rai = Math.round((data[largestSubKey].rai + subRaiDiff) * 100) / 100;
                        }
                        if (Math.abs(subPctDiff) < 2.0) {
                            data[largestSubKey].pct = Math.round((data[largestSubKey].pct + subPctDiff) * 10) / 10;
                        }
                    }
                }
            }
            dataArr.push(data);
        }
        return dataArr;
    }, [parcelFeatures, luFeatures, plots]);
    const dominantProvince = useMemo(() => {
        const freq: Record<string, number> = {};
        plots.forEach(p => { if (p.province) freq[p.province] = (freq[p.province] ?? 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }, [plots]);

    // Responsive detection
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const prevPlotsLen = useRef(plots.length);
    useEffect(() => {
        if (plots.length > prevPlotsLen.current) {
            setExpandedIdx(plots.length - 1);
        }
        prevPlotsLen.current = plots.length;
    }, [plots.length]);


    const searchParams = useSearchParams();
    const initialProjectName = searchParams.get("project") || "";

    const [ownerName, setOwnerName] = useState(userDisplayName);
    const [province, setProvince] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");

    useEffect(() => {
        setSaveState("idle");
    }, [projectName]);
    const [dbProjectId, setDbProjectId] = useState<number | null>(null);
    const [guestUserId, setGuestUserId] = useState<string | null>(null);

    // Parent bumps resetProjectToken after soft-deleting our current project
    // (e.g. guest discarded it to start a new area) — detach so the next save
    // POSTs a fresh project instead of PATCHing the now-deleted one.
    useEffect(() => {
        if (resetProjectToken === undefined) return;
        setDbProjectId(null);
        setGuestUserId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetProjectToken]);

    // auth-context's refresh() auto-claims any guest project sitting in
    // localStorage as soon as `user` goes truthy on login — server-side that
    // clones it into a new user-owned row and soft-deletes this one. Detach
    // here too so the next save POSTs (finds/merges into the clone by
    // user_uuid+name) instead of PATCHing the now-deleted guest row.
    const prevUserRef = useRef(user);
    useEffect(() => {
        const justLoggedIn = !prevUserRef.current && !!user;
        prevUserRef.current = user;
        if (justLoggedIn && guestUserId) {
            setDbProjectId(null);
            setGuestUserId(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const [plotForms, setPlotForms] = useState<PlotFormData[]>([]);

    // Let the parent know the latest plotForms (e.g. plantStatus/"ปลูกมาแล้ว")
    // so it can include them when stashing a guest-session snapshot before an
    // auth redirect — plotForms lives only here and never writes back into
    // parcelFeatures on its own.
    useEffect(() => {
        onPlotFormsChange?.(plotForms);
    }, [plotForms, onPlotFormsChange]);

    // Existing project names for the logged-in user, used to warn about a
    // duplicate name before saving. Read from the DB (the previous localStorage
    // check was never populated, so it never actually fired). Re-fetched after
    // each save so a name saved this session is reflected immediately.
    const [existingProjects, setExistingProjects] = useState<{ name: string; id: number }[]>([]);
    useEffect(() => {
        if (!user) { setExistingProjects([]); return; }
        let cancelled = false;
        fetch("/api/plots", { cache: "no-store" })
            .then(r => (r.ok ? r.json() : { plots: [] }))
            .then((data) => {
                if (cancelled) return;
                const seen = new Map<string, number>();
                (Array.isArray(data.plots) ? data.plots : []).forEach((p: { name?: string; dbProjectId?: number }) => {
                    const nm = String(p.name || "").trim().toLowerCase();
                    if (nm && p.dbProjectId != null && !seen.has(nm)) seen.set(nm, p.dbProjectId);
                });
                setExistingProjects(Array.from(seen, ([name, id]) => ({ name, id })));
            })
            .catch(() => { if (!cancelled) setExistingProjects([]); });
        return () => { cancelled = true; };
    }, [user, saveState]);

    // Seed dbProjectId from the project this panel was opened to edit (My
    // Plots "edit"/"add plot", or a freshly-claimed guest project landing via
    // /map-draw?project=...). Without this, save has no id to PATCH and falls
    // back to POST's upsert-by-name, which only updates in place if the name
    // is left untouched — renaming (or renaming after adding plots) creates a
    // brand-new duplicate row instead of updating this one.
    useEffect(() => {
        if (dbProjectId != null || !initialProjectName) return;
        const nm = initialProjectName.trim().toLowerCase();
        const match = existingProjects.find(p => p.name === nm);
        if (match) setDbProjectId(match.id);
    }, [existingProjects, initialProjectName, dbProjectId]);

    // A name is a duplicate only if it matches another project — not the one
    // currently being edited/saved (same dbProjectId), and not the name this
    // page was opened to edit.
    const isDuplicateProjectName = useMemo(() => {
        const nm = projectName.trim().toLowerCase();
        if (!nm) return false;
        if (initialProjectName && nm === initialProjectName.trim().toLowerCase()) return false;
        const match = existingProjects.find(p => p.name === nm);
        return !!match && match.id !== dbProjectId;
    }, [projectName, initialProjectName, existingProjects, dbProjectId]);

    // Project-name entry uses an explicit confirm step (no real-time checking):
    // the user types a draft, presses "ยืนยัน" (Confirm) — only then is the name
    // validated and committed to `projectName`. A committed name shows read-only
    // with an "แก้ไข" (Edit) button. `nameEditing` = the field is open for editing.
    const [nameDraft, setNameDraft] = useState(projectName);
    const [nameEditing, setNameEditing] = useState(!projectName.trim());
    const [nameError, setNameError] = useState<string | null>(null);
    // A name arriving from the parent (edit existing / restore after login) is
    // treated as already confirmed.
    useEffect(() => {
        if (projectName.trim()) {
            setNameDraft(projectName);
            setNameEditing(false);
        }
    }, [projectName]);
    const confirmName = () => {
        const nm = nameDraft.trim();
        if (!nm) { setNameError("กรุณากรอกชื่อโครงการ"); return; }
        const match = existingProjects.find(p => p.name === nm.toLowerCase());
        if (match && match.id !== dbProjectId) {
            setNameError("ชื่อนี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่น");
            return;
        }
        setNameError(null);
        onProjectNameChange?.(nm);
        setNameEditing(false);
    };

    // Stable IDs that link frontend_plots ↔ polygons_payload ↔ backend_responses.
    // Kept in a ref so handleSave can read them, and in state so render can read them.
    const stablePlotIdsRef = useRef<string[]>([]);
    const [plotIds, setPlotIds] = useState<string[]>([]);

    // When plotForms grows (new parcel added), propagate initial luChecked to map
    const prevPlotFormsLen = useRef(0);
    useEffect(() => {
        if (plotForms.length > prevPlotFormsLen.current && currentStep === 2) {
            const allChecked: Record<number, Record<string, boolean>> = {};
            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
            onLandUseChange?.(allChecked, expandedIdx);
        }
        prevPlotFormsLen.current = plotForms.length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plotForms.length]);

    // Sync map with currently expanded plot whenever step 2 is active or expandedIdx changes
    useEffect(() => {
        if (currentStep !== 2) return;
        if (expandedIdx !== null) {
            onMapPlotSelected?.(expandedIdx);
            const allChecked: Record<number, Record<string, boolean>> = {};
            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
            onLandUseChange?.(allChecked, expandedIdx);
        }
    }, [currentStep, expandedIdx, plotForms, onMapPlotSelected, onLandUseChange]);

    // When LU data arrives from backend, auto-check relevant LU classes per status
    useEffect(() => {
        setPlotForms(prev => {
            let changed = false;
            const next = prev.map((form, i) => {
                const realData = plotsLuRealData[i] || {};
                const newChecked = { ...form.luChecked };
                let needUpdate = false;

                // Auto-check A and any class containing A302 if not explicitly unchecked
                if (newChecked["A"] === undefined) { newChecked["A"] = true; needUpdate = true; }
                if (newChecked["A302"] === undefined) { newChecked["A302"] = true; needUpdate = true; }

                Object.keys(realData).forEach(k => {
                    if (k.includes("A302") && newChecked[k] === undefined) {
                        newChecked[k] = true;
                        needUpdate = true;
                    }
                });

                if (needUpdate) {
                    changed = true;
                    return { ...form, luChecked: newChecked };
                }
                return form;
            });
            return changed ? next : prev;
        });
    }, [plotsLuRealData]);
    // (removed auto-collapse: expanded content stays visible when selecting status)

    const [carbonResults, setCarbonResults] = useState<CarbonResult[]>([]);
    const [processingCarbon, setProcessingCarbon] = useState(false);
    const [carbonErr, setCarbonErr] = useState<string | null>(null);
    const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

    const hasEmptyStatus = useMemo(() => {
        if (plotForms.length === 0) return true;
        return plotForms.some(f => !f.plantStatus);
    }, [plotForms]);


    const sortedPlotIndices = useMemo(() => {
        // Highest plot number on top (descending by plot_index)
        return plots
            .map((_, idx) => idx)
            .sort((a, b) => {
                const na = parseInt((parcelFeatures[a]?.properties as any)?.plot_index) || (a + 1);
                const nb = parseInt((parcelFeatures[b]?.properties as any)?.plot_index) || (b + 1);
                return nb - na;
            });
    }, [plots, parcelFeatures]);
    // Initialize plotForms automatically when ready
    useEffect(() => {
        if (plots.length !== plotForms.length || parcelFeatures.some((feat, i) => {
            const pIdx = (feat.properties as any)?.plot_index !== undefined ? parseInt((feat.properties as any)?.plot_index) : i + 1;
            return pIdx !== plotForms[i]?.plotIndex;
        })) {
            setPlotForms(prev => {
                const next: PlotFormData[] = [];
                for (let i = 0; i < plots.length; i++) {
                    const feat = parcelFeatures[i];
                    const props = feat?.properties as any || {};
                    const pIndex = props.plot_index !== undefined ? parseInt(props.plot_index) : i + 1;

                    const existingForm = prev.find(f => f.plotIndex === pIndex);
                    if (existingForm) {
                        next.push(existingForm);
                        continue;
                    }

                    const savedLU = props.luChecked;
                    const initialLU = (savedLU && typeof savedLU === 'object' && !Array.isArray(savedLU) && Object.keys(savedLU).length > 0)
                        ? savedLU
                        : { A: true, A302: true };

                    const bdForm = props.backendData?.form || {};

                    // Restore plantStatus from saved data first, then infer from year as fallback
                    let initialStatus: "replanting" | "existing" | "" =
                        (bdForm.plantStatus === "replanting" || bdForm.plantStatus === "existing")
                            ? bdForm.plantStatus
                            : (props.plantStatus === "replanting" || props.plantStatus === "existing"
                                ? props.plantStatus
                                : "");

                    if (!initialStatus && props.plantYearBE) {
                        const yStr = String(props.plantYearBE);
                        if (NEW_YEAR_OPTIONS.includes(yStr)) {
                            initialStatus = "replanting";
                        } else if (OLD_YEAR_OPTIONS.includes(yStr)) {
                            initialStatus = "existing";
                        }
                    }

                    // Final fallback: any plot that has rubber age or plant year data is "existing"
                    if (!initialStatus) {
                        const rubberAge = Number(props.rubberAge || props.backendData?.age || 0);
                        const bePlantYear = Number(props.plantYearBE || props.backendData?.plantYearBE || 0);
                        if (rubberAge > 0 || bePlantYear > 0) {
                            initialStatus = "existing";
                        }
                    }

                    next.push({
                        plotIndex: pIndex,
                        plantStatus: initialStatus,
                        plantYear: bdForm.plantYear || "",
                        treeCount: bdForm.treeCount || "",
                        variety: bdForm.variety || "",
                        spacing: bdForm.spacing || "",
                        luChecked: { ...initialLU },
                    });
                }
                return next;
            });
        }
    }, [plots, plotForms.length, parcelFeatures]);

    const handleProcessCarbon = async () => {
        if (isDuplicateProjectName) {
            setCarbonErr("ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น");
            return;
        }
        if (hasEmptyStatus) {
            setCarbonErr("กรุณากรอกสถานะแปลงให้ครบทุกแปลงก่อนทำการประมวลผล");
            return;
        }

        setCarbonErr(null);
        setProcessingCarbon(true);
        const CURRENT_BE_NOW = new Date().getFullYear() + 543;

        // Compute a stable ID for each plot first — use props.id if present
        // (loaded from DB), otherwise generate a new one once.
        // This same ID is used in polygons_payload, backend_responses, and frontend_plots.
        const stablePlotIds = parcelFeatures.map((feat) => {
            const props = (feat?.properties || {}) as any;
            return (props.id as string) || generatePolygonId();
        });
        stablePlotIdsRef.current = stablePlotIds;
        setPlotIds(stablePlotIds);

        // Build polygons array for the assessCarbon backend API call, one polygon per plot!
        const polygons: CarbonAssessRequest[] = [];
        const featuresToUse = luFeatures.length > 0 ? luFeatures : parcelFeatures;

        const allFeatsByPlot: Record<number, typeof featuresToUse> = {};
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            allFeatsByPlot[idx] = [];
        }

        featuresToUse.forEach(feat => {
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            const plotIdxFromProp = props.plot_index !== undefined
                ? parseInt(String(props.plot_index), 10) - 1
                : -1;
            let matchedPlotIdx = 0;
            if (plotIdxFromProp >= 0 && plotIdxFromProp < parcelFeatures.length) {
                matchedPlotIdx = plotIdxFromProp;
            } else {
                const samplePoint = getSamplePoint(feat.geometry);
                for (let idx = 0; idx < parcelFeatures.length; idx++) {
                    if (isPointInGeometry(samplePoint, parcelFeatures[idx].geometry)) {
                        matchedPlotIdx = idx;
                        break;
                    }
                }
            }
            allFeatsByPlot[matchedPlotIdx].push(feat);
        });

        const featsByPlot: Record<number, typeof featuresToUse> = {};
        let hasAnyPolygons = false;

        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const form = plotForms[idx];
            const checkedClasses = new Set<string>();
            const formChecked = form?.luChecked || {};

            allFeatsByPlot[idx].forEach(feat => {
                const cls = ((feat.properties ?? {}) as Record<string, unknown>).lu_class as string | undefined;
                if (cls) {
                    let isOn = false;
                    if (cls === "A") isOn = formChecked[cls] ?? true;
                    else if (cls.startsWith("A")) isOn = formChecked[cls] ?? cls.includes("A302");
                    else isOn = formChecked[cls] ?? false;
                    if (isOn) checkedClasses.add(cls);
                }
            });

            const plotFeats = allFeatsByPlot[idx].filter(feat => {
                const luClass = ((feat.properties ?? {}) as Record<string, unknown>).lu_class as string | undefined;
                if (!luClass) return true; // include non-lu features as-is
                return checkedClasses.has(luClass);
            });
            featsByPlot[idx] = plotFeats;
            // Count as valid if we have LU features OR can fall back to the drawn parcel
            if (plotFeats.length > 0 || !!parcelFeatures[idx]) hasAnyPolygons = true;
        }

        if (!hasAnyPolygons) {
            setCarbonErr("กรุณาเลือกพื้นที่อย่างน้อย 1 ประเภทการใช้ที่ดินในอย่างน้อย 1 แปลง");
            setProcessingCarbon(false);
            return;
        }

        // Now, for each plot `idx`, build its combined geometry and CarbonAssessRequest!
        for (let idx = 0; idx < parcelFeatures.length; idx++) {
            const plotFeats = featsByPlot[idx] || [];
            const form = plotForms[idx] || { plantYear: "", variety: "", treeCount: "", spacing: "2.5*8" };

            let combinedGeom: GeoJSON.Geometry;
            if (plotFeats.length === 0) {
                // No matching LU features (e.g. replanting on forest/misc land) — use drawn parcel geometry
                if (!parcelFeatures[idx]?.geometry) continue;
                combinedGeom = parcelFeatures[idx].geometry;
            } else {
                const allRings: GeoJSON.Position[][][] = [];
                for (const feat of plotFeats) {
                    const geom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
                    if (geom.type === "Polygon") allRings.push(geom.coordinates);
                    else if (geom.type === "MultiPolygon") allRings.push(...geom.coordinates);
                }
                combinedGeom = allRings.length === 1
                    ? { type: "Polygon", coordinates: allRings[0] }
                    : { type: "MultiPolygon", coordinates: allRings };
            }


            const userYearBE = form.plantYear ? parseInt(form.plantYear) : 0;

            polygons.push({
                id: stablePlotIds[idx],
                geometry: combinedGeom,
                year_of_planting: userYearBE > 0 ? userYearBE - 543 : null, // null = let the backend pull it from the raster
                rubber_clone: (form.variety && SUPPORTED_CLONES.includes(form.variety)) ? form.variety : null,
                tree_count: form.treeCount ? (parseInt(form.treeCount) || null) : null,
                spacing_system: form.spacing || null,
                selected_lu_classes: (() => {
                    const luData = plotsLuRealData[idx] || {};
                    const hasRealData = Object.keys(luData).length > 0;
                    const formChecked = form?.luChecked || {};
                    const allClasses = new Set([...Object.keys(formChecked), ...Object.keys(luData)]);
                    const finalClasses: string[] = [];
                    allClasses.forEach(cls => {
                        let isOn = false;
                        if (cls === "A") isOn = formChecked[cls] ?? true;
                        else if (cls.startsWith("A")) isOn = formChecked[cls] ?? cls.includes("A302");
                        else isOn = formChecked[cls] ?? false;
                        if (isOn && (!hasRealData || (luData[cls]?.rai ?? 0) > 0)) {
                            finalClasses.push(cls);
                        }
                    });
                    return finalClasses;
                })(),
                project_type: form?.plantStatus || undefined,
            });
        }

        if (polygons.length === 0) {
            setCarbonErr("ไม่พบขอบเขตพื้นที่ที่สามารถประมวลผลได้");
            setProcessingCarbon(false);
            return;
        }

        // Catch this here with an accurate, plot-specific message — sending an
        // empty selected_lu_classes to the backend crashes it (max() on an
        // empty cohort list) and surfaces as a generic, misleading 500.
        const emptyLuPlots = polygons
            .map((p, i) => ({ p, plotNum: i + 1 }))
            .filter(({ p }) => !p.selected_lu_classes || p.selected_lu_classes.length === 0);
        if (emptyLuPlots.length > 0) {
            const plotList = emptyLuPlots.map(({ plotNum }) => plotNum).join(", ");
            setCarbonErr(`กรุณาเลือกประเภทการใช้ที่ดินอย่างน้อย 1 ประเภท (ที่แปลง ${plotList})`);
            setProcessingCarbon(false);
            return;
        }

        // Warn and proceed if "existing" plots have no planting year — backend may still process
        const existingMissingYear = polygons.some(p => p.project_type === "existing" && !p.year_of_planting);
        if (existingMissingYear) {
            console.warn("[Carbon] Some existing plots have no planting year — backend may fail");
        }

        try {
            const responses = await assessCarbon(polygons);

            // Check for errors in the responses (e.g., E04)
            const errResp = responses.find((r: any) => r.status?.status === "error");
            if (errResp) {
                throw new Error(`Backend API error: 200 ${JSON.stringify(errResp)}`);
            }

            setBackendResponses(responses);

            const results: CarbonResult[] = [];
            for (let idx = 0; idx < parcelFeatures.length; idx++) {
                const form = plotForms[idx] || { plantYear: "", variety: "", treeCount: "", spacing: "2.5*8", luChecked: {} };
                const plotFeats = featsByPlot[idx] || [];
                const totalAreaRai = plots[idx]?.areaRai || plotFeats.reduce((s, f) => s + (((f.properties ?? {}) as Record<string, unknown>).area_m2 as number || 0) / 1600, 0);

                // --- Calculate real land use breakdown for this plot ---
                const luData = plotsLuRealData[idx] || {};
                const activeLeafIds: string[] = [];
                const allFormKeys = Object.keys(form.luChecked || {});
                const allDataKeys = Object.keys(luData);
                const allKeys = new Set([...allDataKeys, ...allFormKeys]);

                allKeys.forEach(k => {
                    if (k === "A") return;
                    const isSubA = k.startsWith("A") && k !== "A";
                    const isTopLevel = !k.startsWith("A");

                    if (isSubA) {
                        const isChecked = k === "A302" || !!form.luChecked?.[k];
                        if (isChecked) activeLeafIds.push(k);
                    } else if (isTopLevel) {
                        const isChecked = !!form.luChecked?.[k];
                        if (isChecked) activeLeafIds.push(k);
                    }
                });

                const hasCheckedA = activeLeafIds.some(id => id.startsWith("A"));
                if (!hasCheckedA && luData["A"]) {
                    activeLeafIds.push("A");
                }

                const totalPlotSelectedRai = activeLeafIds.reduce((sum, cls) => sum + (luData[cls]?.rai || 0), 0);
                const totalPlotSelectedM2 = totalPlotSelectedRai * 1600;

                const classM2s: Record<string, number> = {};
                const classDescs: Record<string, string> = {};
                plotFeats.forEach(feat => {
                    const props = (feat.properties ?? {}) as Record<string, unknown>;
                    const luClass = props.lu_class as string || "M";
                    const luDesc = props.lu_class_desc_th as string | undefined;
                    classM2s[luClass] = (classM2s[luClass] || 0) + (props.area_m2 as number || 0);
                    if (luDesc && !classDescs[luClass]) classDescs[luClass] = luDesc;
                });

                const luBreakdown: Record<string, { rai: number; pct: number; desc: string }> = {};
                Object.entries(classM2s).forEach(([cls, m2]) => {
                    const rai = m2 / 1600;
                    const pct = totalPlotSelectedM2 > 0 ? (m2 / totalPlotSelectedM2) * 100 : 0;
                    const isRoot = ["A", "U", "F", "W", "M"].includes(cls);
                    const desc = isRoot ? LU_DESC_MAP[cls] : (classDescs[cls] || LU_DESC_MAP[cls] || "");
                    luBreakdown[cls] = {
                        rai: Math.round(rai * 100) / 100,
                        pct: Math.round(pct * 10) / 10,
                        desc: desc ? (desc.startsWith(cls) ? desc : `${cls} ${desc}`) : cls
                    };
                });

                const backendYearBE = plots[idx]?.plantYearBE || 0;
                const userYearBE = form.plantYear ? parseInt(form.plantYear) : 0;

                // Find corresponding response by matching stable polygon ID
                const resp = responses.find(r => r.polygon_id === stablePlotIds[idx]);
                const profile = resp?.carbon_profile ?? [];

                let finalPlantYearBE = 0;
                let yearUsedDetails = "";

                if (userYearBE > 0) {
                    // 1. User entered the year themselves — always used first
                    finalPlantYearBE = userYearBE;
                    yearUsedDetails = `ใช้ตามที่คุณระบุ (พ.ศ. ${userYearBE})`;
                } else if (resp?.assess_parameters) {
                    // 2. No year entered → use max cohort age (oldest cohort = lowest year) from the carbon API
                    const yop = resp.assess_parameters.year_of_planting;
                    const allYearsCE: number[] = [];
                    if (typeof yop.value === "number" && yop.value > 0) {
                        allYearsCE.push(yop.value);
                    } else if (Array.isArray(yop.value)) {
                        (yop.value as string[]).forEach(s => {
                            const m = String(s).match(/^(\d{4})/);
                            if (m) allYearsCE.push(parseInt(m[1]));
                        });
                    }
                    if (allYearsCE.length > 0) {
                        const oldestYearCE = Math.min(...allYearsCE); // oldest cohort = max age
                        finalPlantYearBE = oldestYearCE + 543;
                        yearUsedDetails = `ใช้ปีจากระบบประมาณการ (พ.ศ. ${finalPlantYearBE})`;
                    }
                }

                // 3. Fallback: year from the parcel API, if assess_parameters is absent
                if (finalPlantYearBE === 0 && backendYearBE > 0) {
                    finalPlantYearBE = backendYearBE;
                    yearUsedDetails = `ใช้ปีจากดาวเทียมที่ตรวจพบ (พ.ศ. ${backendYearBE})`;
                }

                let startAge = finalPlantYearBE > 0 ? CURRENT_BE_NOW - finalPlantYearBE : 0;

                // Profile is a fixed age-0..35 window keyed to calendar year; the
                // "now" row is wherever year_at === 0, not necessarily index 0.
                const nowEntry = profile.find(p => p.year_at === 0) ?? profile[0];

                // 4. Fallback: age directly from the profile, if it's still 0
                if (startAge === 0 && nowEntry) {
                    const profileAge = nowEntry.age;
                    if (profileAge != null && !isNaN(profileAge)) {
                        startAge = profileAge;
                        if (finalPlantYearBE === 0) {
                            finalPlantYearBE = CURRENT_BE_NOW - startAge;
                            yearUsedDetails = `ใช้ปีจากข้อมูลหลังบ้าน (พ.ศ. ${finalPlantYearBE})`;
                        }
                    }
                }

                if (startAge === 0 && finalPlantYearBE === 0) {
                    startAge = 1;
                }
                const userTrees = form.treeCount ? parseInt(form.treeCount) : 0;
                const epTrees = typeof resp?.assess_parameters?.tree_count?.value === "number" ? resp.assess_parameters.tree_count.value : 0;
                const finalTrees = userTrees > 0 ? userTrees : (epTrees > 0 ? epTrees : Math.round(totalAreaRai * 76));
                const co2Now = nowEntry?.stocks?.value ?? 0;
                const co2NowCi = nowEntry?.stocks?.ci ?? 0;

                const hasValidM2s = Object.values(classM2s).some(m2 => m2 > 0);
                const finalBreakdown = hasValidM2s ? luBreakdown : (((parcelFeatures[idx]?.properties as any)?.luBreakdown) || {});

                results.push({
                    plotIdx: idx,
                    age: startAge,
                    plantYearBE: finalPlantYearBE,
                    trees: finalTrees,
                    spacing: form.spacing,
                    variety: form.variety,
                    co2Now,
                    co2NowCi,
                    source: "backend" as const,
                    yearUsedDetails,
                    selectedAreaRai: totalPlotSelectedRai,
                    luBreakdown: finalBreakdown
                });
            }

            setCarbonResults(results);
            setExpandedResultIdx("total");
            if (onMapPlotSelected) onMapPlotSelected("total");

            const allChecked: Record<number, Record<string, boolean>> = {};
            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
            onLandUseChange?.(allChecked, null);

            onStepChange(3);

            // Auto-save as a draft (guest_key) — for BOTH logged-in users and guests.
            // Persists to DB but does NOT appear in My Plots until the user clicks
            // "บันทึกข้อมูล", which claims the draft into their account.
            handleSave(results, responses, polygons, { forceGuest: true }).catch(console.error);
        } catch (err) {
            setCarbonErr(getFriendlyErrorMessage(err, plots, plotForms, stablePlotIds));
        } finally {
            setProcessingCarbon(false);
        }
    };

    const lastProcessedTriggerRef = useRef(0);
    useEffect(() => {
        if (autoProcessTrigger && autoProcessTrigger > lastProcessedTriggerRef.current) {
            if (plots.length === plotForms.length && !parcelFeatures.some((feat, i) => parseInt((feat.properties as any)?.plot_index) !== plotForms[i]?.plotIndex)) {
                lastProcessedTriggerRef.current = autoProcessTrigger;
                void handleProcessCarbon();
            }
        }
    }, [autoProcessTrigger, plots, plotForms]);


    // Removed: if (!(searchRunning || searchErr || searchCount !== null)) return null;

    const handleSave = async (overrideResults?: CarbonResult[], overrideResponses?: any[], overridePolygons?: CarbonAssessRequest[], opts?: { forceGuest?: boolean }) => {
        if (user && isDuplicateProjectName) {
            setCarbonErr("ชื่อโครงการนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น");
            return;
        }

        // draft = auto-save from "ประมวลผล" (Process) — saved to DB as guest_key but not yet claimed
        const isDraft = opts?.forceGuest === true;

        if (!isDraft) {
            setSaveState("saving");
            await new Promise(r => setTimeout(r, 900));
        }

        try {
            const activeResponses = overrideResponses || backendResponses || [];
            const activePolygons = overridePolygons || [];

            // Pull stable IDs from the ref (set during process), or build them from
            // props.id if saving without having gone through process first
            const stablePlotIds = stablePlotIdsRef.current.length === parcelFeatures.length
                ? stablePlotIdsRef.current
                : parcelFeatures.map((feat) => {
                    const props = (feat?.properties || {}) as any;
                    return (props.id as string) || generatePolygonId();
                });

            // Build plantation_info: use rawPlantationInfo as returned by the API if present
            const plantationInfo = rawPlantationInfo && rawPlantationInfo.length > 0
                ? rawPlantationInfo
                : parcelFeatures.map((feat, i) => {
                    const props = (feat?.properties || {}) as any;
                    const plotGeom = feat?.geometry || null;
                    const plotLuFeats = (luFeatures || []).filter(lf => {
                        const lfProps = (lf.properties ?? {}) as any;
                        const lfPlotIdx = lfProps.plot_index !== undefined ? parseInt(String(lfProps.plot_index)) - 1 : -1;
                        return lfPlotIdx === i;
                    });

                    return {
                        polygon_id: stablePlotIds[i],
                        province_code: plots[i]?.province || props.province || "",
                        geometry: plotGeom,
                        area_m2: (plots[i]?.areaRai || 0) * 1600,
                        status: {
                            status: "success",
                            status_code: "S02",
                            message: "LAND USE CLASSIFICATION AND AREA CALCULATION COMPLETED."
                        },
                        lu_polygon: plotLuFeats.map(lf => ({
                            lu_class: (lf.properties as any)?.lu_class || null,
                            lu_class_desc_th: (lf.properties as any)?.lu_class_desc_th || null,
                            geometry: lf.geometry,
                            area_m2: (lf.properties as any)?.area_m2 || 0,
                            area_percent: (lf.properties as any)?.area_percent || 0,
                        })),
                    };
                });

            // Build polygons_payload: the data sent to the backend for assessCarbon
            const polygonsPayload = activePolygons.length > 0
                ? activePolygons
                : parcelFeatures.map((feat, i) => {
                    const form = plotForms[i] || {};
                    const userYearBE = form.plantYear ? parseInt(form.plantYear) : 0;
                    return {
                        id: stablePlotIds[i],
                        geometry: feat?.geometry || null,
                        year_of_planting: userYearBE > 0 ? userYearBE - 543 : null,
                        rubber_clone: (form.variety && SUPPORTED_CLONES.includes(form.variety)) ? form.variety : null,
                        tree_count: form.treeCount ? (parseInt(form.treeCount) || null) : null,
                        spacing_system: form.spacing || null,
                        selected_lu_classes: (() => {
                            const plotLuFeats = (luFeatures || []).filter(lf => {
                                const lfProps = (lf.properties ?? {}) as any;
                                const lfPlotIdx = lfProps.plot_index !== undefined ? parseInt(String(lfProps.plot_index)) - 1 : -1;
                                return lfPlotIdx === i;
                            });
                            const detectedClasses = new Set<string>();
                            plotLuFeats.forEach(lf => {
                                const cls = (lf.properties as any)?.lu_class;
                                if (cls) detectedClasses.add(cls);
                            });
                            const formChecked = form?.luChecked || {};
                            const allKeys = new Set([...Object.keys(formChecked), ...Array.from(detectedClasses)]);
                            return Array.from(allKeys).filter(k => {
                                if (k === "A") return formChecked[k] ?? true;
                                if (k.startsWith("A")) return formChecked[k] ?? k.includes("A302");
                                return formChecked[k] ?? false;
                            });
                        })(),
                        project_type: form?.plantStatus || "existing",
                    };
                });

            // Determine user_id and project_id
            let userId: string | undefined;
            let projectId: string | undefined;

            if (user) {
                projectId = projectName || "Unnamed Project";
                // Process/save for a logged-in user works against a guest_key row first,
                // until they click "บันทึกข้อมูล" (Save) and it gets claimed — reuse the
                // existing guest_key if a draft already exists
                userId = guestUserId ?? undefined;
            } else if (guestUserId) {
                // Guest re-save: send the userId from the first POST so PATCH can identify the row
                userId = guestUserId;
            }

            let res;

            const CURRENT_BE_NOW = new Date().getFullYear() + 543;
            const frontendPlots = parcelFeatures.map((feat, i) => {
                const props = (feat?.properties || {}) as any;
                const form = plotForms[i] || {};
                const ep = activeResponses.find((r: any) => r.polygon_id === stablePlotIds[i] || r.polygon_id === `plot-${i}`)?.assess_parameters;
                const backendResp = activeResponses.find((r: any) => r.polygon_id === stablePlotIds[i] || r.polygon_id === `plot-${i}`);

                const p = computePlot(feat);
                const cr = overrideResults ? overrideResults[i] : carbonResults[i];

                const hasNewResult = cr && cr.co2Now !== undefined;
                // Preserve previously saved carbon data when plot wasn't re-processed this session
                const co2 = hasNewResult ? cr.co2Now : (props.carbonTotal || 0);

                const epPlantYearBE = ep?.year_of_planting ? ep.year_of_planting + 543 : 0;
                const epVariety = ep?.rubber_clone || "";
                const epTrees = ep?.tree_count || 0;
                const epSpacing = ep?.spacing_system || "";

                let finalPlantYear = epPlantYearBE;
                if (form?.plantYear && parseInt(form.plantYear) > 0) {
                    finalPlantYear = parseInt(form.plantYear);
                } else if (!finalPlantYear && p.plantYearBE > 0) {
                    finalPlantYear = p.plantYearBE;
                }
                const age = finalPlantYear > 0 ? (CURRENT_BE_NOW - finalPlantYear) : (props.rubberAge || 0);

                const trees = cr?.trees || form?.treeCount || props.trees || epTrees;
                const variety = cr?.variety || form?.variety || props.variety || epVariety;
                const spacing = cr?.spacing || form?.spacing || props.spacing || epSpacing;

                const rawProfile = backendResp?.carbon_profile ?? [];
                let carbonProfile: any[] = [];
                if (hasNewResult && rawProfile.length > 0) {
                    carbonProfile = profileToBarPoints(rawProfile, age);
                } else if (!hasNewResult && Array.isArray(props.carbonProfile)) {
                    carbonProfile = props.carbonProfile;
                }


                const plotLuFeats = (luFeatures || []).filter(lf => {
                    const lfProps = (lf.properties ?? {}) as any;
                    const lfPlotIdx = lfProps.plot_index !== undefined ? parseInt(String(lfProps.plot_index)) - 1 : -1;
                    return lfPlotIdx === i;
                });

                // Preserve saved lu_polygon when no new LU features came from this session
                const savedLuPolygon = props.backendData?.lu_polygon;
                const luPolygonToSave = plotLuFeats.length > 0
                    ? plotLuFeats.map((lf: GeoJSON.Feature) => ({
                        type: "Feature",
                        properties: lf.properties,
                        geometry: lf.geometry
                    }))
                    : (Array.isArray(savedLuPolygon) ? savedLuPolygon : []);

                return {
                    id: stablePlotIds[i],
                    name: projectName || props.farm_name || "แปลงยางใหม่",
                    areaRai: p.areaRai,
                    selectedAreaRai: hasNewResult ? cr.selectedAreaRai : (props.selectedAreaRai || p.areaRai),
                    carbonTotal: co2,
                    rubberAge: age,
                    plantYearBE: finalPlantYear || props.plantYearBE || 0,
                    trees,
                    variety,
                    spacing,
                    luChecked: (form?.luChecked && Object.keys(form.luChecked).length > 0)
                        ? form.luChecked
                        : ((props.luChecked && Object.keys(props.luChecked).length > 0) ? props.luChecked : { A: true, A302: true }),
                    plantStatus: form?.plantStatus || props.plantStatus || "",
                    confidence: p.confidence,
                    ownerName: ownerName || props.owner_name || props.ownerName || "",
                    province: province || plots[i]?.province || props.province || "",
                    date: new Date().toISOString(),
                    geojson: feat?.geometry || null,
                    boundaryGeojson: null,
                    carbonProfile,
                    processed: hasNewResult ? true : (props.processed || false),
                    backendData: {
                        lu_polygon: luPolygonToSave,
                        plantYearBE: epPlantYearBE || props.backendData?.plantYearBE || 0,
                        age: epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : (props.backendData?.age || 0),
                        variety: epVariety || props.backendData?.variety || "",
                        spacing: epSpacing || props.backendData?.spacing || "",
                        trees: epTrees || props.backendData?.trees || 0,
                        ep: ep || props.backendData?.ep || null,
                        form: form || props.backendData?.form || null
                    }
                };
            });

            // When editing a single plot, preserve all other plots from the project
            // When adding a new plot, append it to the existing project plots
            let finalFrontendPlots = frontendPlots;
            if (existingProjectPlots && existingProjectPlots.length > 0 && editingPlotId) {
                const updatedPlot = frontendPlots[0];
                finalFrontendPlots = existingProjectPlots.map((p: any) =>
                    String(p.id) === String(editingPlotId) ? updatedPlot : p
                );
            } else if (existingProjectPlots && existingProjectPlots.length > 0 && !editingPlotId) {
                finalFrontendPlots = [...existingProjectPlots, ...frontendPlots];
            }

            const saveBody: Record<string, unknown> = {
                plantationInfo,
                polygonsPayload,
                backendResponses: activeResponses,
                frontendPlots: finalFrontendPlots,
            };
            if (userId) saveBody.userId = userId;
            // Draft (Process): force-save as guest_key even while logged in → doesn't show up in My Plots
            if (isDraft) saveBody.forceGuest = true;

            // Only send projectId if it's a real name, so the backend can auto-generate for guests
            if (projectId && projectId !== "Unnamed Project") {
                saveBody.projectId = projectId;
            }

            if (dbProjectId) {
                res = await fetch(`/api/plots/${dbProjectId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(saveBody),
                });
            } else {
                res = await fetch("/api/plots", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(saveBody),
                });
            }

            if (res.ok) {
                const data = await res.json();
                if (data.project?.id) {
                    setDbProjectId(data.project.id);
                }
                // Store the guest_key the server returned, for use in the next PATCH / claim
                if (data.project?.userId && data.project.userId !== guestUserId) {
                    if (!user) {
                        // Guest: save to localStorage so it can be seen in My Plots
                        setGuestUserId(data.project.userId);
                        if (typeof window !== "undefined") {
                            localStorage.setItem("guest_user_id", data.project.userId);
                        }
                    } else if (isDraft) {
                        // Logged in + draft (Process): keep in state only, don't write to localStorage
                        setGuestUserId(data.project.userId);
                    }
                }

                if (data.project?.id) {
                    onProjectSaved?.({
                        projectId: data.project.id,
                        guestKey: data.project.userId ?? guestUserId ?? null,
                    });
                }

                // A logged-in user clicking "บันทึกข้อมูล" (Save) → claim the draft (guest_key) into their account
                // → server clones the guest row into a new project owned by
                // the user and soft-deletes the guest one, so dbProjectId
                // must follow the clone or the next save 404s (PATCHing a
                // now-deleted row).
                if (!isDraft && user && guestUserId) {
                    try {
                        const claimRes = await fetch("/api/plots/claim", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ guestKey: guestUserId }),
                        });
                        if (claimRes.ok) {
                            const claimData = await claimRes.json();
                            const claimedProjects: { id: number; projectName: string }[] = claimData.projects ?? [];
                            const clonedProject = claimedProjects.find(p => p.projectName === projectId) ?? claimedProjects[0];
                            if (clonedProject?.id) setDbProjectId(clonedProject.id);
                        }
                        setGuestUserId(null);
                    } catch (e) {
                        console.error("claim error:", e);
                    }
                }
            }
        } catch (e) { console.error("handleSave error:", e); }
        // Draft (Process) doesn't touch button state/plotsSaved — the button still reads "บันทึกข้อมูล" (Save Data)
        if (!isDraft) {
            setSaveState("done");
            onSave?.();
            setTimeout(() => setSaveState("idle"), 2000);
        }
    };


    // ── Loading ────────────────────────────────────────────────────────────
    if (searchRunning) {
        return (
            <div className="prp-shell">
                <div className="s1-results-loading">
                    <div className="s1-spin" />
                    <span>กำลังค้นหาแปลงที่ทับซ้อน...</span>
                </div>
                {onCancel && (
                    <button onClick={onCancel} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 8, border: "1px solid #dc3545", background: "transparent", color: "#dc3545", fontSize: 13, cursor: "pointer", fontWeight: 500, margin: "16px auto 0" }}>
                        <i className="bi bi-x-circle" /> ยกเลิกการประมวลผล
                    </button>
                )}
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────────────
    if (searchErr) {
        return (
            <div className="prp-shell">
                <div className="s1-results-error">
                    <i className="bi bi-exclamation-triangle me-2" />{searchErr}
                </div>
                {onReset && (
                    <button className="mds-btn mds-btn-soft" style={{ marginTop: 12 }} onClick={onReset}>
                        <i className="bi bi-arrow-left me-1" /> กลับขั้นตอนที่ 1
                    </button>
                )}
            </div>
        );
    }

    // Removed: if (searchCount === null) return null;

    // ── Step 2: Data entry form ────────────────────────────────
    if (currentStep === 2) {
        const updateForm = (idx: number, field: keyof PlotFormData, val: string) => {
            setPlotForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
            setSaveState("idle");
        };
        return (
            <div className="prp-shell" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>


                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
                    <div className="prp-header-block" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}>
                        <div className="prp-main-title" style={{ fontSize: isMobile ? 16 : 18, marginBottom: 0, color: "#1a3d2b", fontWeight: 700, letterSpacing: "-0.2px" }}>
                            {projectName?.trim() ? `โครงการ ${projectName}` : "กรอกข้อมูลแปลง"}
                        </div>
                    </div>
                    <button
                        onClick={() => onBack?.()}
                        title="เริ่มวาดแปลงในพื้นที่ใหม่ (ขั้นตอนที่ 1)"
                        style={{ flexShrink: 0, padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4, color: "#1e7a47", border: "1px solid #cfe6d9", background: "#ffffff", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.18s", lineHeight: 1.5 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#edfaf3"; e.currentTarget.style.borderColor = "#1e7a47"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#cfe6d9"; }}
                    >
                        <i className="bi bi-chevron-left" style={{ fontSize: 11 }} />
                        <span>เริ่มวาดแปลงในพื้นที่ใหม่</span>
                    </button>
                </div>

                {/* Project name field — the only place a project is named (step 1 no
                    longer collects it). Given full-width with a plain-language label,
                    an example, and guidance because many users are not tech-savvy. */}
                {user && onProjectNameChange && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                            ตั้งชื่อโครงการของคุณ <span style={{ color: "#dc2626" }}>*</span>
                        </label>

                        {nameEditing ? (
                            <>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        type="text"
                                        value={nameDraft}
                                        onChange={(e) => { setNameDraft(e.target.value); if (nameError) setNameError(null); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmName(); } }}
                                        placeholder="เช่น สวนยางลุงสมชาย"
                                        maxLength={100}
                                        className="prp-input"
                                        style={{
                                            flex: 1, minWidth: 0, padding: isMobile ? "12px 14px" : "13px 16px",
                                            fontSize: 16, fontWeight: 600, color: "#1a3d2b",
                                            borderRadius: 12,
                                            border: `2px solid ${nameError ? "#dc2626" : "#cbd5e1"}`,
                                            background: "#fff", outline: "none",
                                            // Cancel the global .prp-input:focus/:hover translateY lift so the
                                            // field doesn't jump up when focused.
                                            transform: "none",
                                        }}
                                    />
                                    <button
                                        onClick={confirmName}
                                        style={{
                                            flexShrink: 0, padding: isMobile ? "0 16px" : "0 20px", borderRadius: 12,
                                            border: "none", background: "#1e7a47", color: "#fff",
                                            fontSize: 15, fontWeight: 700, cursor: "pointer",
                                            display: "inline-flex", alignItems: "center", gap: 6,
                                        }}
                                    >
                                        <i className="bi bi-check-lg" /> ยืนยัน
                                    </button>
                                </div>
                                {nameError && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 13, fontWeight: 600, color: "#dc2626" }}>
                                        <i className="bi bi-exclamation-circle-fill" />
                                        {nameError}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                                padding: isMobile ? "11px 12px 11px 14px" : "12px 14px 12px 16px",
                                borderRadius: 12, border: "1px solid #cfe6d9", background: "#f3faf6",
                            }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <i className="bi bi-check-circle-fill" style={{ color: "#1e7a47", flexShrink: 0 }} />
                                    <span style={{ fontSize: 16, fontWeight: 700, color: "#1a3d2b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {projectName}
                                    </span>
                                </span>
                                <button
                                    onClick={() => { setNameDraft(projectName); setNameError(null); setNameEditing(true); }}
                                    style={{
                                        flexShrink: 0, padding: "6px 12px", borderRadius: 8,
                                        border: "1px solid #cfe6d9", background: "#fff", color: "#1e7a47",
                                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                    }}
                                >
                                    <i className="bi bi-pencil" /> แก้ไข
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Process/validation error → one-time popup modal (portal to <body> so it
                    centers on the viewport, unaffected by the panel's transforms/overflow) */}
                {carbonErr && typeof document !== "undefined" && createPortal(
                    <div
                        onClick={() => setCarbonErr(null)}
                        style={{
                            position: "fixed", inset: 0, zIndex: 4000,
                            background: "rgba(15,23,42,0.45)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: 20,
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: "100%", maxWidth: 360,
                                background: "#fff", borderRadius: 18,
                                padding: "26px 24px 22px", textAlign: "center",
                                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                                animation: "slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                            }}
                        >
                            <div style={{
                                width: 56, height: 56, borderRadius: "50%",
                                background: "rgba(220,38,38,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 16px",
                            }}>
                                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 26, color: "#dc2626" }} />
                            </div>
                            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>ไม่สามารถดำเนินการได้</h3>
                            <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{carbonErr}</p>
                            <button
                                onClick={() => setCarbonErr(null)}
                                style={{
                                    width: "100%", padding: "11px", borderRadius: 12,
                                    border: "none", background: "#dc2626", color: "#fff",
                                    fontSize: 15, fontWeight: 700, cursor: "pointer",
                                }}
                            >
                                ตกลง
                            </button>
                        </div>
                    </div>,
                    document.body
                )}
                {/* Name validation is shown inline under the project-name field
                    above. This block only nudges about the per-plot status. */}
                {hasEmptyStatus && (
                    <div style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        background: "rgba(249,115,22,0.06)",
                        border: "1px solid rgba(249,115,22,0.2)",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "#c2410c",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 600
                    }}>
                        <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
                        <span>กรุณาเลือก &ldquo;สถานะแปลง&rdquo; ให้ครบทุกแปลง เพื่อประมวลผลหรือบันทึกข้อมูล</span>
                    </div>
                )}
                {isDrawing ? (
                    <div style={{ marginBottom: 16, width: "100%", padding: "16px", background: "rgba(220,38,38,0.04)", border: "1px dashed rgba(220,38,38,0.3)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(220,38,38,0.1)", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                                <i className="bi bi-vector-pen" />
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>กำลังวาดแปลง...</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, width: "100%" }}>
                            <button onClick={() => onFinishDraw?.()} disabled={drawVertCount < 3} style={{ flex: 1, padding: "11px", background: drawVertCount < 3 ? "#f1f5f9" : "#1e7a47", color: drawVertCount < 3 ? "#94a3b8" : "#fff", border: drawVertCount < 3 ? "1px solid #e2e8f0" : "1px solid transparent", borderRadius: 10, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: drawVertCount < 3 ? "not-allowed" : "pointer", boxShadow: drawVertCount < 3 ? "none" : "0 4px 12px rgba(30,122,71,0.25)", transition: "all 0.2s" }}>
                                <i className="bi bi-check-circle-fill" /> เสร็จสิ้น
                            </button>
                            <button onClick={onCancelDraw} style={{ flex: 1, padding: "11px", background: "#ef4444", color: "#fff", border: "1px solid transparent", borderRadius: 10, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", boxShadow: "0 4px 12px rgba(239,68,68,0.25)", transition: "all 0.2s" }}>
                                <i className="bi bi-x-circle-fill" /> ยกเลิกการวาด
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: isMobile ? 6 : 8, marginBottom: 16, flexWrap: "wrap", alignItems: "stretch" }}>
                        {onDrawMore && !isDrawing && (
                            <button className="prp-btn-ghost" disabled={drawMoreDisabled} style={{ flex: !user ? "1 1 calc(50% - 4px)" : (isMobile ? "1 1 100%" : "1 1 calc(33% - 8px)"), minWidth: 100, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, background: drawMoreDisabled ? "#cbd5e1" : "#1e7a47", color: "#fff", border: "1px solid transparent", borderRadius: isMobile ? 10 : 12, cursor: drawMoreDisabled ? "not-allowed" : "pointer", boxShadow: drawMoreDisabled ? "none" : "0 4px 10px rgba(30,122,71,0.25)", opacity: drawMoreDisabled ? 0.6 : 1 }} onClick={drawMoreDisabled ? undefined : () => { setExpandedIdx(null); onDrawMore?.(); }}>
                                <i className="bi bi-pencil-square" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>วาดแปลงเพิ่ม</span>
                            </button>
                        )}
                        {onCancelDraw && isDrawing && (
                            <button className="prp-btn-ghost" style={{ flex: isMobile ? "1 1 100%" : "1 1 calc(33% - 8px)", minWidth: 100, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, background: "#ef4444", color: "#fff", border: "1px solid transparent", borderRadius: isMobile ? 10 : 12, boxShadow: "0 4px 10px rgba(239,68,68,0.25)" }} onClick={onCancelDraw}>
                                <i className="bi bi-x-circle" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ยกเลิกการวาด</span>
                            </button>
                        )}
                        {user && (
                            <button
                                className="prp-btn-primary"
                                onClick={() => handleSave()}
                                disabled={!projectName.trim() || nameEditing || isDuplicateProjectName || saveState === "saving"}
                                style={{
                                    flex: isMobile ? "1 1 calc(50% - 4px)" : "1 1 calc(33% - 8px)", minWidth: 110, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
                                    background: saveState === "done" ? "#94a3b8" : ((projectName.trim() && !nameEditing && !isDuplicateProjectName && !hasEmptyStatus) ? "#0284c7" : "#cbd5e1"),
                                    color: "#fff", border: "1px solid transparent", borderRadius: isMobile ? 10 : 12,
                                    cursor: saveState !== "idle" ? "not-allowed" : ((projectName.trim() && !nameEditing && !isDuplicateProjectName && !hasEmptyStatus) ? "pointer" : "not-allowed"),
                                    boxShadow: saveState === "done" ? "none" : ((projectName.trim() && !nameEditing && !isDuplicateProjectName && !hasEmptyStatus) ? "0 4px 10px rgba(2,132,199,0.2)" : "none"),
                                    opacity: saveState === "done" ? 0.6 : 1,
                                    transition: "all 0.3s"
                                }}
                            >
                                {saveState === "saving" ? (
                                    <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึก...</span></>
                                ) : saveState === "done" ? (
                                    <><i className="bi bi-check-circle-fill" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึกแล้ว</span></>
                                ) : (
                                    <><i className="bi bi-save" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>บันทึกข้อมูล</span></>
                                )}
                            </button>
                        )}
                        <button
                            className="prp-btn-primary"
                            onClick={() => {
                                if (onBeforeProcess && onBeforeProcess()) {
                                    return;
                                }
                                void handleProcessCarbon();
                            }}
                            disabled={(!!user && (!projectName.trim() || nameEditing || isDuplicateProjectName)) || hasEmptyStatus || processingCarbon}
                            style={{
                                flex: (!user || isMobile) ? "1 1 calc(50% - 4px)" : "1 1 calc(33% - 8px)", minWidth: 110, padding: isMobile ? "8px 6px" : "10px 12px", fontSize: isMobile ? 12 : 14, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
                                background: ((!user || (projectName.trim() && !nameEditing && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "#1e7a47" : "#cbd5e1",
                                color: "#fff", border: "1px solid transparent", borderRadius: isMobile ? 10 : 12,
                                cursor: ((!user || (projectName.trim() && !nameEditing && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "pointer" : "not-allowed",
                                boxShadow: ((!user || (projectName.trim() && !nameEditing && !isDuplicateProjectName)) && !hasEmptyStatus && !processingCarbon) ? "0 4px 10px rgba(30, 122, 71,0.2)" : "none"
                            }}
                        >
                            {processingCarbon ? (
                                <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ประมวลผล</span></>
                            ) : (
                                <><i className="bi bi-graph-up-arrow" style={{ fontSize: isMobile ? 14 : 16 }} /> <span style={{ fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>ประมวลผล</span></>
                            )}
                        </button>
                    </div>
                )}





                {/* Summary of drawn parcels */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>
                        แปลงที่วาดแล้ว
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1e7a47" }}>
                        {totalArea.toFixed(2)} ไร่
                    </div>
                </div>

                {/* Per-plot fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {sortedPlotIndices.map((i) => {
                        const p = plots[i];
                        const form = plotForms[i] || { plantYear: "", treeCount: "", variety: "", spacing: "2.5*8" };
                        const plotDisplayNum = parseInt((parcelFeatures[i]?.properties as any)?.plot_index) || (i + 1);
                        return (
                            <div key={i} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${expandedIdx === i ? "#bfe0cd" : "#e6f0ea"}`, overflow: "hidden", boxShadow: expandedIdx === i ? "0 8px 24px rgba(30,122,71,0.10)" : "0 1px 2px rgba(16,40,28,0.04)", transition: "box-shadow 0.25s, border-color 0.25s" }}>
                                {/* Plot header */}
                                <div
                                    onClick={() => {
                                        setExpandedIdx(expandedIdx === i ? null : i);
                                        if (parcelFeatures[i]) {
                                            onFlyTo(parcelFeatures[i]);
                                            onMapPlotSelected?.(i);
                                            const allChecked: Record<number, Record<string, boolean>> = {};
                                            plotForms.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
                                            onLandUseChange?.(allChecked, i);
                                        }
                                    }}
                                    style={{
                                        background: "#ffffff",
                                        padding: "12px 14px",
                                        borderBottom: expandedIdx === i ? "1px solid #e6f0ea" : "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        cursor: "pointer",
                                        userSelect: "none"
                                    }}
                                >
                                    <div style={{ pointerEvents: 'none', width: 34, height: 34, borderRadius: 10, background: expandedIdx === i ? "#1e7a47" : "#edfaf3", border: expandedIdx === i ? "1px solid #1e7a47" : "1px solid #d7ede1", color: expandedIdx === i ? "#ffffff" : "#1e7a47", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, transition: "all 0.2s", boxShadow: expandedIdx === i ? "0 3px 8px rgba(30,122,71,0.28)" : "none" }}>{plotDisplayNum}</div>
                                    <div style={{ pointerEvents: 'none', flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ fontWeight: 800, fontSize: 15, color: "#1a3d2b", letterSpacing: "-0.2px" }}>แปลงที่ {plotDisplayNum}</div>
                                        </div>
                                        {p.areaRai > 0 && (
                                            <div style={{ fontSize: 12.5, color: "#5a7a65", fontWeight: 600, marginTop: 1 }}>{p.areaRai.toFixed(2)} ไร่</div>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmIdx(i); }}
                                            title="ลบแปลง"
                                            style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 15, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s" }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#dc2626"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
                                        >
                                            <i className="bi bi-trash3" />
                                        </button>
                                        <span style={{ pointerEvents: 'none', width: 28, height: 28, borderRadius: 8, background: "#f1f6f3", color: "#1e7a47", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                                            <i className={`bi bi-chevron-${expandedIdx === i ? 'up' : 'down'}`} />
                                        </span>
                                    </div>
                                </div>
                                <Accordion open={expandedIdx === i}>
                                    {/* Status Selection */}
                                    <div style={{ padding: isMobile ? "16px 16px 0" : "20px 24px 0", background: "#fff" }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3d2b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                            <i className="bi bi-info-circle" style={{ color: "#1e7a47" }} /> สถานะแปลง <span style={{ color: "#ef4444" }}>*</span>
                                        </div>
                                        <div style={{ display: "flex", gap: 24 }}>
                                            <div onClick={() => {
                                                setPlotForms(prev => prev.map((f, idx) => {
                                                    if (idx !== i) return f;
                                                    const realData = plotsLuRealData[i] || {};
                                                    const newChecked: Record<string, boolean> = { ...f.luChecked, A: true, A302: true };
                                                    Object.keys(realData).forEach(k => {
                                                        if (k.includes("A302")) newChecked[k] = true;
                                                    });
                                                    return {
                                                        ...f,
                                                        plantStatus: "replanting",
                                                        plantYear: String(CURRENT_BE),
                                                        luChecked: newChecked,
                                                    };
                                                }));
                                                onProjectTypeChange?.("replanting");
                                            }} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer", userSelect: "none", color: form.plantStatus === "replanting" ? "#1a3d2b" : "#5a7a65", fontWeight: form.plantStatus === "replanting" ? 700 : 500 }}>
                                                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid", borderColor: form.plantStatus === "replanting" ? "#1e7a47" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                                                    {form.plantStatus === "replanting" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1e7a47" }} />}
                                                </div>
                                                เริ่มปลูกใหม่
                                            </div>
                                            <div onClick={() => {
                                                // Auto-check A sub-types and F detected by backend for existing plots
                                                setPlotForms(prev => prev.map((f, idx) => {
                                                    if (idx !== i) return f;
                                                    const realData = plotsLuRealData[i] || {};
                                                    const newChecked: Record<string, boolean> = { ...f.luChecked, A: true, A302: true };
                                                    Object.keys(realData).forEach(k => {
                                                        if (k.includes("A302")) newChecked[k] = true;
                                                    });
                                                    return {
                                                        ...f,
                                                        plantStatus: "existing",
                                                        plantYear: "",
                                                        luChecked: newChecked,
                                                    };
                                                }));
                                                onProjectTypeChange?.("existing");
                                            }} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer", userSelect: "none", color: form.plantStatus === "existing" ? "#1a3d2b" : "#5a7a65", fontWeight: form.plantStatus === "existing" ? 700 : 500 }}>
                                                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid", borderColor: form.plantStatus === "existing" ? "#1e7a47" : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                                                    {form.plantStatus === "existing" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1e7a47" }} />}
                                                </div>
                                                ปลูกมาแล้ว
                                            </div>
                                        </div>
                                        {!form.plantStatus && (
                                            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                                                <i className="bi bi-exclamation-circle-fill" /> กรุณาเลือกสถานะแปลงก่อนจึงจะกรอกข้อมูลด้านล่างได้
                                            </div>
                                        )}
                                    </div>

                                    {/* Fields grid */}
                                    <div style={{
                                        position: "relative",
                                        opacity: form.plantStatus ? 1 : 0.4,
                                        transition: "opacity 0.3s",
                                        pointerEvents: form.plantStatus ? "auto" : "none",
                                    }}>
                                        {!form.plantStatus && (
                                            <div style={{
                                                position: "absolute", inset: 0, background: "rgba(248,250,252,0.6)",
                                                zIndex: 5, borderRadius: 8,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                fontSize: 12, color: "#94a3b8", gap: 6
                                            }}>
                                                <i className="bi bi-lock-fill" /> รอเลือกสถานะแปลงก่อน
                                            </div>
                                        )}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                                            gap: "16px 20px",
                                            padding: isMobile ? "16px" : "20px 24px",
                                            background: "#fff"
                                        }}>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3d2b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-calendar-event" style={{ color: "#1e7a47" }} /> ปีที่ปลูก (พ.ศ.)
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e6f0ea", padding: "0 12px" }}
                                                    value={form.plantYear}
                                                    onChange={e => updateForm(i, "plantYear", e.target.value)}
                                                    disabled={!form.plantStatus}
                                                >
                                                    <option value="">— เลือกปีที่ปลูก —</option>
                                                    {(form.plantStatus === "replanting" ? NEW_YEAR_OPTIONS : form.plantStatus === "existing" ? OLD_YEAR_OPTIONS : []).map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3d2b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-tags" style={{ color: "#1e7a47" }} /> พันธุ์ยาง
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e6f0ea", padding: "0 12px" }}
                                                    value={form.variety}
                                                    onChange={e => updateForm(i, "variety", e.target.value)}
                                                    disabled={!form.plantStatus}
                                                >
                                                    <option value="">— เลือกสายพันธุ์ยาง —</option>
                                                    {cloneOptions.map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3d2b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-tree" style={{ color: "#1e7a47" }} /> จำนวนต้นยาง
                                                </div>
                                                <input
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e6f0ea", padding: "0 12px" }}
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    placeholder="ระบุจำนวนต้น"
                                                    value={form.treeCount}
                                                    onChange={e => updateForm(i, "treeCount", e.target.value)}
                                                    onBlur={e => {
                                                        const val = parseFloat(e.target.value);
                                                        if (!isNaN(val)) {
                                                            updateForm(i, "treeCount", Math.round(val).toString());
                                                        }
                                                    }}
                                                    disabled={!form.plantStatus}
                                                />
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a3d2b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-arrows-expand" style={{ color: "#1e7a47" }} /> ระยะปลูก (ม.)
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e6f0ea", padding: "0 12px" }}
                                                    value={form.spacing}
                                                    onChange={e => updateForm(i, "spacing", e.target.value)}
                                                    disabled={!form.plantStatus}
                                                >
                                                    <option value="">— เลือกระยะปลูก —</option>
                                                    {spacingOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Land Use Checkboxes */}
                                        <div style={{ padding: isMobile ? "0 16px 16px" : "0 24px 20px", background: "#fff" }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                                                <i className="bi bi-layers" style={{ color: "#10b981" }} /> ชั้นข้อมูลการใช้ประโยชน์ที่ดิน (กรมพัฒนาที่ดิน)
                                            </div>

                                            {(() => {
                                                const plotLUData = plotsLuRealData[i] || {};
                                                const hasAnyDetected = Object.values(plotLUData).some(v => v.rai > 0);
                                                const effectiveCount = Object.entries(form.luChecked || {})
                                                    .filter(([cls, on]) => cls !== "A" && on && (plotLUData[cls]?.rai ?? 0) > 0).length;
                                                const showNoLuWarning = form.plantStatus && hasAnyDetected && effectiveCount === 0;

                                                return showNoLuWarning ? (
                                                    <div style={{
                                                        marginBottom: 12, padding: "8px 12px",
                                                        background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)",
                                                        borderRadius: 10, display: "flex", alignItems: "center", gap: 8,
                                                        fontSize: 12, color: "#92400e", fontWeight: 600
                                                    }}>
                                                        <i className="bi bi-exclamation-triangle-fill" style={{ color: "#f59e0b", flexShrink: 0 }} />
                                                        <span>กรุณาเลือกประเภทการใช้ที่ดินอย่างน้อย 1 ประเภทเพื่อประมวลผล</span>
                                                    </div>
                                                ) : null;
                                            })()}

                                            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
                                                {(() => {
                                                    const plotLUData = plotsLuRealData[i] || {};
                                                    const isNew = form.plantStatus === "replanting";
                                                    const isOld = form.plantStatus === "existing";

                                                    // Behavior differs by plantStatus:
                                                    // All types (A, U, M, W, F, A-sub) are now checkable for both replanting and existing
                                                    const baseLU = [
                                                        { id: "U", color: "#ef4444" },
                                                        { id: "A", color: "#84cc16", defaultChecked: true },
                                                        { id: "F", color: "#166534" },
                                                        { id: "W", color: "#3b82f6" },
                                                        { id: "M", color: "#9ca3af" }
                                                    ];
                                                    const displayLU: any[] = [];
                                                    baseLU.forEach(base => {
                                                        // Only show types that were detected by the API
                                                        const hasBase = plotLUData[base.id] && plotLUData[base.id].rai > 0;
                                                        if (!hasBase) return;
                                                        const desc = LU_DESC_MAP[base.id];
                                                        displayLU.push({ ...base, label: desc ? (desc.startsWith(base.id) ? desc : `${base.id} ${desc}`) : base.id });

                                                        if (base.id === "A") {
                                                            const aSubtypes = Object.keys(plotLUData).filter(k => k.startsWith("A") && k !== "A").sort();
                                                            aSubtypes.forEach(sub => {
                                                                const realSubData = plotLUData[sub];
                                                                if (realSubData && realSubData.rai > 0) {
                                                                    const desc = realSubData.desc || "";
                                                                    const isA302 = sub.includes("A302");
                                                                    displayLU.push({
                                                                        id: sub,
                                                                        label: desc ? (desc.startsWith(sub) ? desc : `${sub} ${desc}`) : sub,
                                                                        defaultChecked: isA302,
                                                                        indent: true,
                                                                        color: "#84cc16"
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    });

                                                    if (displayLU.length === 0) {
                                                        return <div style={{ color: "#94a3b8", fontSize: 12 }}>ไม่พบข้อมูลการใช้ประโยชน์ที่ดินในแปลงนี้</div>;
                                                    }

                                                    return displayLU.map(lu => {
                                                        const isDisabled = !form.plantStatus || lu.displayOnly;
                                                        const isChecked = lu.displayOnly ? false : (form.luChecked?.[lu.id] ?? lu.defaultChecked ?? false);
                                                        const realData = plotLUData[lu.id];
                                                        const hasArea = realData && realData.rai > 0;
                                                        return (
                                                            <label key={lu.id} style={{
                                                                display: "flex", alignItems: "center", gap: 8,
                                                                cursor: isDisabled ? "not-allowed" : "pointer",
                                                                paddingLeft: lu.indent ? 24 : 0
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    disabled={isDisabled}
                                                                    style={{ accentColor: isChecked ? lu.color : "#94a3b8", width: 16, height: 16 }}
                                                                    onChange={(e) => {
                                                                        const newChecked = { ...form.luChecked, [lu.id]: e.target.checked };
                                                                        setPlotForms(prev => {
                                                                            const updated = prev.map((f, idx) => idx === i ? { ...f, luChecked: newChecked } : f);
                                                                            const allChecked: Record<number, Record<string, boolean>> = {};
                                                                            updated.forEach((f, idx) => { allChecked[idx] = f.luChecked; });
                                                                            setTimeout(() => onLandUseChange?.(allChecked, i), 0);
                                                                            return updated;
                                                                        });
                                                                    }}
                                                                />
                                                                <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: lu.color, flexShrink: 0 }} />
                                                                <span style={{ flex: 1, color: "#0f172a", fontWeight: isChecked ? 600 : 400 }}>{lu.label}</span>
                                                                <span style={{ color: isChecked ? lu.color : "#64748b", fontSize: 14, fontWeight: 700 }}>
                                                                    {hasArea ? `${realData.rai.toFixed(2)} ไร่` : "0.00 ไร่"}
                                                                    {hasArea && (
                                                                        <span style={{ opacity: 0.7, fontSize: 13 }}> ({realData.pct}%)</span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                            {/* Selected area summary */}
                                            {(() => {
                                                const plotLUData = plotsLuRealData[i] || {};
                                                const activeLeafIds: string[] = [];

                                                const allFormKeys = Object.keys(form.luChecked || {});
                                                const allDataKeys = Object.keys(plotLUData);
                                                const allKeys = new Set([...allDataKeys, ...allFormKeys]);

                                                allKeys.forEach(k => {
                                                    if (k === "A") return;
                                                    const isSubA = k.startsWith("A") && k !== "A";
                                                    const isTopLevel = !k.startsWith("A");

                                                    if (isSubA) {
                                                        const defaultOn = k.includes("A302");
                                                        const isChecked = form.luChecked?.[k] ?? defaultOn;
                                                        if (isChecked) activeLeafIds.push(k);
                                                    } else if (isTopLevel) {
                                                        const isChecked = form.luChecked?.[k] ?? false;
                                                        if (isChecked) activeLeafIds.push(k);
                                                    }
                                                });

                                                const hasCheckedA = activeLeafIds.some(id => id.startsWith("A"));
                                                if (!hasCheckedA && plotLUData["A"]) {
                                                    activeLeafIds.push("A");
                                                }

                                                const selectedRai = activeLeafIds.reduce((sum, cls) => {
                                                    const realRai = plotLUData[cls]?.rai || 0;
                                                    return sum + realRai;
                                                }, 0);

                                                const hasAnyDetected = Object.values(plotLUData).some(v => v.rai > 0);
                                                // Exclude "A" (parent, always auto-checked) — only count actual leaf LU classes
                                                const effectiveCount = Object.entries(form.luChecked || {})
                                                    .filter(([cls, on]) => cls !== "A" && on && (plotLUData[cls]?.rai ?? 0) > 0).length;
                                                const showNoLuWarning = form.plantStatus && hasAnyDetected && effectiveCount === 0;

                                                return selectedRai > 0 ? (
                                                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(249,115,22,0.08)", borderRadius: 8, border: "1px solid rgba(249,115,22,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                        <span style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>
                                                            <i className="bi bi-check2-square me-1" /> พื้นที่ที่เลือก
                                                        </span>
                                                        <span style={{ fontSize: 15, color: "#c2410c", fontWeight: 700 }}>
                                                            {selectedRai.toFixed(2)} ไร่
                                                        </span>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                </Accordion>
                            </div>
                        );
                    })}
                </div>




                {/* Delete confirmation popup */}
                {deleteConfirmIdx !== null && (
                    <div style={{
                        position: "fixed", inset: 0, zIndex: 9999,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "0 20px"
                    }} onClick={() => setDeleteConfirmIdx(null)}>
                        <div
                            style={{
                                background: "#fff", borderRadius: 18, padding: "24px 20px 20px",
                                width: "100%", maxWidth: 320,
                                boxShadow: "0 24px 64px rgba(0,0,0,0.25)"
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <i className="bi bi-trash3-fill" style={{ color: "#ef4444", fontSize: 17 }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: "#1a3d2b" }}>แปลงที่ {parseInt((parcelFeatures[deleteConfirmIdx]?.properties as any)?.plot_index) || (deleteConfirmIdx + 1)}</div>
                                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                                        {plots[deleteConfirmIdx]?.areaRai ? `${plots[deleteConfirmIdx].areaRai.toFixed(2)} ไร่` : ""}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: 14, color: "#5a7a65", marginBottom: 20, lineHeight: 1.6, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e6f0ea" }}>
                                ต้องการลบแปลงนี้ใช่หรือไม่?<br />
                                <span style={{ color: "#ef4444", fontWeight: 600 }}>ข้อมูลแปลงนี้จะไม่สามารถกู้คืนได้</span>
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => setDeleteConfirmIdx(null)}
                                    style={{
                                        flex: 1, padding: "11px 0", borderRadius: 10,
                                        border: "1.5px solid #e6f0ea", background: "#f8fafc",
                                        cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#5a7a65"
                                    }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={() => { onDeleteParcel?.(deleteConfirmIdx); setDeleteConfirmIdx(null); }}
                                    style={{
                                        flex: 1, padding: "11px 0", borderRadius: 10,
                                        border: "none",
                                        background: "#dc2626",
                                        color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
                                        boxShadow: "0 4px 12px rgba(220,38,38,0.25)"
                                    }}
                                >
                                    <i className="bi bi-trash3 me-1" /> ลบแปลง
                                </button>
                            </div>
                        </div>
                    </div>
                )}                {/* Action buttons moved to top */}
            </div>
        );
    }

    // ── Step 3: Carbon Results & Save ────────────────────────────────
    if (currentStep === 3) {
        // Build aggregate bar points
        let aggregatePts: BarPoint[] = [];
        let aggregateMinEndYearBE = 0;
        if (backendResponses && backendResponses.length > 0) {
            const avgStartAge = carbonResults.length > 0
                ? Math.round(carbonResults.reduce((s, c) => s + c.age, 0) / carbonResults.length)
                : 0;
            aggregatePts = aggregateProfiles(backendResponses, avgStartAge);

            const profiles = backendResponses
                .map(r => r.carbon_profile)
                .filter((p): p is YearlyAssess[] => Array.isArray(p) && p.length > 0);
            if (profiles.length > 0) {
                const age28Years = profiles.map(p => {
                    const item28 = p.find(item => item.age === 28);
                    return item28 ? item28.year : p[p.length - 1].year;
                });
                aggregateMinEndYearBE = Math.min(...age28Years) + 543;
            }
        }

        // aggregatePts spans each profile's full age-0..35 window, so index 0 is
        // the earliest plot's planting year, not "now" — find the row for the
        // current calendar year instead.
        const aggregateNowYearBE = new Date().getFullYear() + 543;
        const aggregateNowPt = aggregatePts.find(p => p.yearBE === aggregateNowYearBE) ?? aggregatePts[0];

        const summaryTotalCo2 = aggregatePts.length > 0
            ? (aggregateNowPt?.co2 ?? 0)
            : carbonResults.reduce((sum, c) => sum + Math.floor(c.co2Now || 0), 0);
        const summaryTotalCo2Ci = aggregatePts.length > 0
            ? (aggregateNowPt?.ci ?? 0)
            : Math.round(carbonResults.reduce((sum, c) => sum + Math.floor((c.co2NowCi || 0) * 10) / 10, 0) * 10) / 10;

        const showAggregateAge = carbonResults.some((c, idx) => {
            const form = plotForms[idx];
            const resp = backendResponses?.find(r => r.polygon_id === plotIds[idx] || r.polygon_id === `plot-${idx}`);
            return !!form?.plantYear || (resp?.carbon_profile?.some(p => p.age !== null) ?? false);
        });

        return (
            <div className="prp-shell">
                {/* ── Header ─────────────────────────────────────── */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginBottom: 16, paddingBottom: 14,
                    borderBottom: "1px solid #e6f0ea"
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: "#1a3d2b", lineHeight: 1.25, letterSpacing: "-0.2px" }}>
                            {isMobile ? (
                                <>ผลการประเมิน<br />คาร์บอนกักเก็บ</>
                            ) : (
                                "ผลการประเมินผลคาร์บอนกักเก็บ"
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: "#5a7a65", marginTop: 3, fontWeight: 500 }}>
                            แสดงผลรวมและรายแปลง
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setSaveState("idle");
                            onStepChange(2);
                        }}
                        title="จัดการข้อมูลแปลง"
                        style={{ flexShrink: 0, alignSelf: "flex-start", padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4, color: "#1e7a47", border: "1px solid #cfe6d9", background: "#ffffff", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.18s", lineHeight: 1.5 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#edfaf3"; e.currentTarget.style.borderColor = "#1e7a47"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#cfe6d9"; }}
                    >
                        <i className="bi bi-chevron-left" style={{ fontSize: 11 }} />
                        <span>จัดการข้อมูลแปลง</span>
                    </button>
                </div>



                {/* ── Total Overview Accordion ────────────────────────────── */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #e6f0ea",
                    overflow: "hidden",
                    marginBottom: 16
                }}>
                    <div
                        onClick={() => {
                            const willExpand = expandedResultIdx !== "total";
                            setExpandedResultIdx(willExpand ? "total" : null);
                            if (willExpand) {
                                onMapPlotSelected?.("total");
                            }
                        }}
                        style={{
                            background: "#ffffff",
                            padding: "12px 14px",
                            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                            borderBottom: expandedResultIdx === "total" ? "1px solid #e6f0ea" : "none"
                        }}
                    >
                        <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            background: "#edfaf3", border: "1px solid #e6f0ea",
                            color: "#1e7a47", display: "flex", alignItems: "center",
                            justifyContent: "center", fontWeight: 700, fontSize: 14
                        }}>
                            <i className="bi bi-folder" />
                        </div>
                        <div style={{ flex: 1 }}>
                            {projectName ? (
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", lineHeight: 1.25, marginBottom: 2 }}>
                                    <span style={{ color: "#5a7a65", fontSize: 13, fontWeight: 500 }}>โครงการ</span>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: "#1a3d2b" }}>
                                        {projectName}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a3d2b", lineHeight: 1.25, marginBottom: 2 }}>โครงการ</div>
                            )}
                            <div style={{ fontSize: 12, color: "#5a7a65" }}>
                                {carbonResults.length} แปลง · {totalArea.toFixed(2)} ไร่
                            </div>
                        </div>
                        <i className={`bi bi-chevron-${expandedResultIdx === "total" ? 'up' : 'down'}`} style={{ color: "#5a7a65", fontSize: 14 }} />
                    </div>

                    <Accordion open={expandedResultIdx === "total"}>
                        <div style={{ padding: "14px 14px 16px" }}>
                            {aggregatePts.length > 0 && (
                                <div>
                                    <CarbonBarChart pts={aggregatePts} isMobile={isMobile} narrowMode={!isMobile} showAge={false} title="ปริมาณคาร์บอนสะสม (tCO₂eq/โครงการ)" initialMaxYearBE={aggregateMinEndYearBE > 0 ? aggregateMinEndYearBE : undefined} baseline={{ value: summaryTotalCo2, ci: summaryTotalCo2Ci || 0 }} />
                                </div>
                            )}
                        </div>
                    </Accordion>
                </div>

                {/* ── Per-Plot Cards ────────────────────────────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {carbonResults.map((cr, i) => {
                        const form = plotForms[i];
                        const plot = plots[i];
                        const backendResp = backendResponses?.find(r => r.polygon_id === plotIds[i] || r.polygon_id === `plot-${i}`);
                        const ep = backendResp?.assess_parameters;
                        const plotDisplayNum = parseInt((parcelFeatures[i]?.properties as any)?.plot_index) || (i + 1);

                        const backendProfile = backendResp?.carbon_profile;
                        const startYearBE = cr.plantYearBE > 0 ? cr.plantYearBE + cr.age : CURRENT_BE;
                        const plotPtsRaw = backendProfile && backendProfile.length > 0
                            ? profileToBarPoints(backendProfile, cr.age)
                            : [];
                        const plotPts = plotPtsRaw;

                        const showPlotAge = !!form?.plantYear || (backendResp?.carbon_profile?.some(p => p.age !== null) ?? false);

                        return (
                            <div
                                key={i}
                                style={{
                                    background: "#fff",
                                    borderRadius: 12,
                                    border: "1px solid #e6f0ea",
                                    overflow: "hidden",
                                    scrollMarginTop: 10
                                }}
                            >
                                {/* Plot header */}
                                <div
                                    onClick={(e) => {
                                        const willExpand = expandedResultIdx !== i;
                                        const card = e.currentTarget.parentElement;
                                        setExpandedResultIdx(willExpand ? i : null);
                                        if (willExpand) {
                                            if (parcelFeatures[i]) onFlyTo(parcelFeatures[i]);
                                            onMapPlotSelected?.(i);
                                            requestAnimationFrame(() => {
                                                card?.scrollIntoView({ behavior: "smooth", block: "start" });
                                            });
                                        } else {
                                            onMapPlotSelected?.("total");
                                        }
                                    }}
                                    style={{
                                        background: "#ffffff",
                                        padding: "12px 14px",
                                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                                        borderBottom: expandedResultIdx === i ? "1px solid #e6f0ea" : "none"
                                    }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                        background: "#edfaf3", border: "1px solid #e6f0ea",
                                        color: "#1e7a47", display: "flex", alignItems: "center",
                                        justifyContent: "center", fontWeight: 700, fontSize: 14
                                    }}>{plotDisplayNum}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a3d2b" }}>แปลงที่ {plotDisplayNum}</div>
                                            {form?.plantStatus === "replanting" && (
                                                <span style={{ fontSize: 10, background: "#edfaf3", color: "#1e7a47", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>เริ่มปลูกใหม่</span>
                                            )}
                                            {form?.plantStatus === "existing" && (
                                                <span style={{ fontSize: 10, background: "#f1f5f9", color: "#5a7a65", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>ปลูกมาแล้ว</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#5a7a65" }}>
                                            {plot?.areaRai.toFixed(2)} ไร่
                                        </div>
                                    </div>
                                    <i className={`bi bi-chevron-${expandedResultIdx === i ? 'up' : 'down'}`} style={{ color: "#5a7a65", fontSize: 14 }} />
                                </div>

                                <Accordion open={expandedResultIdx === i}>
                                    {/* Plot chart */}
                                    <div style={{ padding: "12px 12px 4px" }}>
                                        <CarbonBarChart pts={plotPts} isMobile={isMobile} narrowMode={!isMobile} showAge={showPlotAge} baseline={{ value: cr.co2Now, ci: cr.co2NowCi || 0 }} />
                                    </div>

                                    {/* Plot details */}
                                    <div style={{ padding: "8px 14px 14px" }}>
                                        <PlotDetailCard form={form} cr={cr} ep={ep || null} areaRai={cr.selectedAreaRai} />
                                    </div>
                                </Accordion>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return null;
}
