"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { ChevronLeft, Pencil, Trash2, Pin, Check, Clock, Loader2 } from "lucide-react";
import { CarbonBarChart, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import { assessCarbon } from "@/lib/carbon-api";
import type { SavedPlot } from "../../types";
import { PlotMiniMap } from "../../PlotMiniMap";
import { EditPlotModal } from "../../EditPlotModal";
import { CollapsibleSection } from "../../CollapsibleSection";
import { buildAssessRequest, applyAssessResponse } from "../../assessPlot";
import plotStyles from "../../PlotCard.module.css";

const plantStatusLabel = (status?: string) =>
  status === "replanting" ? "เริ่มปลูกใหม่" : status === "existing" ? "ปลูกมาแล้ว" : "—";

export default function PlotDetailPage() {
  const { projectId, plotId } = useParams<{ projectId: string; plotId: string }>();
  const router = useRouter();
  const { user, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [plots, setPlots] = useState<SavedPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expandYears, setExpandYears] = useState(false);
  const [expandNotes, setExpandNotes] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [errorModalMsg, setErrorModalMsg] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const isGuestUser = () => !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const fetchPlots = useCallback(() => {
    if (!ready || !projectId) return;
    let url = `/api/plots?id=${encodeURIComponent(projectId)}`;
    if (user) {
      if (isAdmin) url += "&all=true";
    } else if (isGuestUser()) {
      url += `&guest_user_id=${localStorage.getItem("guest_user_id")}`;
    }

    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(r => r.ok ? r.json() : { plots: [] })
      .then(data => setPlots(Array.isArray(data.plots) ? data.plots : []))
      .catch(() => setPlots([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, isAdmin, projectId]);

  useEffect(() => {
    setMounted(true);
    fetchPlots();
  }, [fetchPlots]);

  const plotIndex = plots.findIndex(p => p.id === plotId);
  const plot = plotIndex >= 0 ? plots[plotIndex] : null;

  const buildSaveBody = (allPlotsForProject: SavedPlot[]) => {
    const plantationInfo: Record<string, any> = {};
    allPlotsForProject.forEach(p => {
      plantationInfo[p.id] = {
        polygon_id: p.id,
        province_code: p.province || "UNK",
        geometry: p.geojson || p.boundaryGeojson || null,
        form: p.backendData?.form || {},
        lu_polygon: p.backendData?.lu_polygon || []
      };
    });

    const polygonsPayload = allPlotsForProject.map((p) => {
      let geom = p.geojson as GeoJSON.Geometry;
      if (!geom && p.boundaryGeojson) geom = p.boundaryGeojson as GeoJSON.Geometry;
      const luFeatures = p.backendData?.lu_polygon || [];
      const luChecked = p.luChecked || { A: true, A302: true };
      let combinedGeom = geom;
      if (luFeatures.length > 0) {
        const allRings: GeoJSON.Position[][][] = [];
        for (const feat of luFeatures) {
          const code = (feat as any).properties?.lu_class as string | undefined;
          const P = code ? code.charAt(0).toUpperCase() : "";
          if (!code || luChecked[code] || luChecked[P] || code === "A302") {
            const fGeom = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
            if (fGeom.type === "Polygon") allRings.push(fGeom.coordinates);
            else if (fGeom.type === "MultiPolygon") allRings.push(...fGeom.coordinates);
          }
        }
        if (allRings.length > 0) {
          combinedGeom = allRings.length === 1 ? { type: "Polygon", coordinates: allRings[0] } : { type: "MultiPolygon", coordinates: allRings };
        }
      }
      const userYearBE = p.backendData?.form?.plantYear ? parseInt(p.backendData.form.plantYear) : 0;
      return {
        id: p.id,
        geometry: combinedGeom,
        year_of_planting: userYearBE > 0 ? userYearBE - 543 : null,
        rubber_clone: p.backendData?.form?.variety || null,
        tree_count: p.backendData?.form?.treeCount ? parseInt(p.backendData.form.treeCount) : null,
        spacing_system: p.backendData?.form?.spacing || null,
        growth_model: p.backendData?.form?.growthModel || null,
        allometry: p.backendData?.form?.allometry || null,
        selected_lu_classes: Object.entries(p.luChecked || {}).filter(([_, on]) => on).map(([cls]) => cls),
        project_type: (p.plantStatus as "replanting" | "existing") || undefined,
      };
    });

    return { frontendPlots: allPlotsForProject, plantationInfo, polygonsPayload };
  };

  const handleUpdatePlot = (updated: SavedPlot) => {
    if (!user && !isGuestUser()) return;
    const newPlots = plots.map(p => p.id === updated.id ? updated : p);
    setPlots(newPlots);
    setEditing(false);

    // EditPlotModal already flips `processed` to false when a carbon-
    // affecting field changed — mirror that server-side by retiring the
    // plot's current assessment, otherwise the DB still reports it as
    // processed (with the old, now-stale results) on the next fetch.
    const staleAssessmentPolygonIds = updated.processed === false ? [updated.id] : [];

    fetch(`/api/plots/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildSaveBody(newPlots), staleAssessmentPolygonIds }),
    }).catch(console.error);
  };

  const handleSaveAndProcess = async (updated: SavedPlot) => {
    if (!user && !isGuestUser()) return;
    setEstimating(true);

    try {
      const polygon = buildAssessRequest(updated);
      const responses = await assessCarbon([polygon]);
      const resp = responses.find(r => r.polygon_id === updated.id);
      const finalPlot = applyAssessResponse(updated, resp);

      const newPlots = plots.map(p => p.id === updated.id ? finalPlot : p);
      setPlots(newPlots);
      setEditing(false);

      await fetch(`/api/plots/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildSaveBody(newPlots), backendResponses: responses }),
      });
    } catch (err) {
      setErrorModalMsg("เกิดข้อผิดพลาดในการประมวลผลคาร์บอนกักเก็บ");
    } finally {
      setEstimating(false);
    }
  };

  const handleDeletePlot = () => {
    if (!plot) return;
    if (!user && !isGuestUser()) return;
    setConfirmingDelete(false);

    const remaining = plots.filter(p => p.id !== plot.id);
    const guestQuery = isGuestUser() ? `?guest_user_id=${localStorage.getItem("guest_user_id")}` : "";

    if (remaining.length === 0) {
      // Last plot in the project — soft-delete the whole project row.
      fetch(`/api/plots/${projectId}${guestQuery}`, { method: "DELETE" }).catch(console.error);
    } else {
      fetch(`/api/plots/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontendPlots: remaining }),
      }).catch(console.error);
    }
    router.push(`/my-plots/${projectId}`);
  };

  if (!ready || !mounted || loading)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fdfb" }}>
        <div className="spinner-border" style={{ color: "#1e7a47", width: "3rem", height: "3rem" }} role="status" />
      </div>
    );

  if (!plot) {
    return (
      <div className="kc-tw min-h-screen bg-muted/30 pt-[108px] pb-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/my-plots/${projectId}`}
            className="mb-4 flex h-10 w-fit items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary/10"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> กลับไปดูรายการแปลง
          </Link>
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            ไม่พบแปลงนี้ในโครงการ
          </div>
        </div>
      </div>
    );
  }

  const isProcessed = plot.processed === true || (plot.carbonProfile && plot.carbonProfile.length > 0) || (plot.carbonTotal > 0);
  const barPts: BarPoint[] = isProcessed && plot.carbonProfile ? plot.carbonProfile : [];
  const nowPt = barPts.find(p => p.year_at === 0) ?? barPts[0];

  const backendData = plot.backendData || {};
  const form = backendData.form;
  const ep = backendData.ep;

  const userEnteredYear = !!form?.plantYear;
  const showPlotAge = !!form?.plantYear || (plot.carbonProfile?.some(p => p.isAgeValid) ?? false);
  const yearParam = ep?.year_of_planting;
  const rawNotes: string[] = yearParam?.notes ?? yearParam?.note ?? [];
  const yearNotes = rawNotes.slice(0, 5);

  let yearBoxItems: Array<{ label: string; pct: number; yearBE: number }> = [];
  let displayYearBE: number | null = null;

  if (yearParam) {
    if (typeof yearParam.value === "number" && yearParam.value > 0) {
      displayYearBE = yearParam.value + 543;
      yearBoxItems = [{ label: `พ.ศ. ${displayYearBE}`, pct: 0, yearBE: displayYearBE as number }];
    } else if (Array.isArray(yearParam.value) && yearParam.value.length > 0) {
      const parsed = (yearParam.value as string[]).map(s => {
        const yearMatch = s.match(/^(\d{4})/);
        const pctMatch = s.match(/([\d.]+)%/);
        const yearCE = yearMatch ? parseInt(yearMatch[1]) : null;
        const yearBE = yearCE !== null ? yearCE + 543 : null;
        const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
        return { label: yearBE ? `พ.ศ. ${yearBE}` : s, pct, yearBE };
      }).filter((x): x is { label: string; pct: number; yearBE: number } => x.yearBE !== null);
      parsed.sort((a, b) => b.pct - a.pct);
      yearBoxItems = parsed;
      if (parsed.length > 0) displayYearBE = parsed[0].yearBE;
    }
  }
  if (!displayYearBE && plot.plantYearBE && plot.plantYearBE > 0) displayYearBE = plot.plantYearBE;

  const getSourceText = (source?: string | null, isFromUserFallback?: boolean) => {
    if (!source) return isFromUserFallback ? "" : "(คำนวณจากระบบ)";
    if (source.includes("default")) return "(ค่าเริ่มต้น)";
    if (source.includes("user input") || source.includes("user_input")) return "";
    return "(คำนวณจากระบบ)";
  };

  const displayVariety = ep?.rubber_clone?.value ? String(ep.rubber_clone.value) : (form?.variety || plot.variety || "");
  const displaySpacing = ep?.spacing_system?.value ? String(ep.spacing_system.value).replace(/\s*\([^)]*\)/, "").trim() : (form?.spacing || plot.spacing || "");
  const displayTreeCount = (ep?.tree_count && typeof ep.tree_count.value === "number")
    ? ep.tree_count.value
    : (parseInt(form?.treeCount || "0") || plot.trees || 0);

  const varietyDesc = getSourceText(ep?.rubber_clone?.source, !!form?.variety);
  const spacingDesc = getSourceText(ep?.spacing_system?.source, !!form?.spacing);
  const treeCountDesc = getSourceText(ep?.tree_count?.source, !!form?.treeCount);

  const convertYearNoteToBE = (note: string) => note.replace(/^(\d{4})/, (_, y) => String(parseInt(y) + 543));

  return (
    <div className="kc-tw min-h-screen bg-muted/30 pt-[108px] pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Back to plot list — guarded while a save-and-process PATCH is still in
           flight, so navigating away can't outrace it and land the project page
           on a fetch that reads the DB a moment too early (stale numbers). */}
        <Link
          href={`/my-plots/${projectId}`}
          onClick={(e) => { if (estimating) e.preventDefault(); }}
          aria-disabled={estimating}
          title={estimating ? "กำลังประมวลผล กรุณารอสักครู่..." : undefined}
          className={`mb-4 flex h-10 w-fit items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary/10 ${estimating ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> กลับไปดูรายการแปลง
        </Link>

        {/* Plot header */}
        <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:px-6">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-lg font-bold tracking-tight text-foreground md:text-xl">แปลงที่ {plotIndex + 1}</h1>
              {isProcessed ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#d7ede1] bg-[#edfaf3] px-2 py-0.5 text-[11px] font-bold text-[#1e7a47]">
                  <Check className="size-3" aria-hidden="true" />ประมวลผลแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-2 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                  <Clock className="size-3" aria-hidden="true" />ยังไม่ประมวลผล
                </span>
              )}
              {estimating && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />กำลังประมวลผล...
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
              <span><strong className={plotStyles.strongDark}>{new Date(plot.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</strong></span>
              <span>พื้นที่ <strong className={plotStyles.strongDark}>{(plot.selectedAreaRai || plot.areaRai || 0).toFixed(2)} ไร่</strong></span>
              <span>สถานะแปลง: <strong className={plotStyles.strongDark}>{plantStatusLabel(plot.plantStatus)}</strong></span>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <Link
              href={`/map-draw?project=${encodeURIComponent(plot.name)}&action=calc&plotId=${plot.id}`}
              onClick={(e) => { if (estimating) e.preventDefault(); }}
              aria-disabled={estimating}
              title={estimating ? "กำลังประมวลผล กรุณารอสักครู่..." : undefined}
              className={`flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted/60 md:flex-initial ${estimating ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <Pin className="size-4" aria-hidden="true" /> แก้ไขขอบเขต
            </Link>
            <button
              onClick={() => setEditing(true)}
              disabled={estimating}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 md:flex-initial"
            >
              <Pencil className="size-4" aria-hidden="true" /> แก้ไข
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={estimating}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-destructive/30 bg-destructive/5 px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 md:flex-initial"
            >
              <Trash2 className="size-4" aria-hidden="true" /> ลบ
            </button>
          </div>
        </div>

        {/* Dashboard: carbon graph (default open) + boundary map (default closed) */}
        <div className="flex flex-col gap-4">
          <CollapsibleSection icon="bi-bar-chart-fill" title="กราฟคาร์บอนกักเก็บ" isMobile={isMobile} defaultOpen>
            <div className={`${plotStyles.content} ${isMobile ? plotStyles.contentMobile : ""}`}>
              <div className={`${plotStyles.carbonGrid} ${!isMobile && isProcessed ? plotStyles.carbonGridTwoCol : ""}`}>
                {/* Left side: Graph Section */}
                <div className={plotStyles.graphPanel}>
                  {isProcessed && barPts.length > 0 ? (
                    <div className={plotStyles.graphInner}>
                      <div className={plotStyles.graphInnerBox}>
                        <CarbonBarChart pts={barPts} isMobile={isMobile} narrowMode={!isMobile} showAge={showPlotAge} baseline={nowPt ? { value: nowPt.co2, ci: nowPt.ci || 0 } : undefined} />
                      </div>
                    </div>
                  ) : (
                    <div className={plotStyles.emptyGraph}>
                      <div className={plotStyles.emptyGraphIconBox}>
                        <i className={`bi bi-clock-history ${plotStyles.emptyGraphIcon}`} />
                      </div>
                      <div className={plotStyles.emptyGraphTitle}>ยังไม่ได้ประมวลผลคาร์บอน</div>
                      <div className={plotStyles.emptyGraphSubtitle}>กรุณากด &quot;ประเมินคาร์บอนกักเก็บ&quot; ที่หน้ารายการแปลงเพื่อประมวลผลข้อมูล</div>
                    </div>
                  )}
                </div>

                {/* Right side: Details Section — only shown after processing */}
                {isProcessed && (
                  <div className={plotStyles.detailsPanel}>
                    <div className={plotStyles.detailsCard}>
                      {/* Header Section */}
                      <div className={plotStyles.detailsHeader}>
                        <span className={plotStyles.detailsHeaderLabel}>
                          <i className="bi bi-layers-fill" /> ข้อมูลที่ใช้ในการประมวลผล
                        </span>
                        {(plot.selectedAreaRai || plot.areaRai) > 0 && (
                          <div className={plotStyles.detailsAreaText}>
                            พื้นที่: <strong className={plotStyles.strongDark}>{(plot.selectedAreaRai || plot.areaRai).toFixed(2)}</strong> ไร่
                          </div>
                        )}
                      </div>

                      {/* Main Year Info (from user or value) */}
                      <div className={yearNotes.length > 0 ? plotStyles.yearSectionWithNotes : plotStyles.yearSection}>
                        <div className={plotStyles.yearLabel}>
                          ปีที่เริ่มปลูกที่ใช้ในการคำนวณ{" "}
                          {userEnteredYear ? (
                            <span className={plotStyles.yearLabelHighlight}>
                              (1 ปี: ข้อมูลที่ผู้ใช้ระบุ)
                            </span>
                          ) : yearBoxItems.length > 0 ? (
                            <span className={plotStyles.yearLabelHighlight}>
                              ({yearBoxItems.length} ปี: ข้อมูลอ้างอิงจากระบบ)
                            </span>
                          ) : (
                            <span className={plotStyles.yearLabelHighlight}>
                              (ข้อมูลอ้างอิงจากระบบ)
                            </span>
                          )}
                        </div>
                        <div className={plotStyles.yearBoxRow}>
                          {userEnteredYear ? (
                            <div className={plotStyles.yearBox}>
                              {displayYearBE ? `${displayYearBE}` : "—"}
                            </div>
                          ) : yearBoxItems.length > 0 ? (
                            <>
                              {yearBoxItems.slice(0, expandYears ? yearBoxItems.length : 3).map((box, bi) => (
                                <div key={bi} className={plotStyles.yearBox}>
                                  {box.label.replace(/พ\.ศ\.\s*/g, '')}{box.pct > 0 ? ` (${box.pct}%)` : ""}
                                </div>
                              ))}
                              {yearBoxItems.length > 3 && (
                                <button
                                  onClick={() => setExpandYears(!expandYears)}
                                  className={`${plotStyles.expandBtn} ${plotStyles.expandBtnLg} ${expandYears ? plotStyles.expandBtnOn : plotStyles.expandBtnOff}`}
                                  title={expandYears ? "แสดงน้อยลง" : "แสดงทั้งหมด"}
                                >
                                  <i className={`bi bi-${expandYears ? "dash" : "plus"} ${plotStyles.expandIconLg}`} />
                                </button>
                              )}
                            </>
                          ) : (
                            <div className={plotStyles.emptyText}>—</div>
                          )}
                        </div>
                      </div>

                      {/* Inner Box for yearNotes (สัดส่วนปีที่ปลูกที่ตรวจพบในแปลง) */}
                      {yearNotes.length > 0 && (
                        <div className={plotStyles.notesBox}>
                          <div className={plotStyles.notesBoxLabel}>
                            <i className={`bi bi-pie-chart-fill ${plotStyles.notesBoxIcon}`} /> สัดส่วนปีที่เริ่มปลูกที่ตรวจพบในแปลง:
                          </div>
                          <div className={plotStyles.yearBoxRow}>
                            {yearNotes.slice(0, expandNotes ? yearNotes.length : 3).map((note, ni) => {
                              const beNote = convertYearNoteToBE(note);
                              return (
                                <div key={ni} className={plotStyles.noteBox}>
                                  {beNote.replace(/พ\.ศ\.\s*/g, '')}
                                </div>
                              );
                            })}
                            {yearNotes.length > 3 && (
                              <button
                                onClick={() => setExpandNotes(!expandNotes)}
                                className={`${plotStyles.expandBtn} ${plotStyles.expandBtnSm} ${expandNotes ? plotStyles.expandBtnOn : plotStyles.expandBtnOff}`}
                                title={expandNotes ? "แสดงน้อยลง" : "แสดงทั้งหมด"}
                              >
                                <i className={`bi bi-${expandNotes ? "dash" : "plus"} ${plotStyles.expandIconSm}`} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Common params: variety, spacing, tree count */}
                      <div className={plotStyles.paramsSection}>
                        {displayVariety && <div>• พันธุ์ยาง: <strong className={plotStyles.strongDark}>{displayVariety}</strong> {varietyDesc && <span className={plotStyles.paramSource}>{varietyDesc}</span>}</div>}
                        {displaySpacing && <div>• ระยะปลูก: <strong className={plotStyles.strongDark}>{displaySpacing}</strong> {spacingDesc && <span className={plotStyles.paramSource}>{spacingDesc}</span>}</div>}
                        {displayTreeCount > 0 && <div>• จำนวนต้น: <strong className={plotStyles.strongDark}>{displayTreeCount.toLocaleString("th-TH")}</strong> ต้น {treeCountDesc && <span className={plotStyles.paramSource}>{treeCountDesc}</span>}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection icon="bi-map-fill" title="แผนที่ขอบเขต" isMobile={isMobile}>
            <div className={`${plotStyles.content} ${isMobile ? plotStyles.contentMobile : ""}`}>
              <PlotMiniMap plot={plot} isMobile={isMobile} index={plotIndex + 1} />
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {editing && (
        <EditPlotModal
          plot={plot}
          index={plotIndex + 1}
          onClose={() => setEditing(false)}
          onSave={handleUpdatePlot}
          onSaveAndProcess={handleSaveAndProcess}
          processing={estimating}
          isMobile={isMobile}
        />
      )}

      {confirmingDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s" }}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.2)", animation: "scaleUp 0.2s", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", marginBottom: 16 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 28 }} />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                ยืนยันการลบแปลงที่ {plotIndex + 1}?
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmingDelete(false)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#e6f0ea", color: "#475569", fontWeight: 700, fontSize: 15, cursor: "pointer", flex: 1 }}>
                ยกเลิก
              </button>
              <button
                onClick={handleDeletePlot}
                style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 }}
              >
                <i className="bi bi-trash3-fill" /> ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {errorModalMsg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s" }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: 20, maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", animation: "scaleUp 0.2s" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <i className="bi bi-exclamation-triangle" style={{ fontSize: 30, color: "#ef4444" }} />
            </div>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 18, fontWeight: 800, color: "#1e293b" }}>เกิดข้อผิดพลาด</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
              {errorModalMsg}
            </p>
            <button
              onClick={() => setErrorModalMsg(null)}
              style={{ width: "100%", padding: "12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
