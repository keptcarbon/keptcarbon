"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Plus, ChevronLeft, ChevronRight, Map as MapIcon, LayoutGrid, Sparkles, Loader2, Check, Clock, Eye, Search, X,
} from "lucide-react";
import { assessCarbon } from "@/lib/carbon-api";
import type { SavedPlot } from "../types";
import { ProjectCarbonSummary } from "../ProjectCarbonSummary";
import { CollapsibleSection } from "../CollapsibleSection";
import { CarbonSimulationChart } from "../CarbonSimulationChart";
import { buildProjectSimRows } from "../simulationRequest";
import plotStyles from "../PlotCard.module.css";
import { buildAssessRequest, applyAssessResponse } from "../assessPlot";
import { formatPlotLocation } from "../plotLocation";

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
  const [searchTerm, setSearchTerm] = useState("");
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

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Keep each plot's original position so the # column (and "แปลงที่ N" on the
  // plot page) stays stable while filtering.
  const filteredPlots = useMemo(() => {
    const indexed = plots.map((plot, idx) => ({ plot, no: idx + 1 }));
    const term = searchTerm.toLowerCase().trim();
    if (!term) return indexed;
    return indexed.filter(({ plot, no }) =>
      String(no) === term ||
      (plot.plotNote ?? "").toLowerCase().includes(term) ||
      formatPlotLocation(plot).toLowerCase().includes(term) ||
      plantStatusLabel(plot.plantStatus).includes(term) ||
      (isPlotProcessed(plot) ? "ประมวลผลแล้ว" : "ยังไม่ประมวลผล").includes(term)
    );
  }, [plots, searchTerm]);

  const projectSim = useMemo(() => buildProjectSimRows(plots), [plots]);

  const totalPages = Math.max(1, Math.ceil(filteredPlots.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedPlots = filteredPlots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const projectName = plots[0]?.name || "ไม่มีชื่อโครงการ";
  const totalAreaRai = plots.reduce((s, p) => s + (p.areaRai || 0), 0);

  const handleInlineEstimate = async () => {
    const isGuest = isGuestUser();
    if (!user && !isGuest) return;
    setEstimating(true);

    try {
      const projectPlots = plots;
      const polygons = projectPlots.map(buildAssessRequest);

      // Process polygons one by one to ensure the backend processes all of them correctly
      const responsePromises = polygons.map(polygon => assessCarbon([polygon]));
      const responseArrays = await Promise.all(responsePromises);
      // Flatten the results into a single array of responses
      const responses = responseArrays.flat();

      // Update state locally
      const mergedPlots = projectPlots.map(plot =>
        applyAssessResponse(plot, responses.find(r => r.polygon_id === plot.id))
      );
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
                <span className="inline-flex items-center gap-1.5"><MapIcon className="size-3.5 text-primary" aria-hidden="true" /> <strong>{plots.length} แปลง</strong></span>
                <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5 text-primary" aria-hidden="true" /> <strong>{totalAreaRai.toFixed(2)} ไร่</strong></span>
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

                {/* Every assessed plot's cohorts in one /carbon/sim batch — the backend sums them */}
                <CollapsibleSection icon="bi-sliders" title="กราฟจำลองคาร์บอนกักเก็บ" isMobile={isMobile} keepMounted>
                  <div className={`${plotStyles.content} ${isMobile ? plotStyles.contentMobile : ""}`}>
                    {projectSim.rows.length === 0 ? (
                      <div className={plotStyles.emptyText} style={{ fontSize: 13 }}>กรุณาประเมินคาร์บอนของแปลงในโครงการก่อน จึงจะแสดงกราฟจำลองได้</div>
                    ) : (
                      <>
                        {projectSim.skipped > 0 && (
                          <div className={plotStyles.emptyText} style={{ fontSize: 13, marginBottom: 12 }}>
                            รวม {projectSim.included.toLocaleString("th-TH")} จาก {plots.length.toLocaleString("th-TH")} แปลง ({projectSim.skipped.toLocaleString("th-TH")} แปลงยังไม่ได้ประเมินหรือข้อมูลไม่ครบ)
                          </div>
                        )}
                        <CarbonSimulationChart baseRows={projectSim.rows} isMobile={isMobile} unitLabel="โครงการ" />
                      </>
                    )}
                  </div>
                </CollapsibleSection>

                {/* Search -- same look as the project list's search bar */}
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="ค้นหาข้อมูลแปลง, ที่ตั้ง, สถานะ..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} aria-label="ล้างการค้นหา" className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground">
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {searchTerm && (
                    <span className="shrink-0 text-sm text-muted-foreground">พบ {filteredPlots.length.toLocaleString("th-TH")}</span>
                  )}
                </div>

                {/* Plot list — paginated table (lightweight rows; the map + carbon
                   graph for a plot only render on its own dashboard page once
                   opened, so this stays fast even with 100+ plots). */}
                {filteredPlots.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
                    <Search className="mx-auto mb-1 mr-2 size-5 opacity-50" aria-hidden="true" />
                    ไม่พบแปลงที่ตรงกับ &ldquo;<strong className="text-foreground">{searchTerm}</strong>&rdquo;
                    <div>
                      <button onClick={() => setSearchTerm("")} className="mt-3 cursor-pointer rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10">
                        ล้างการค้นหา
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">ข้อมูลแปลง</th>
                          <th className="px-4 py-3">ที่ตั้ง</th>
                          <th className="px-4 py-3 text-center">พื้นที่ (ไร่)</th>
                          <th className="px-4 py-3 text-center">สถานะแปลง</th>
                          <th className="px-4 py-3 text-center">สถานะการประมวลผล</th>
                          <th className="px-4 py-3 text-right">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPlots.map(({ plot, no }) => (
                          <tr key={plot.id} className="border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/40">
                            <td className="px-4 py-3 text-muted-foreground">{no}</td>
                            <td className="max-w-[220px] truncate px-4 py-3 text-foreground" title={plot.plotNote || undefined}>{plot.plotNote || <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-4 py-3 text-foreground">{formatPlotLocation(plot) || <span className="text-muted-foreground">—</span>}</td>
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
                                title="ดูข้อมูลแปลง"
                                aria-label="ดูข้อมูลแปลง"
                                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground no-underline transition-colors hover:bg-muted/60"
                              >
                                <Eye className="size-4" aria-hidden="true" />
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
                        หน้า {page} จาก {totalPages} ({filteredPlots.length.toLocaleString("th-TH")} แปลง)
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
                )}
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
