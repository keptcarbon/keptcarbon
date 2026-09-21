"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Plus, ChevronLeft, ChevronRight, Map as MapIcon, LayoutGrid, Sparkles, Loader2, Check, Clock,
} from "lucide-react";
import { profileToBarPoints } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import { assessCarbon, type CarbonAssessRequest } from "@/lib/carbon-api";
import type { SavedPlot } from "../types";
import { ProjectCarbonSummary } from "../ProjectCarbonSummary";

const PAGE_SIZE = 10;

const plantStatusLabel = (status?: string) =>
  status === "replanting" ? "เริ่มปลูกใหม่" : status === "existing" ? "ปลูกมาแล้ว" : "—";

const isPlotProcessed = (plot: SavedPlot) =>
  plot.processed === true || (plot.carbonProfile && plot.carbonProfile.length > 0) || plot.carbonTotal > 0;

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [plots, setPlots] = useState<SavedPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [estimating, setEstimating] = useState(false);
  const [page, setPage] = useState(1);
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

  const totalPages = Math.max(1, Math.ceil(plots.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedPlots = plots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const projectName = plots[0]?.name || "ไม่มีชื่อโครงการ";
  const totalAreaRai = plots.reduce((s, p) => s + (p.areaRai || 0), 0);

  const handleInlineEstimate = async () => {
    const isGuest = isGuestUser();
    if (!user && !isGuest) return;
    setEstimating(true);

    try {
      const projectPlots = plots;
      const polygons: CarbonAssessRequest[] = projectPlots.map((plot) => {
        let geom = plot.geojson as GeoJSON.Geometry;
        if (!geom && plot.boundaryGeojson) {
          geom = plot.boundaryGeojson as GeoJSON.Geometry;
        }

        const luFeatures = plot.backendData?.lu_polygon || [];
        const luChecked = plot.luChecked || { A: true, A302: true };

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
            combinedGeom = allRings.length === 1
              ? { type: "Polygon", coordinates: allRings[0] }
              : { type: "MultiPolygon", coordinates: allRings };
          }
        }

        const userYearBE = plot.backendData?.form?.plantYear ? parseInt(plot.backendData.form.plantYear) : 0;

        return {
          id: plot.id,
          geometry: combinedGeom,
          // Only send to backend if the user EXPLICITLY filled it out in the form
          year_of_planting: userYearBE > 0 ? userYearBE - 543 : null,
          rubber_clone: plot.backendData?.form?.variety || null,
          tree_count: plot.backendData?.form?.treeCount ? parseInt(plot.backendData.form.treeCount) : null,
          spacing_system: plot.backendData?.form?.spacing || null,
          growth_model: plot.backendData?.form?.growthModel || null,
          allometry: plot.backendData?.form?.allometry || null,
          selected_lu_classes: Object.entries(plot.luChecked || {})
            .filter(([_, on]) => on)
            .map(([cls]) => cls),
          project_type: (plot.plantStatus as "replanting" | "existing") || undefined,
        };
      });

      // Process polygons one by one to ensure the backend processes all of them correctly
      const responsePromises = polygons.map(polygon => assessCarbon([polygon]));
      const responseArrays = await Promise.all(responsePromises);
      // Flatten the results into a single array of responses
      const responses = responseArrays.flat();

      const CURRENT_BE_NOW = new Date().getFullYear() + 543;
      const updatedPlots: SavedPlot[] = [];

      for (let i = 0; i < projectPlots.length; i++) {
        const plot = projectPlots[i];
        const resp = responses.find(r => r.polygon_id === plot.id);
        if (!resp) {
          console.warn('[ประมวลผล] ⚠️ No response for plot id:', plot.id);
          continue;
        }

        const ep = resp.assess_parameters;

        const epPlantYearCE = typeof ep?.year_of_planting?.value === "number" ? ep.year_of_planting.value : 0;
        const epPlantYearBE = epPlantYearCE > 0 ? epPlantYearCE + 543 : 0;
        const epTrees = typeof ep?.tree_count?.value === "number" ? ep.tree_count.value : 0;
        const epVariety = typeof ep?.rubber_clone?.value === "string" ? ep.rubber_clone.value : "";
        const epSpacingRaw = typeof ep?.spacing_system?.value === "string" ? ep.spacing_system.value : "";
        const epSpacing = epSpacingRaw.replace(/\s*\([^)]*\)/, "").trim();

        // Use the already-saved selectedAreaRai (from original map-draw selection) as first priority.
        // Only recalculate from LU features if it hasn't been set yet.
        let selectedAreaRai = plot.selectedAreaRai && plot.selectedAreaRai > 0 ? plot.selectedAreaRai : 0;
        if (selectedAreaRai <= 0) {
          const luFeatures = plot.backendData?.lu_polygon || [];
          const luChecked = plot.luChecked || { A: true, A302: true };
          const luAreaRai = luFeatures.reduce((acc: number, feat: any) => {
            const code = feat.properties?.LU_CODE || feat.properties?.lu_code || "";
            const P = code.charAt(0).toUpperCase();
            if (luChecked[code] || luChecked[P]) {
              return acc + (feat.properties?.areaRai || 0);
            }
            return acc;
          }, 0);
          selectedAreaRai = luAreaRai > 0 ? luAreaRai : plot.areaRai;
        }

        const formVariety = plot.backendData?.form?.variety || "";
        const formSpacing = plot.backendData?.form?.spacing || "";
        const formTrees = plot.backendData?.form?.treeCount ? parseInt(plot.backendData.form.treeCount) : 0;
        const userPlantYear = plot.plantYearBE || 0;

        const variety = formVariety || plot.variety || epVariety;
        const spacing = formSpacing || plot.spacing || epSpacing;

        const currentSpacing = spacing || "2.5x8";
        const density = currentSpacing === "2.5x7" ? 91 : (currentSpacing === "3x7" ? 76 : (currentSpacing === "3x8" ? 66 : 80));

        let crTrees = formTrees > 0 ? formTrees : Math.round(selectedAreaRai * density);
        if (crTrees <= 0 && epTrees > 0) crTrees = epTrees;

        const age = userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : (epPlantYearBE > 0 ? (CURRENT_BE_NOW - epPlantYearBE) : 0);
        const finalPlantYear = userPlantYear > 0 ? userPlantYear : epPlantYearBE;

        const rawProfile = resp.carbon_profile ?? [];
        const hasNewResult = rawProfile.length > 0;
        if (!hasNewResult) {
          console.warn('[ประเมินคาร์บอน] ⚠️ Empty carbon_profile for plot id:', plot.id, resp.status);
        }
        // Only flip to processed when this attempt actually returned profile data —
        // otherwise a failed/partial backend response would show the green
        // "ประมวลผลแล้ว" badge while the graph tab (gated on carbonProfile) stays empty.
        const co2Now = hasNewResult ? (rawProfile[0]?.stocks?.value ?? 0) : (plot.carbonTotal || 0);
        const carbonProfile = hasNewResult ? profileToBarPoints(rawProfile, age) : (plot.carbonProfile || []);

        const updatedPlot: SavedPlot = {
          ...plot,
          processed: hasNewResult ? true : (plot.processed || false),
          carbonTotal: co2Now,
          rubberAge: age,
          plantYearBE: finalPlantYear,
          trees: crTrees,
          variety,
          spacing,
          selectedAreaRai,
          carbonProfile,
          backendData: {
            ...plot.backendData,
            age,
            plantYearBE: epPlantYearBE,
            ep: ep || null,
          }
        };

        updatedPlots.push(updatedPlot);
      }

      // Update state locally
      const mergedPlots = plots.map(p => {
        const up = updatedPlots.find(u => u.id === p.id);
        return up ? up : p;
      });
      setPlots(mergedPlots);

      // Save to backend
      const dbProjectId = Number(projectId);
      if (dbProjectId) {
        const plantationInfo: Record<string, any> = {};
        mergedPlots.forEach(plot => {
          plantationInfo[plot.id] = {
            polygon_id: plot.id,
            province_code: plot.province || "UNK",
            geometry: plot.geojson || plot.boundaryGeojson || null,
            form: plot.backendData?.form || {},
            lu_polygon: plot.backendData?.lu_polygon || []
          };
        });

        await fetch(`/api/plots/${dbProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frontendPlots: mergedPlots,
            polygonsPayload: polygons,
            backendResponses: responses,
            plantationInfo: plantationInfo
          }),
        });
      }

    } catch (err) {
      setErrorModalMsg("เกิดข้อผิดพลาดในการประมวลผลคาร์บอนกักเก็บ");
    } finally {
      setEstimating(false);
    }
  };

  if (!ready || !mounted)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fdfb" }}>
        <div className="spinner-border" style={{ color: "#1e7a47", width: "3rem", height: "3rem" }} role="status" />
      </div>
    );

  return (
    <div className="kc-tw min-h-screen bg-muted/30 pt-[108px] pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Back to project list */}
        <Link
          href="/my-plots"
          className="mb-4 flex h-10 w-fit items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary/10"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> กลับไปดูรายการโครงการ
        </Link>

        {/* Project detail */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center md:px-6 md:py-5">
            <div>
              <h2 className="m-0 mb-1.5 text-lg font-bold tracking-tight text-foreground md:text-xl">
                {projectName !== "ไม่มีชื่อโครงการ" ? (
                  <>
                    <span className="mr-1.5 text-base font-medium text-muted-foreground">โครงการ</span>
                    {projectName}
                  </>
                ) : (
                  <span className="text-muted-foreground">ไม่มีชื่อโครงการ</span>
                )}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><MapIcon className="size-3.5 text-primary" aria-hidden="true" /> {plots.length} แปลง</span>
                <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5 text-primary" aria-hidden="true" /> {totalAreaRai.toFixed(2)} ไร่</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
              <button
                onClick={handleInlineEstimate}
                disabled={estimating || loading || plots.length === 0}
                className={`flex h-10 flex-[1_1_100%] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-0 px-4 text-sm font-semibold transition-colors md:flex-initial ${estimating || loading || plots.length === 0 ? "cursor-not-allowed bg-muted text-muted-foreground" : "cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"}`}
              >
                {estimating ? (
                  <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังประมวลผล...</>
                ) : (
                  <><Sparkles className="size-4" aria-hidden="true" /> ประเมินคาร์บอนกักเก็บ</>
                )}
              </button>
              <Link href={`/map-draw?project=${encodeURIComponent(projectName)}`} className="flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary/10 md:flex-initial">
                <Plus className="size-4" aria-hidden="true" /> เพิ่มแปลง
              </Link>
            </div>
          </div>

          <div className="border-t border-border/60 bg-muted/30 p-4 md:p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" /> กำลังโหลดข้อมูลแปลง...
              </div>
            ) : plots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
                ไม่พบแปลงในโครงการนี้
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ProjectCarbonSummary plots={plots} isMobile={isMobile} />

                {/* Plot list — paginated table (lightweight rows; the map + carbon
                   graph for a plot only render on its own dashboard page once
                   opened, so this stays fast even with 100+ plots). */}
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3 text-center">พื้นที่ (ไร่)</th>
                          <th className="px-4 py-3 text-center">สถานะแปลง</th>
                          <th className="px-4 py-3 text-center">สถานะการประมวลผล</th>
                          <th className="px-4 py-3 text-right">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPlots.map((plot, i) => (
                          <tr key={plot.id} className="border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/40">
                            <td className="px-4 py-3 text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{(plot.selectedAreaRai || plot.areaRai || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-center text-muted-foreground">{plantStatusLabel(plot.plantStatus)}</td>
                            <td className="px-4 py-3 text-center">
                              {isPlotProcessed(plot) ? (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#d7ede1] bg-[#edfaf3] px-2 py-0.5 text-[11px] font-bold text-[#1e7a47]">
                                  <Check className="size-3" aria-hidden="true" />ประมวลผลแล้ว
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-2 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                                  <Clock className="size-3" aria-hidden="true" />ยังไม่ประมวลผล
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/my-plots/${projectId}/${encodeURIComponent(plot.id)}`}
                                className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted/60"
                              >
                                ดูข้อมูลแปลง <ChevronRight className="size-4" aria-hidden="true" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        หน้า {page} จาก {totalPages} ({plots.length.toLocaleString("th-TH")} แปลง)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page <= 1}
                          className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Modal */}
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
              style={{ width: "100%", padding: "12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#dc2626"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.transform = "none"; }}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
