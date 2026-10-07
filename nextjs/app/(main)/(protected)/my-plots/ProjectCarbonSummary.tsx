"use client";

import { useMemo, useState } from "react";
import { CarbonBarChart, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import type { SavedPlot } from "./types";
import styles from "./ProjectCarbonSummary.module.css";
import { Accordion } from "./Accordion";
import { plotDisplayArea } from "./plotArea";
import { PendingNotice } from "./PendingNotice";

export function ProjectCarbonSummary({ plots, isMobile, open, onToggle }: {
  plots: SavedPlot[];
  isMobile: boolean;
  /** Controlled mode: when set, the parent owns the open state (accordion groups). */
  open?: boolean;
  onToggle?: () => void;
}) {
  const currentYearBE = new Date().getFullYear() + 543;
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = open ?? localExpanded;

  const { combinedPts, totalNow, ciNow, initialMaxYearBE } = useMemo(() => {
    let fallbackTotal = 0;
    let fallbackLinearCi = 0;

    const allPtsArrays: BarPoint[][] = [];
    for (const plot of plots) {
      const isProcessed = plot.processed === true || (plot.carbonProfile && plot.carbonProfile.length > 0) || (plot.carbonTotal > 0);
      if (!isProcessed) continue;

      const plantYearBE = plot.plantYearBE && plot.plantYearBE > 0
        ? plot.plantYearBE : (currentYearBE - (plot.rubberAge || 0));
      const effectiveAge = plot.rubberAge > 0 ? plot.rubberAge : (plantYearBE > 0 ? currentYearBE - plantYearBE : 0);
      const chartStartYearBE = plantYearBE > 0 ? plantYearBE + effectiveAge : currentYearBE;

      if (plot.carbonProfile && plot.carbonProfile.length > 0) {
        allPtsArrays.push(plot.carbonProfile);
      } else {
        if (plot.carbonTotal > 0) fallbackTotal += Math.floor(plot.carbonTotal);
        const approxCi = (plot.carbonTotal || 0) * 0.05;
        fallbackLinearCi += Math.floor(approxCi * 10) / 10;
      }
    }

    if (allPtsArrays.length === 0) {
      return { combinedPts: [], totalNow: fallbackTotal, ciNow: fallbackLinearCi, initialMaxYearBE: undefined };
    }

    // Sum by calendar year (พ.ศ.) over the union of every plot's years: a plot
    // adds to the years its own profile covers (planting .. age 35) and nothing
    // before it was planted. year_at is re-derived from the current year since
    // each plot's stored year_at is relative to when it was assessed.
    const minYearBE = Math.min(...allPtsArrays.map(pts => Math.min(...pts.map(p => p.yearBE))));
    const maxYearBE = Math.max(...allPtsArrays.map(pts => Math.max(...pts.map(p => p.yearBE))));
    const yearsBE: number[] = [];
    for (let y = minYearBE; y <= maxYearBE; y++) yearsBE.push(y);

    const age28Years = allPtsArrays.map(pts => {
      const item28 = pts.find(p => p.age === 28 && p.isAgeValid);
      return item28 ? item28.yearBE : pts[pts.length - 1].yearBE;
    });
    const initialMaxYearBE = age28Years.length > 0 ? Math.min(...age28Years) : undefined;

    const sumMap = new Map<number, { co2: number; sumLinearCi: number; totalValidAge: number; validAgeCount: number; fallbackAgeAccum: number; fallbackCount: number; gainValue: number; gainCi: number; }>();
    for (const yearBE of yearsBE) {
      sumMap.set(yearBE, { co2: 0, sumLinearCi: 0, totalValidAge: 0, validAgeCount: 0, fallbackAgeAccum: 0, fallbackCount: 0, gainValue: 0, gainCi: 0 });
    }

    for (const pts of allPtsArrays) {
      for (const p of pts) {
        const e = sumMap.get(p.yearBE);
        if (!e) continue;
        e.co2 += Math.floor(p.co2 || 0);
        e.sumLinearCi = Math.round((e.sumLinearCi + Math.floor((p.ci || 0) * 10) / 10) * 10) / 10;
        e.gainValue += Math.floor(p.gainValue || 0);
        e.gainCi = Math.round((e.gainCi + Math.floor((p.gainCi || 0) * 10) / 10) * 10) / 10;
        if (p.isAgeValid) { e.totalValidAge += p.age; e.validAgeCount += 1; }
        else { e.fallbackAgeAccum += p.age; e.fallbackCount += 1; }
      }
    }

    const combinedPts: BarPoint[] = yearsBE.map((yearBE) => {
      const d = sumMap.get(yearBE)!;
      const yearAt = yearBE - currentYearBE;
      const avgAge = d.validAgeCount > 0 ? Math.round(d.totalValidAge / d.validAgeCount) : Math.round(d.fallbackAgeAccum / (d.fallbackCount || 1));
      return {
        age: avgAge, yearBE, year_at: yearAt,
        co2: d.co2, ci: d.sumLinearCi,
        gainValue: d.gainValue,
        gainCi: d.gainCi,
        cycle: Math.floor(yearAt / 7), cycleAge: avgAge, errorMargin: d.sumLinearCi,
        isAgeValid: d.validAgeCount > 0
      };
    });

    const currentPt = combinedPts.find(p => p.year_at === 0) ?? (combinedPts.length > 0 ? combinedPts[0] : null);
    return {
      combinedPts,
      totalNow: (currentPt?.co2 ?? 0) + fallbackTotal,
      ciNow: currentPt ? currentPt.ci : fallbackLinearCi,
      initialMaxYearBE,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots]);

  const processedCount = plots.filter(p =>
    p.processed === true || (p.carbonProfile && p.carbonProfile.length > 0) || p.carbonTotal > 0
  ).length;
  const totalAreaRai = plots.reduce((s, p) => s + plotDisplayArea(p).rai, 0);
  const totalTrees = plots.reduce((s, p) => s + (p.trees || 0), 0);
  const cyclePts = combinedPts.filter(pt => pt.year_at > 0 && pt.year_at % 7 === 0);

  // Totals must cover the whole project: until every plot is processed the
  // block shows only a notice (same rule as the simulation sections).
  const unprocessedCount = plots.length - processedCount;

  if (unprocessedCount === 0 && combinedPts.length === 0 && totalNow === 0) return null;

  const StatCard = ({ icon, iconColor, label, value, unit, valueColor, fullSpan = false }: { icon: string; iconColor: string; label: string; value: React.ReactNode; unit?: string; valueColor: string; fullSpan?: boolean }) => (
    <div className={`${styles.statCard} ${isMobile ? styles.statCardMobile : ""} ${fullSpan ? styles.statCardFullSpan : ""}`}>
      <div className={styles.statCardLabel}>
        <i className={`bi ${icon} ${styles.statCardLabelIcon}`} style={{ color: iconColor }} /> {label}
      </div>
      <div className={styles.statCardValueRow}>
        <div className={`${styles.statCardValue} ${isMobile ? styles.statCardValueMobile : ""}`} style={{ color: valueColor }}>{value}</div>
        {unit && <span className={styles.statCardUnit}>{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div
        className={`${styles.header} ${isMobile ? styles.headerMobile : ""} ${isExpanded ? styles.headerExpanded : styles.headerCollapsed}`}
      >
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <i className="bi bi-bar-chart-fill" />
          </div>
          <div>
            <div className={`${styles.headerTitle} ${isMobile ? styles.headerTitleMobile : ""}`}>ปริมาณคาร์บอนรวม</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { if (open === undefined) setLocalExpanded(!localExpanded); onToggle?.(); }}
          className={`${styles.headerToggle} ${isExpanded ? styles.headerToggleExpanded : styles.headerToggleCollapsed}`}
        >
          ดูข้อมูล
          <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} />
        </button>
      </div>

      {/* Expandable Content */}
      <Accordion open={isExpanded}>
        {unprocessedCount > 0 ? (
          <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }}>
            <PendingNotice
              title={unprocessedCount < plots.length
                ? `มี ${unprocessedCount.toLocaleString("th-TH")} จาก ${plots.length.toLocaleString("th-TH")} แปลงที่ยังไม่ประมวลผล`
                : "ยังไม่ได้ประมวลผลคาร์บอน"}
              subtitle={<>กรุณากด &quot;ประเมินคาร์บอนกักเก็บ&quot; เพื่อประมวลผลข้อมูล</>} />
          </div>
        ) : (
          <div className={`${styles.content} ${isMobile ? styles.contentMobile : ""}`}>

            {/* Left: Chart Panel */}
            <div className={`${styles.chartPanel} ${isMobile ? styles.chartPanelMobile : ""}`}>
              {combinedPts.length > 0 ? (
                <CarbonBarChart pts={combinedPts} isMobile={isMobile} narrowMode={!isMobile} showAge={false} title="ปริมาณคาร์บอนสะสม (tCO₂eq/โครงการ)" initialMaxYearBE={initialMaxYearBE} baseline={{ value: totalNow, ci: ciNow }} />
              ) : (
                <div className={styles.emptyChart}>
                  <i className={`bi bi-bar-chart ${styles.emptyChartIcon}`} />
                  <div className={styles.emptyChartTitle}>ยังไม่มีข้อมูลกราฟ</div>
                  <div className={styles.emptyChartSubtitle}>ประมวลผลแปลงเพื่อดูแนวโน้มคาร์บอน</div>
                </div>
              )}
            </div>

            <div className={`${styles.statsPanel} ${isMobile ? styles.statsPanelMobile : ""}`}>
              {/* Premium subtle glow decoration */}
              <div className={styles.glowTopRight} />
              <div className={styles.glowBottomLeft} />
              {/* Processing data Header */}
              <div className={styles.processingHeader}>
                <i className="bi bi-layers-fill" />
                ข้อมูลที่ใช้ในการประมวลผล
              </div>

              {/* Top 3 Stats grid */}
              <div className={`${styles.statsGrid} ${isMobile ? styles.statsGridMobile : ""}`}>
                <StatCard icon="bi-check-circle-fill" iconColor="#1e7a47" label="ประมวลผลแล้ว" value={`${processedCount}/${plots.length}`} unit="แปลง" valueColor="#17603a" />
                <StatCard icon="bi-grid-fill" iconColor="#1e7a47" label="พื้นที่รวม" value={totalAreaRai.toFixed(1)} unit="ไร่" valueColor="#1e7a47" />
                {totalTrees > 0 && (
                  <StatCard icon="bi-tree-fill" iconColor="#1e7a47" label="จำนวนต้นรวม" value={totalTrees.toLocaleString("th-TH")} unit="ต้น" valueColor="#064e3b" fullSpan={isMobile} />
                )}
              </div>

              {/* Cycle years grid */}
              {cyclePts.length > 0 && (
                <div className={`${styles.cycleGrid} ${isMobile ? styles.cycleGridMobile : ""}`}>
                  {cyclePts.map((pt, idx) => {
                    const displayCycle = pt.year_at === 0 ? 0 : Math.floor((pt.year_at - 1) / 7);
                    const GREEN_THEME_COLORS = [
                      { top: "#bef264", bot: "#84cc16", label: "#3f6212" }, // Lime
                      { top: "#63b78c", bot: "#1e7a47", label: "#14532d" }, // Mint
                      { top: "#1e7a47", bot: "#1e7a47", label: "#064e3b" }, // Emerald
                      { top: "#1e7a47", bot: "#17603a", label: "#064e3b" }, // Forest
                      { top: "#1e7a47", bot: "#0f766e", label: "#134e4a" }, // Teal
                    ];
                    const col = GREEN_THEME_COLORS[Math.min(Math.max(0, displayCycle), GREEN_THEME_COLORS.length - 1)];

                    return (
                      <StatCard
                        key={pt.year_at}
                        icon="bi-graph-up-arrow"
                        iconColor={col.bot}
                        label={`ปีที่ ${pt.year_at} (พ.ศ. ${pt.yearBE})`}
                        value={
                          <div className={styles.cycleValueBlock}>
                            <div className={styles.cycleValueLabel}>คาร์บอนสะสม</div>
                            <div className={styles.cycleValueRow}>
                              <span className={`${styles.cycleValueMain} ${isMobile ? styles.cycleValueMainMobile : ""}`} style={{ color: col.bot }}>
                                {Math.floor(pt.gainValue).toLocaleString("th-TH")}
                              </span>
                              <span className={styles.cycleValueCi} style={{ color: col.bot }}>
                                ± {(Math.floor(pt.gainCi * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </span>
                              <span className={styles.cycleValueUnit}>tCO₂eq</span>
                            </div>
                          </div>
                        }
                        valueColor={col.bot}
                      />
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </Accordion>
    </div>
  );
}
