"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { profileToBarPoints } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import { estimateCarbon, type PlantationPolygon } from "@/lib/carbon-api";
import type { SavedPlot } from "./types";
import { EditPlotModal } from "./EditPlotModal";
import { PlotCard } from "./PlotCard";
import { ProjectCarbonSummary } from "./ProjectCarbonSummary";

const HERO_BG =
  "radial-gradient(1000px 400px at -5% -5%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0) 60%)," +
  "radial-gradient(800px 400px at 105% 0%, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 58%)," +
  "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)";

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
        <div className="spinner-border" style={{ color: "#10b981", width: "3rem", height: "3rem" }} role="status" />
      </div>
    );

  const isGuest = !user && typeof window !== "undefined" && !!localStorage.getItem("guest_user_id");
  if (!user && !isGuest) {
    // If not logged in and no guest data, still show the empty UI or redirect
    // We'll show empty UI for them to see "start new project"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4fcf8", paddingTop: 140, paddingBottom: "60px", fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>
      <div className="container" style={{ maxWidth: "1100px" }}>

        {/* Hero */}
        <div style={{
          background: HERO_BG, borderRadius: isMobile ? 18 : 20, padding: isMobile ? "20px 18px" : "28px 40px", marginBottom: 20,
          border: "1px solid rgba(16,185,129,0.15)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -50, left: -50, width: isMobile ? 150 : 200, height: isMobile ? 150 : 200, background: "rgba(16,185,129,0.2)", filter: "blur(60px)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -50, right: -50, width: isMobile ? 200 : 250, height: isMobile ? 200 : 250, background: "rgba(13,148,136,0.15)", filter: "blur(70px)", borderRadius: "50%", pointerEvents: "none" }} />

          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 20 }}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", background: "rgba(16,185,129,0.1)", color: "#059669", borderRadius: 50, fontSize: 13, fontWeight: 700, border: "1px solid rgba(16,185,129,0.2)" }}>
                  <i className="bi bi-folder-fill" /> {viewMode === "all" ? "ข้อมูลทั้งหมดในระบบ" : "ข้อมูลของฉัน"}
                </div>
              </div>
              <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "#064e3b", marginBottom: 8, lineHeight: 1.2 }}>
                {viewMode === "all" ? "การจัดการแปลงทั้งหมด" : "แปลงของฉัน"}
              </h1>
              <p style={{ fontSize: isMobile ? 15 : 17, color: "#475569", margin: "0 0 18px", lineHeight: 1.6 }}>
                {viewMode === "all"
                  ? "ตรวจสอบและจัดการข้อมูลแปลงของผู้ใช้งานทุกคนในระบบ"
                  : "จัดการข้อมูลแปลงและผลประเมินคาร์บอนเครดิต"}
              </p>
              {/* Search */}
              <div style={{ position: "relative", maxWidth: isMobile ? "100%" : 440 }}>
                <i className="bi bi-search" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: searchFocused ? "#059669" : "#94a3b8", fontSize: 15, pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="ค้นหาแปลง ชื่อโครงการ..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{
                    width: "100%", padding: "11px 38px 11px 40px",
                    borderRadius: 13, fontSize: 15, color: "#0f172a",
                    border: `2px solid ${searchFocused ? "#10b981" : "rgba(16,185,129,0.25)"}`,
                    background: "rgba(255,255,255,0.95)", outline: "none",
                    boxShadow: searchFocused ? "0 0 0 4px rgba(16,185,129,0.1)" : "0 2px 10px rgba(0,0,0,0.04)",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 17, padding: 2, lineHeight: 1 }}>
                    <i className="bi bi-x-circle-fill" />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", gap: isMobile ? 12 : 16, width: isMobile ? "100%" : "auto" }}>
              {isAdmin && (
                <div style={{
                  background: "rgba(255,255,255,0.9)",
                  padding: 4,
                  borderRadius: isMobile ? 12 : 14,
                  display: "flex",
                  gap: isMobile ? 3 : 4,
                  border: "1px solid rgba(16,185,129,0.15)",
                  width: isMobile ? "100%" : "auto",
                  boxShadow: isMobile ? "none" : "0 4px 15px rgba(0,0,0,0.05)"
                }}>
                  <button
                    onClick={() => setViewMode("mine")}
                    style={{
                      flex: isMobile ? 1 : "initial",
                      padding: isMobile ? "7px 12px" : "8px 16px",
                      borderRadius: isMobile ? 9 : 10,
                      border: "none",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: viewMode === "mine" ? "#10b981" : "transparent",
                      color: viewMode === "mine" ? "#fff" : "#64748b",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap"
                    }}
                  >
                    <i className="bi bi-person-circle" /> {isMobile ? "ของฉัน" : "เฉพาะของฉัน"}
                  </button>
                  <button
                    onClick={() => setViewMode("all")}
                    style={{
                      flex: isMobile ? 1 : "initial",
                      padding: isMobile ? "7px 12px" : "8px 16px",
                      borderRadius: isMobile ? 9 : 10,
                      border: "none",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: viewMode === "all" ? "#0f172a" : "transparent",
                      color: viewMode === "all" ? "#fff" : "#64748b",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      whiteSpace: "nowrap"
                    }}
                  >
                    <i className="bi bi-people-fill" /> {isMobile ? "ทั้งหมด" : "ดูทั้งหมด"}
                  </button>
                </div>
              )}
              <a
                href="/map-draw"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 8 : 10, background: "linear-gradient(135deg,#10b981 0%,#059669 100%)", color: "#fff", padding: isMobile ? "12px 24px" : "14px 28px", borderRadius: isMobile ? 12 : 14, fontWeight: 700, fontSize: isMobile ? 15 : 17, textDecoration: "none", boxShadow: isMobile ? "0 6px 15px rgba(16,185,129,0.25)" : "0 10px 25px rgba(16,185,129,0.3)",
                  width: isMobile ? "100%" : "auto",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease"
                }}
              >
                <i className="bi bi-plus-circle" style={{ fontSize: isMobile ? 16 : 18 }} /> เริ่มโครงการใหม่
              </a>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {plots.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fit, minmax(190px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: 24 }}>
            {([
              { label: "โครงการทั้งหมด", val: new Set(plots.map(p => p.name || "ไม่มีชื่อโครงการ")).size.toLocaleString("th-TH"), unit: "โครงการ", icon: "bi-folder-fill", color: "#10b981", bg: "rgba(16,185,129,0.10)" },
              { label: "แปลงทั้งหมด", val: plots.length.toLocaleString("th-TH"), unit: "แปลง", icon: "bi-map-fill", color: "#059669", bg: "rgba(5,150,105,0.10)" },
              { label: "พื้นที่รวม", val: totalArea.toFixed(2), unit: "ไร่", icon: "bi-grid-fill", color: "#047857", bg: "rgba(4,120,87,0.10)" },
            ] as { label: string; val: string; unit: string; icon: string; color: string; bg: string }[]).map(({ label, val, unit, icon, color, bg }) => (
              <div key={label} style={{ background: "#fff", borderRadius: isMobile ? 12 : 14, padding: isMobile ? "8px 9px" : "12px 14px", border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 3 : 4 }}>
                  <span style={{ fontSize: isMobile ? 11 : 13, color: "#64748b", lineHeight: 1.3 }}>{label}</span>
                  <div style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, borderRadius: 5, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <i className={`bi ${icon}`} style={{ color, fontSize: isMobile ? 10 : 12 }} />
                  </div>
                </div>
                <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 800, color, lineHeight: 1.2 }}>{val} <span style={{ fontSize: isMobile ? 10 : 12, color: "#94a3b8", fontWeight: 400 }}>{unit}</span></div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 2px", gap: 10 }}>
            <h2 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: "#064e3b", margin: 0, whiteSpace: "nowrap", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {viewMode === "all" ? (isMobile ? "แปลงทั้งหมด" : "รายการแปลงทั้งหมด") : (isMobile ? "แปลงที่บันทึก" : "รายการแปลงที่บันทึกแล้ว")}
              {searchTerm && (
                <span style={{ fontSize: isMobile ? 13 : 15, fontWeight: 400, color: "#64748b", marginLeft: isMobile ? 4 : 8 }}>
                  พบ {filteredPlots.length}
                </span>
              )}
            </h2>
            <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center", flexShrink: 0 }}>

              {plots.length > 0 && (
                <div style={{ position: "relative", display: "flex", gap: 12, alignItems: "center" }}>
                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      style={{ width: 38, height: 38, padding: 0, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
                      title="ลบโครงการ"
                    >
                      <i className="bi bi-trash3-fill" />
                    </button>
                  ) : (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 12px", background: selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "rgba(239,68,68,0.05)" : "#fff", borderRadius: 10, border: selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "1px solid rgba(239,68,68,0.2)" : "1px solid #e2e8f0", transition: "all 0.2s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "2px solid #ef4444" : "2px solid #cbd5e1", background: selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "#ef4444" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                          {selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 && <i className="bi bi-check" style={{ color: "#fff", fontSize: 14, fontWeight: 900 }} />}
                        </div>
                        <input
                          type="checkbox"
                          style={{ display: "none" }}
                          checked={selectedProjectNames.size === projectGroups.length && projectGroups.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectNames(new Set(projectGroups.map(g => g.projectName)));
                            } else {
                              setSelectedProjectNames(new Set());
                            }
                          }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: selectedProjectNames.size === projectGroups.length && projectGroups.length > 0 ? "#ef4444" : "#64748b" }}>เลือกทั้งหมด</span>
                      </label>

                      <button
                        onClick={() => {
                          setDeleteMode(false);
                          setSelectedProjectNames(new Set());
                        }}
                        style={{ padding: isMobile ? "6px 10px" : "8px 12px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s" }}
                      >
                        {!isMobile && <span>ยกเลิก</span>}
                      </button>

                      <button
                        onClick={() => setIsDeleteModalOpen(true)}
                        disabled={selectedProjectNames.size === 0}
                        style={{ padding: isMobile ? "6px 10px" : "8px 12px", background: selectedProjectNames.size > 0 ? "rgba(239,68,68,0.1)" : "#f1f5f9", color: selectedProjectNames.size > 0 ? "#ef4444" : "#94a3b8", border: selectedProjectNames.size > 0 ? "1px solid rgba(239,68,68,0.2)" : "1px solid transparent", borderRadius: 10, cursor: selectedProjectNames.size > 0 ? "pointer" : "not-allowed", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s" }}
                      >
                        <i className="bi bi-trash3-fill" style={{ fontSize: 14 }} />
                        {!isMobile && <span>ยืนยัน {selectedProjectNames.size > 0 && `(${selectedProjectNames.size})`}</span>}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {filteredPlots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px", background: "#fff", borderRadius: 20, color: "#94a3b8", fontSize: 14 }}>
              <i className="bi bi-search" style={{ fontSize: 32, display: "block", marginBottom: 8 }} />
              ไม่พบแปลงที่ตรงกับ &ldquo;<strong style={{ color: "#64748b" }}>{searchTerm}</strong>&rdquo;
              <br />
              <button onClick={() => setSearchTerm("")} style={{ marginTop: 12, padding: "5px 16px", background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ล้างการค้นหา
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 24 : 32 }}>
              {editingPlot && <EditPlotModal plot={editingPlot.plot} index={editingPlot.index} onClose={() => setEditingPlot(null)} onSave={handleUpdatePlot} isMobile={isMobile} />}
              {projectGroups.map((group, gIdx) => (
                <div key={`${group.projectName}-${gIdx}`} style={{ position: "relative", background: "#fff", borderRadius: 24, border: "1px solid rgba(16,185,129,0.2)", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}>
                  {/* Project Header */}
                  <div
                    style={{ padding: isMobile ? "14px 16px" : "16px 24px", background: selectedProjectNames.has(group.projectName) ? "linear-gradient(135deg,rgba(239,68,68,0.05),rgba(239,68,68,0.02))" : "linear-gradient(135deg,rgba(16,185,129,0.04),rgba(5,150,105,0.01))", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, transition: "background 0.2s" }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        {deleteMode && (
                          <div
                            onClick={() => toggleProjectSelection(group.projectName)}
                            style={{ width: 22, height: 22, borderRadius: 6, border: selectedProjectNames.has(group.projectName) ? "2px solid #ef4444" : "2px solid #cbd5e1", background: selectedProjectNames.has(group.projectName) ? "#ef4444" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", cursor: "pointer", animation: "fadeIn 0.2s" }}
                          >
                            {selectedProjectNames.has(group.projectName) && <i className="bi bi-check" style={{ color: "#fff", fontSize: 13, fontWeight: 900 }} />}
                          </div>
                        )}
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #10b981 0%, #047857 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, boxShadow: "0 2px 8px rgba(16,185,129,0.35)", flexShrink: 0 }}>
                          {gIdx + 1}
                        </div>
                        <h3 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: "#064e3b" }}>
                          {group.projectName !== "ไม่มีชื่อโครงการ" ? (
                            <>
                              <span style={{ color: "#64748b", fontWeight: 700, fontSize: isMobile ? 18 : 20, marginRight: 6 }}>โครงการ</span>
                              {group.projectName}
                            </>
                          ) : (
                            <span style={{ color: "#64748b" }}>ไม่มีชื่อโครงการ</span>
                          )}
                        </h3>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "#64748b", fontSize: 15, fontWeight: 500 }}>
                        <span><i className="bi bi-map-fill me-1" style={{ color: "#0ea5e9" }} /> {group.plots.length} แปลง</span>
                        <span><i className="bi bi-grid-fill me-1" style={{ color: "#10b981" }} /> {group.totalArea.toFixed(2)} ไร่</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: isMobile ? "100%" : "auto" }}>
                      <button
                        onClick={() => handleInlineEstimate(group.projectName, group.plots)}
                        disabled={estimatingProject === group.projectName}
                        style={{ flex: isMobile ? "1 1 100%" : "auto", textAlign: "center", padding: isMobile ? "10px 16px" : "8px 16px", borderRadius: 12, background: estimatingProject === group.projectName ? "#94a3b8" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)", color: "#fff", fontWeight: 700, fontSize: isMobile ? 15 : 14, textDecoration: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: estimatingProject === group.projectName ? "none" : "0 4px 15px rgba(14,165,233,0.3)", whiteSpace: "nowrap", cursor: estimatingProject === group.projectName ? "not-allowed" : "pointer" }}
                      >
                        {estimatingProject === group.projectName ? (
                          <><i className="spinner-border spinner-border-sm" /> กำลังประมวลผล...</>
                        ) : (
                          <><i className="bi bi-magic" /> ประเมินคาร์บอนเครดิต</>
                        )}
                      </button>
                      <Link href={`/map-draw?project=${encodeURIComponent(group.projectName)}`} style={{ flex: isMobile ? 1 : "auto", textAlign: "center", padding: "8px 16px", borderRadius: 12, background: "rgba(16,185,129,0.1)", color: "#059669", fontWeight: 700, fontSize: 15, textDecoration: "none", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        <i className="bi bi-plus-lg" /> เพิ่มแปลง
                      </Link>
                      <button onClick={() => toggleProject(group.projectName)} style={{ flex: isMobile ? 1 : "auto", padding: "8px 16px", borderRadius: 12, background: expandedProjects[group.projectName] ? "rgba(0,0,0,0.05)" : "#0f172a", color: expandedProjects[group.projectName] ? "#475569" : "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {expandedProjects[group.projectName] ? "ซ่อนแปลง" : "ดูแปลงทั้งหมด"} <i className={`bi bi-chevron-${expandedProjects[group.projectName] ? "up" : "down"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Project Plots */}
                  {expandedProjects[group.projectName] && (() => {
                    const profilesWithData = group.plots.filter(p => p.carbonProfile && p.carbonProfile.length > 0);
                    const groupMinEndYearBE = profilesWithData.length > 0
                      ? Math.min(...profilesWithData.map(p => p.carbonProfile![p.carbonProfile!.length - 1].yearBE))
                      : 0;
                    return (
                      <div style={{ padding: isMobile ? "16px" : "24px", background: "#f8fafc", borderTop: "1px solid rgba(16,185,129,0.1)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 16px", maxHeight: 150, overflowY: "auto", border: "1px solid #e2e8f0", textAlign: "left" }}>
                  {Array.from(selectedProjectNames).map(name => (
                    <div key={name} style={{ fontSize: 14, color: "#1e293b", fontWeight: 600, padding: "4px 0", borderBottom: "1px dashed #e2e8f0" }}>
                      • {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setIsDeleteModalOpen(false)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#cbd5e1"} onMouseLeave={e => e.currentTarget.style.background = "#e2e8f0"}>
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
              <button onClick={() => setPlotToDelete(null)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: 15, cursor: "pointer", flex: 1, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#cbd5e1"} onMouseLeave={e => e.currentTarget.style.background = "#e2e8f0"}>
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
