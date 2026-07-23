"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Plus, Search, X, Check, Trash2, ChevronDown, ChevronUp,
  Map as MapIcon, LayoutGrid, Sparkles, User, Users, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileToBarPoints } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import { estimateCarbon, type PlantationPolygon } from "@/lib/carbon-api";
import type { SavedPlot } from "./types";
import { EditPlotModal } from "./EditPlotModal";
import { PlotCard } from "./PlotCard";
import { ProjectCarbonSummary } from "./ProjectCarbonSummary";
import { Accordion } from "./Accordion";

export default function MyPlotsPage() {
  const { user, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [plots, setPlots] = useState<SavedPlot[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [expandedPlotId, setExpandedPlotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mine" | "all">("mine");
  const [displayMode, setDisplayMode] = useState<"list" | "map">("list");
  const [isMobile, setIsMobile] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedProjectNames, setSelectedProjectNames] = useState<Set<string>>(new Set());
  const [plotToDelete, setPlotToDelete] = useState<{ plot: SavedPlot; index: number } | null>(null);
  const [errorModalMsg, setErrorModalMsg] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    setMounted(true);
    if (ready) {
      let url = "";
      if (user) {
        url = viewMode === "all" && isAdmin ? "/api/plots?all=true" : "/api/plots";
      } else {
        const guestId = localStorage.getItem("guest_user_id");
        if (guestId) {
          url = `/api/plots?guest_user_id=${guestId}`;
        }
      }

      if (url) {
        fetch(url)
          .then(r => r.ok ? r.json() : { plots: [] })
          .then(data => setPlots(Array.isArray(data.plots) ? data.plots : []))
          .catch(() => setPlots([]));
      } else {
        setPlots([]);
      }
    }
  }, [ready, user, viewMode, isAdmin]);


  const handleDelete = (id: string) => {
    const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
    if (!user && !isGuest) return;

    // Find the plot to get its dbProjectId
    const plotToDelete = plots.find(p => p.id === id);
    if (!plotToDelete || !plotToDelete.dbProjectId) {
      setPlots(prev => prev.filter(p => p.id !== id));
      return;
    }

    const remainingPlots = plots.filter(p => p.id !== id);
    setPlots(remainingPlots);

    const remainingInProject = remainingPlots.filter(p => p.dbProjectId === plotToDelete.dbProjectId);

    const guestQuery = isGuest ? `?guest_user_id=${localStorage.getItem("guest_user_id")}` : "";

    if (remainingInProject.length === 0) {
      // If this was the last plot in the project, soft-delete the entire project row
      fetch(`/api/plots/${plotToDelete.dbProjectId}${guestQuery}`, {
        method: "DELETE"
      }).catch(console.error);
    } else {
      // We only update the frontendPlots array of the same project to hide it
      // The plantation_info in the DB is untouched, fulfilling "want the deleted data to still remain"
      fetch(`/api/plots/${plotToDelete.dbProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontendPlots: remainingInProject })
      }).catch(console.error);
    }
  };



  const handleDeleteAll = () => {
    const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
    if (!user && !isGuest) return;
    if (viewMode === "all") {
      // Admin: ลบทีละแปลงที่แสดงอยู่
      plots.forEach(p => handleDelete(p.id));
    } else {
      setPlots([]);
      const guestQuery = isGuest ? `?guest_user_id=${localStorage.getItem("guest_user_id")}` : "";
      fetch(`/api/plots${guestQuery}`, { method: "DELETE" }).catch(console.error);
    }
    setConfirmDeleteAll(false);
  };



  const handleDeleteProject = (projectName: string) => {
    const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
    const projectPlots = plots.filter(p => p.name === projectName);
    const uniqueProjectIds = [...new Set(projectPlots.map(p => p.dbProjectId).filter((id): id is number => id !== undefined))];
    setPlots(prev => prev.filter(p => p.name !== projectName));
    const guestQuery = isGuest ? `?guest_user_id=${localStorage.getItem("guest_user_id")}` : "";
    uniqueProjectIds.forEach(dbId => {
      fetch(`/api/plots/${dbId}${guestQuery}`, { method: "DELETE" }).catch(console.error);
    });
  };

  const handleDeleteSelected = () => {
    selectedProjectNames.forEach(name => handleDeleteProject(name));
    setSelectedProjectNames(new Set());
    setIsDeleteModalOpen(false);
    setDeleteMode(false);
  };

  const toggleProjectSelection = (projectName: string) => {
    setSelectedProjectNames(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) next.delete(projectName);
      else next.add(projectName);
      return next;
    });
  };

  const totalArea = plots.reduce((s, p) => s + (p.areaRai || 0), 0);

  const filteredPlots = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return plots;
    return plots.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.province ?? "").toLowerCase().includes(term) ||
      (p.ownerName ?? "").toLowerCase().includes(term)
    );
  }, [plots, searchTerm]);

  const projectGroups = useMemo(() => {
    const groups: { [key: string]: { projectName: string, plots: SavedPlot[], totalArea: number, totalCarbon: number, date: number } } = {};
    filteredPlots.forEach(p => {
      const pName = p.name || "ไม่มีชื่อโครงการ";
      if (!groups[pName]) {
        groups[pName] = { projectName: pName, plots: [], totalArea: 0, totalCarbon: 0, date: 0 };
      }
      groups[pName].plots.push(p);
      groups[pName].totalArea += (p.areaRai || 0);
      groups[pName].totalCarbon += (p.carbonTotal || 0);
      const d = new Date(p.date).getTime();
      if (d > groups[pName].date) groups[pName].date = d;
    });
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [filteredPlots]);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const toggleProject = (pName: string) => setExpandedProjects(prev => (prev[pName] ? {} : { [pName]: true }));

  const [estimatingProject, setEstimatingProject] = useState<string | null>(null);

  const handleInlineEstimate = async (projectName: string, projectPlots: SavedPlot[]) => {
    const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
    if (!user && !isGuest) return;
    setEstimatingProject(projectName);

    try {
      const polygons: PlantationPolygon[] = projectPlots.map((plot) => {
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
          selected_lu_classes: Object.entries(plot.luChecked || {})
            .filter(([_, on]) => on)
            .map(([cls]) => cls),
          project_type: (plot.plantStatus as "replanting" | "existing") || undefined,
        };
      });

      // Process polygons one by one to ensure the backend processes all of them correctly
      const responsePromises = polygons.map(polygon => estimateCarbon([polygon]));
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

        const ep = resp.estimated_parameters;

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
        const co2Now = rawProfile[0]?.stocks?.value ?? 0;
        const carbonProfile = rawProfile.length > 0 ? profileToBarPoints(rawProfile, age) : [];

        const updatedPlot: SavedPlot = {
          ...plot,
          processed: true,
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
      setPlots(prev => prev.map(p => {
        const up = updatedPlots.find(u => u.id === p.id);
        return up ? up : p;
      }));

      // Expand project to show graphs
      setExpandedProjects(prev => ({ ...prev, [projectName]: true }));

      // Save to backend using PATCH if dbProjectId is available
      const dbProjectId = projectPlots[0]?.dbProjectId;
      if (dbProjectId) {
        const allPlotsForProject = plots.map(p => {
          const up = updatedPlots.find(u => u.id === p.id);
          return up ? up : p;
        }).filter(p => p.dbProjectId === dbProjectId);

        const plantationInfo: Record<string, any> = {};
        allPlotsForProject.forEach(plot => {
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
            frontendPlots: allPlotsForProject,
            polygonsPayload: polygons,
            backendResponses: responses,
            plantationInfo: plantationInfo
          }),
        });
      }

    } catch (err) {
      setErrorModalMsg("เกิดข้อผิดพลาดในการประมวลผลคาร์บอนเครดิต");
    } finally {
      setEstimatingProject(null);
    }
  };

  const [editingPlot, setEditingPlot] = useState<{ plot: SavedPlot; index: number } | null>(null);

  const handleUpdatePlot = (updated: SavedPlot) => {
    const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
    if (!user && !isGuest) return;

    const newPlots = plots.map(p => p.id === updated.id ? updated : p);
    setPlots(newPlots);

    const dbProjectId = updated.dbProjectId;
    if (dbProjectId) {
      const allPlotsForProject = newPlots.filter(p => p.dbProjectId === dbProjectId);

      const plantationInfo: Record<string, any> = {};
      allPlotsForProject.forEach(plot => {
        plantationInfo[plot.id] = {
          polygon_id: plot.id,
          province_code: plot.province || "UNK",
          geometry: plot.geojson || plot.boundaryGeojson || null,
          form: plot.backendData?.form || {},
          lu_polygon: plot.backendData?.lu_polygon || []
        };
      });

      const polygonsPayload = allPlotsForProject.map((plot) => {
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
            combinedGeom = allRings.length === 1 ? { type: "Polygon", coordinates: allRings[0] } : { type: "MultiPolygon", coordinates: allRings };
          }
        }
        const userYearBE = plot.backendData?.form?.plantYear ? parseInt(plot.backendData.form.plantYear) : 0;
        return {
          id: plot.id,
          geometry: combinedGeom,
          year_of_planting: userYearBE > 0 ? userYearBE - 543 : null,
          rubber_clone: plot.backendData?.form?.variety || null,
          tree_count: plot.backendData?.form?.treeCount ? parseInt(plot.backendData.form.treeCount) : null,
          spacing_system: plot.backendData?.form?.spacing || null,
          selected_lu_classes: Object.entries(plot.luChecked || {}).filter(([_, on]) => on).map(([cls]) => cls),
          project_type: (plot.plantStatus as "replanting" | "existing") || undefined,
        };
      });

      fetch(`/api/plots/${dbProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontendPlots: allPlotsForProject,
          plantationInfo: plantationInfo,
          polygonsPayload: polygonsPayload
        })
      }).catch(console.error);
    }
    setEditingPlot(null);
  };

  if (!ready || !mounted)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fdfb" }}>
        <div className="spinner-border" style={{ color: "#1e7a47", width: "3rem", height: "3rem" }} role="status" />
      </div>
    );

  const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
  if (!user && !isGuest) {
    // If not logged in and no guest data, still show the empty UI or redirect
    // We'll show empty UI for them to see "start new project"
  }

  return (
    <div className="kc-tw min-h-screen bg-muted/30 pt-[108px] pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="m-0 mb-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {viewMode === "all" ? "การจัดการแปลงทั้งหมด" : "แปลงของฉัน"}
            </h1>
            <p className="m-0 text-sm text-muted-foreground">
              {viewMode === "all"
                ? "ตรวจสอบและจัดการข้อมูลแปลงของผู้ใช้งานทุกคนในระบบ"
                : "จัดการข้อมูลแปลงและผลประเมินคาร์บอนเครดิต"}
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="/map-draw" />}
            className="h-11 shrink-0 rounded-xl px-6 text-sm font-semibold no-underline"
          >
            <Plus className="size-4" aria-hidden="true" /> เริ่มโครงการใหม่
          </Button>
        </div>

        {/* Toolbar: search + admin scope + stats */}
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm md:flex-row md:items-center">
          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              placeholder="ค้นหาแปลง ชื่อโครงการ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground">
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Admin scope toggle */}
          {isAdmin && (
            <div className="flex w-full shrink-0 rounded-lg border border-border bg-muted p-1 md:w-auto">
              <button
                onClick={() => setViewMode("mine")}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 px-3.5 py-1.5 text-sm font-semibold transition-colors md:flex-initial ${viewMode === "mine" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <User className="size-3.5" aria-hidden="true" /> {isMobile ? "ของฉัน" : "เฉพาะของฉัน"}
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 px-3.5 py-1.5 text-sm font-semibold transition-colors md:flex-initial ${viewMode === "all" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Users className="size-3.5" aria-hidden="true" /> {isMobile ? "ทั้งหมด" : "ดูทั้งหมด"}
              </button>
            </div>
          )}

          {/* Inline stats */}
          {plots.length > 0 && (
            <div className="hidden shrink-0 items-center divide-x divide-border md:flex">
              {([
                { label: "โครงการ", val: new Set(plots.map(p => p.name || "ไม่มีชื่อโครงการ")).size.toLocaleString("th-TH") },
                { label: "แปลง", val: plots.length.toLocaleString("th-TH") },
                { label: "ไร่", val: totalArea.toFixed(2) },
              ]).map(({ label, val }) => (
                <div key={label} className="flex items-baseline gap-1.5 px-4">
                  <span className="text-lg font-bold text-primary">{val}</span>
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mobile stats strip */}
        {plots.length > 0 && (
          <div className="mb-6 grid grid-cols-3 gap-2 md:hidden">
            {([
              { label: "โครงการ", val: new Set(plots.map(p => p.name || "ไม่มีชื่อโครงการ")).size.toLocaleString("th-TH") },
              { label: "แปลง", val: plots.length.toLocaleString("th-TH") },
              { label: "ไร่", val: totalArea.toFixed(2) },
            ]).map(({ label, val }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-2.5 text-center">
                <div className="text-lg font-bold leading-tight text-primary">{val}</div>
                <div className="text-xs font-medium text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="m-0 min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-foreground">
              {viewMode === "all" ? (isMobile ? "แปลงทั้งหมด" : "รายการแปลงทั้งหมด") : (isMobile ? "แปลงที่บันทึก" : "รายการแปลงที่บันทึกแล้ว")}
              {searchTerm && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  พบ {filteredPlots.length}
                </span>
              )}
            </h2>
            <div className="flex shrink-0 items-center gap-2">

              {plots.length > 0 && (
                <div className="flex items-center gap-2">
                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
                      title="ลบโครงการ"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {!isMobile && "ลบโครงการ"}
                    </button>
                  ) : (
                    <>
                      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
                        <span className={`flex size-[18px] items-center justify-center rounded border-2 transition-colors ${selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "border-destructive bg-destructive" : "border-muted-foreground/40 bg-card"}`}>
                          {selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 && <Check className="size-3 text-white" aria-hidden="true" />}
                        </span>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedProjectNames.size === projectGroups.length && projectGroups.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectNames(new Set(projectGroups.map(g => g.projectName)));
                            } else {
                              setSelectedProjectNames(new Set());
                            }
                          }}
                        />
                        <span className={`text-sm font-semibold ${selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>เลือกทั้งหมด</span>
                      </label>

                      <button
                        onClick={() => {
                          setDeleteMode(false);
                          setSelectedProjectNames(new Set());
                        }}
                        className="flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        ยกเลิก
                      </button>

                      <button
                        onClick={() => setIsDeleteModalOpen(true)}
                        disabled={selectedProjectNames.size === 0}
                        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${selectedProjectNames.size > 0 ? "cursor-pointer border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15" : "cursor-not-allowed border-transparent bg-muted text-muted-foreground/60"}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        {!isMobile && <span>ยืนยัน {selectedProjectNames.size > 0 && `(${selectedProjectNames.size})`}</span>}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {filteredPlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-3 size-8 opacity-50" aria-hidden="true" />
              ไม่พบแปลงที่ตรงกับ &ldquo;<strong className="text-foreground">{searchTerm}</strong>&rdquo;
              <div>
                <button onClick={() => setSearchTerm("")} className="mt-3 cursor-pointer rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10">
                  ล้างการค้นหา
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {editingPlot && <EditPlotModal plot={editingPlot.plot} index={editingPlot.index} onClose={() => setEditingPlot(null)} onSave={handleUpdatePlot} isMobile={isMobile} />}
              {projectGroups.map((group, gIdx) => (
                <div key={`${group.projectName}-${gIdx}`} className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  {/* Project Header — whole row toggles expand */}
                  <div
                    onClick={() => (deleteMode ? toggleProjectSelection(group.projectName) : toggleProject(group.projectName))}
                    className={`flex cursor-pointer select-none flex-col justify-between gap-3 p-4 transition-colors md:flex-row md:items-center md:px-6 md:py-5 ${selectedProjectNames.has(group.projectName) ? "bg-destructive/5" : "bg-card hover:bg-muted/40"}`}
                  >
                    <div>
                      <div className="mb-1.5 flex items-center gap-2.5">
                        {deleteMode && (
                          <span
                            onClick={(e) => { e.stopPropagation(); toggleProjectSelection(group.projectName); }}
                            className={`flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors ${selectedProjectNames.has(group.projectName) ? "border-destructive bg-destructive" : "border-muted-foreground/40 bg-card"}`}
                          >
                            {selectedProjectNames.has(group.projectName) && <Check className="size-3.5 text-white" aria-hidden="true" />}
                          </span>
                        )}
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
                          {gIdx + 1}
                        </span>
                        <h3 className="m-0 text-lg font-bold tracking-tight text-foreground md:text-xl">
                          {group.projectName !== "ไม่มีชื่อโครงการ" ? (
                            <>
                              <span className="mr-1.5 text-base font-medium text-muted-foreground">โครงการ</span>
                              {group.projectName}
                            </>
                          ) : (
                            <span className="text-muted-foreground">ไม่มีชื่อโครงการ</span>
                          )}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><MapIcon className="size-3.5 text-primary" aria-hidden="true" /> {group.plots.length} แปลง</span>
                        <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5 text-primary" aria-hidden="true" /> {group.totalArea.toFixed(2)} ไร่</span>
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleInlineEstimate(group.projectName, group.plots); }}
                        disabled={estimatingProject === group.projectName}
                        className={`flex h-10 flex-[1_1_100%] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-0 px-4 text-sm font-semibold transition-colors md:flex-initial ${estimatingProject === group.projectName ? "cursor-not-allowed bg-muted text-muted-foreground" : "cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"}`}
                      >
                        {estimatingProject === group.projectName ? (
                          <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังประมวลผล...</>
                        ) : (
                          <><Sparkles className="size-4" aria-hidden="true" /> ประเมินคาร์บอนเครดิต</>
                        )}
                      </button>
                      <Link href={`/map-draw?project=${encodeURIComponent(group.projectName)}`} onClick={(e) => e.stopPropagation()} className="flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary no-underline transition-colors hover:bg-primary/10 md:flex-initial">
                        <Plus className="size-4" aria-hidden="true" /> เพิ่มแปลง
                      </Link>
                      <button onClick={(e) => { e.stopPropagation(); toggleProject(group.projectName); }} className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 md:flex-initial">
                        {expandedProjects[group.projectName] ? "ซ่อนแปลง" : "ดูแปลงทั้งหมด"}
                        {expandedProjects[group.projectName] ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  {/* Project Plots */}
                  <Accordion open={!!expandedProjects[group.projectName]}>
                  {(() => {
                    const profilesWithData = group.plots.filter(p => p.carbonProfile && p.carbonProfile.length > 0);
                    const groupMinEndYearBE = profilesWithData.length > 0
                      ? Math.min(...profilesWithData.map(p => p.carbonProfile![p.carbonProfile!.length - 1].yearBE))
                      : 0;
                    return (
                      <div className="border-t border-border/60 bg-muted/30 p-4 md:p-6">
                        <div className="flex flex-col gap-4">
                          <ProjectCarbonSummary plots={group.plots} isMobile={isMobile} />
                          {group.plots.map((plot, i) => (
                            <PlotCard
                              key={`${plot.id}-${i}`}
                              plot={plot}
                              index={i + 1}
                              onDelete={() => handleDelete(plot.id)}
                              onDeleteClick={(p, idx) => setPlotToDelete({ plot: p, index: idx })}
                              onEdit={(p, idx) => setEditingPlot({ plot: p, index: idx })}
                              expanded={expandedPlotId === plot.id}
                              onToggle={() => setExpandedPlotId(prev => prev === plot.id ? null : plot.id)}
                              isMobile={isMobile}
                              maxYearBE={groupMinEndYearBE > 0 ? groupMinEndYearBE : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  </Accordion>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Delete Multiple Projects Confirmation Modal */}
      {isDeleteModalOpen && selectedProjectNames.size > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s" }}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 450, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.2)", animation: "scaleUp 0.2s", display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                <i className="bi bi-exclamation-triangle" style={{ fontSize: 20 }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                  ยืนยันการลบ?
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                  การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f1f5f9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", cursor: "pointer" }}>
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 15, color: "#475569" }}>
                  กำลังจะลบ <strong style={{ color: "#ef4444" }}>{selectedProjectNames.size}</strong> โครงการ:
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 16px", maxHeight: 150, overflowY: "auto", border: "1px solid #e6f0ea", textAlign: "left" }}>
                  {Array.from(selectedProjectNames).map(name => (
                    <div key={name} style={{ fontSize: 14, color: "#1e293b", fontWeight: 600, padding: "4px 0", borderBottom: "1px dashed #e6f0ea" }}>
                      • {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setIsDeleteModalOpen(false)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#e6f0ea", color: "#475569", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#cbd5e1"} onMouseLeave={e => e.currentTarget.style.background = "#e6f0ea"}>
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteSelected}
                style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="bi bi-trash3-fill" /> ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Plot Delete Confirmation Modal */}
      {plotToDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s" }}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.2)", animation: "scaleUp 0.2s", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", marginBottom: 16 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 28 }} />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                ยืนยันการลบแปลงที่ {plotToDelete.index}?
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setPlotToDelete(null)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#e6f0ea", color: "#475569", fontWeight: 700, fontSize: 15, cursor: "pointer", flex: 1, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#cbd5e1"} onMouseLeave={e => e.currentTarget.style.background = "#e6f0ea"}>
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  handleDelete(plotToDelete.plot.id);
                  setPlotToDelete(null);
                }}
                style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 }}
              >
                <i className="bi bi-trash3-fill" /> ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

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
