"use client";

import { useState } from "react";
import Link from "next/link";
import { CarbonBarChart, type BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";
import type { SavedPlot } from "./types";
import { PlotMiniMap } from "./PlotMiniMap";
import styles from "./PlotCard.module.css";
import { Accordion } from "./Accordion";

export function PlotCard({ plot, index, onDelete, onDeleteClick, onEdit, expanded, onToggle, isMobile, maxYearBE }: { plot: SavedPlot; index: number; onDelete: () => void; onDeleteClick?: (p: SavedPlot, i: number) => void; onEdit?: (p: SavedPlot, i: number) => void; expanded: boolean; onToggle: () => void; isMobile: boolean; maxYearBE?: number }) {
  const [activeTab, setActiveTab] = useState<"map" | "carbon">("map");
  const [expandYears, setExpandYears] = useState(false);
  const [expandNotes, setExpandNotes] = useState(false);

  // Determine if this plot has been carbon-processed
  // Compatible with old data: if `processed` flag is missing, infer from carbonProfile or carbonTotal
  const isProcessed = plot.processed === true || (plot.carbonProfile && plot.carbonProfile.length > 0) || (plot.carbonTotal > 0);

  const currentYearBE = new Date().getFullYear() + 543;
  const plantYearBE = plot.plantYearBE && plot.plantYearBE > 0
    ? plot.plantYearBE
    : (currentYearBE - (plot.rubberAge || 0));
  const effectiveAge = plot.rubberAge > 0 ? plot.rubberAge : (plantYearBE > 0 ? currentYearBE - plantYearBE : 0);
  const chartStartYearBE = plantYearBE > 0 ? plantYearBE + effectiveAge : currentYearBE;
  // Only compute chart data when the plot has been processed through carbon calculation
  const barPts: BarPoint[] = isProcessed
    ? ((plot.carbonProfile && plot.carbonProfile.length > 0)
      ? plot.carbonProfile
      : [])
    : [];
  const limitedBarPts = barPts;

  const plantStatusLabel = plot.plantStatus === "replanting" ? "เริ่มปลูกใหม่" : plot.plantStatus === "existing" ? "ปลูกมาแล้ว" : "—";

  const activeLu = Object.keys(plot.luChecked || {}).filter(k => plot.luChecked![k] && k !== 'A');
  let luVal = "—";
  if (activeLu.length > 0) {
    if (activeLu.includes("A302")) {
      luVal = "A302";
    } else {
      luVal = activeLu.join(", ");
    }
  }

  const backendData = plot.backendData || {};
  const form = backendData.form;
  const ep = backendData.ep;

  const userEnteredYear = !!form?.plantYear;
  const showPlotAge = !!form?.plantYear || (plot.carbonProfile?.some(p => p.isAgeValid) ?? false);
  const yearParam = ep?.year_of_planting;
  const rawNotes: string[] = yearParam?.notes ?? yearParam?.note ?? [];
  const yearNotes = rawNotes.slice(0, 5);

  let yearBoxItems: Array<{ label: string; pct: number, yearBE: number }> = [];
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

  const isVarietyFromUser = !!form?.variety;
  const isSpacingFromUser = !!form?.spacing;
  const isTreeCountFromUser = !!form?.treeCount;

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

  const infoItems = [
    { label: "พื้นที่ (ไร่)", val: plot.areaRai > 0 ? plot.areaRai.toFixed(2) : "", unit: "", icon: "bi-grid-fill" },
    { label: "สถานะแปลง", val: plantStatusLabel || "", unit: "", icon: "bi-info-circle" },
    { label: "ปีที่ปลูก", val: form?.plantYear ? String(form.plantYear) : "", unit: "", icon: "bi-calendar-event" },
    { label: "พันธุ์ยาง", val: isVarietyFromUser ? form.variety : "", unit: "", icon: "bi-tags" },
    { label: "ระยะปลูก (ม.)", val: isSpacingFromUser ? form.spacing : "", unit: "", icon: "bi-arrows-expand" },
    { label: "จำนวนต้น", val: isTreeCountFromUser && form?.treeCount ? parseInt(form.treeCount).toLocaleString("th-TH") : "", unit: "", icon: "bi-tree-fill" },
  ];

  return (
    <div className={styles.card}>
      {/* Left accent bar */}
      <div className={styles.accentBar} />

      {/* Header */}
      <div className={`${styles.header} ${isMobile ? styles.headerMobile : ""}`}>
        <div className={styles.headerLeft}>
          <div className={styles.indexBadge}>{index}</div>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <div className={styles.title}>
                แปลงที่ {index}
              </div>
              {isProcessed ? (
                <span className={`${styles.badge} ${styles.badgeProcessed}`}>
                  <i className="bi bi-check-circle-fill" style={{ fontSize: 9 }} />ประมวลผลแล้ว
                </span>
              ) : (
                <span className={`${styles.badge} ${styles.badgeUnprocessed}`}>
                  <i className="bi bi-clock" style={{ fontSize: 9 }} />ยังไม่ประมวลผล
                </span>
              )}
            </div>
            <div className={styles.dateRow}>
              <span className={styles.dateText}>
                {new Date(plot.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className={styles.actionsRow}>
          <Link
            href={`/map-draw?project=${encodeURIComponent(plot.name)}&action=calc&plotId=${plot.id}`}
            title="แก้ไขขอบเขตแปลง"
            className={`${styles.actionBtn} ${styles.actionBtnPin}`}
          >
            <i className="bi bi-pin-map" />
          </Link>
          <button
            onClick={() => onEdit?.(plot, index)}
            title="แก้ไข"
            className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
          >
            <i className="bi bi-pencil-square" />
          </button>
          <button
            onClick={() => onDeleteClick ? onDeleteClick(plot, index) : onDelete()}
            title="ลบ"
            className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
          >
            <i className="bi bi-trash3" />
          </button>
        </div>
      </div>

      {/* Info strip */}
      <div className={`${styles.infoStrip} ${isMobile ? styles.infoStripMobile : ""}`}>
        {infoItems.map(({ label, val, unit, icon }, i) => {
          const borderRight = isMobile ? (i % 2 === 0) : (i < 5);
          const borderBottom = isMobile && i < 4;
          return (
            <div
              key={label}
              className={`${styles.infoCell} ${isMobile ? styles.infoCellMobile : ""} ${borderRight ? styles.infoCellBorderRight : ""} ${borderBottom ? styles.infoCellBorderBottom : ""}`}
            >
              <div className={styles.infoIconRow}>
                <div className={styles.infoIconBox}>
                  <i className={`bi ${icon} ${styles.infoIcon}`} />
                </div>
                <span className={styles.infoLabel}>{label}</span>
              </div>
              <div className={styles.infoValueRow}>
                {label === "ปีที่ปลูก" && val && unit && <span className={styles.infoUnit}>{unit}</span>}
                <span className={`${styles.infoValue} ${isMobile ? styles.infoValueMobile : ""} ${!val ? styles.infoValueEmpty : styles.infoValueFilled}`}>{val || "-"}</span>
                {unit && label !== "ปีที่ปลูก" && <span className={styles.infoUnit}>{unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs / Toggles */}
      <div className={styles.tabsRow}>
        {/* Map Tab */}
        <button
          onClick={() => {
            if (activeTab === "map" && expanded) {
              onToggle(); // collapse
            } else {
              setActiveTab("map");
              if (!expanded) onToggle();
            }
          }}
          className={`${styles.tabBtn} ${isMobile ? styles.tabBtnMobile : ""} ${styles.tabBtnDivider} ${expanded && activeTab === "map" ? styles.tabBtnActive : styles.tabBtnInactive}`}
        >
          <div className={styles.tabIconRow}>
            <i className={`bi bi-map${expanded && activeTab === "map" ? "-fill" : ""} ${styles.tabIcon}`} />
            <span className={styles.tabLabel}>แผนที่ขอบเขต</span>
          </div>
        </button>

        {/* Carbon Graph Tab */}
        <button
          onClick={() => {
            if (activeTab === "carbon" && expanded) {
              onToggle(); // collapse
            } else {
              setActiveTab("carbon");
              if (!expanded) onToggle();
            }
          }}
          className={`${styles.tabBtn} ${isMobile ? styles.tabBtnMobile : ""} ${!isProcessed ? styles.tabBtnDisabled : (expanded && activeTab === "carbon" ? styles.tabBtnActive : styles.tabBtnInactive)}`}
        >
          <div className={styles.tabIconRow}>
            <i className={`bi bi-bar-chart-line${expanded && activeTab === "carbon" ? "-fill" : ""} ${styles.tabIcon}`} />
            <span className={styles.tabLabel}>กราฟคาร์บอนเครดิต (tCO₂eq)</span>
          </div>
          {!isProcessed && <span className={styles.tabUnprocessedBadge}>ยังไม่ประมวลผล</span>}
        </button>
      </div>

      {/* Content section */}
      <Accordion open={expanded}>
        <div className={`${styles.content} ${isMobile ? styles.contentMobile : ""}`}>
          {activeTab === "map" ? (
            <PlotMiniMap plot={plot} isMobile={isMobile} index={index} />
          ) : (
            <div className={`${styles.carbonGrid} ${!isMobile && isProcessed ? styles.carbonGridTwoCol : ""}`}>
              {/* Left side: Graph Section */}
              <div className={styles.graphPanel}>
                {isProcessed && barPts.length > 0 ? (
                  <div className={styles.graphInner}>
                    <div className={styles.graphInnerBox}>
                      <CarbonBarChart pts={limitedBarPts} isMobile={isMobile} narrowMode={!isMobile} showAge={showPlotAge} />
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyGraph}>
                    <div className={styles.emptyGraphIconBox}>
                      <i className={`bi bi-clock-history ${styles.emptyGraphIcon}`} />
                    </div>
                    <div className={styles.emptyGraphTitle}>ยังไม่ได้ประมวลผลคาร์บอน</div>
                    <div className={styles.emptyGraphSubtitle}>กรุณาไปที่หน้าวาดแปลงและกด &quot;ประมวลผล&quot; เพื่อดูกราฟการกักเก็บคาร์บอน</div>
                  </div>
                )}
              </div>

              {/* Right side: Details Section — only shown after processing */}
              {isProcessed && (
                <div className={styles.detailsPanel}>
                  <div className={styles.detailsCard}>
                    {/* Header Section */}
                    <div className={styles.detailsHeader}>
                      <span className={styles.detailsHeaderLabel}>
                        <i className="bi bi-layers-fill" /> ข้อมูลที่ใช้ในการประมวลผล
                      </span>
                      {(plot.selectedAreaRai || plot.areaRai) > 0 && (
                        <div className={styles.detailsAreaText}>
                          พื้นที่: <strong className={styles.strongDark}>{(plot.selectedAreaRai || plot.areaRai).toFixed(2)}</strong> ไร่
                        </div>
                      )}
                    </div>

                    {/* Main Year Info (from user or value) */}
                    <div className={yearNotes.length > 0 ? styles.yearSectionWithNotes : styles.yearSection}>
                      <div className={styles.yearLabel}>
                        ปีที่เริ่มปลูกที่ใช้ในการคำนวณ{" "}
                        {userEnteredYear ? (
                          <span className={styles.yearLabelHighlight}>
                            (1 ปี: ข้อมูลที่ผู้ใช้ระบุ)
                          </span>
                        ) : yearBoxItems.length > 0 ? (
                          <span className={styles.yearLabelHighlight}>
                            ({yearBoxItems.length} ปี: ข้อมูลอ้างอิงจากระบบ)
                          </span>
                        ) : (
                          <span className={styles.yearLabelHighlight}>
                            (ข้อมูลอ้างอิงจากระบบ)
                          </span>
                        )}
                      </div>
                      <div className={styles.yearBoxRow}>
                        {userEnteredYear ? (
                          <div className={styles.yearBox}>
                            {displayYearBE ? `${displayYearBE}` : "—"}
                          </div>
                        ) : yearBoxItems.length > 0 ? (
                          <>
                            {yearBoxItems.slice(0, expandYears ? yearBoxItems.length : 3).map((box, bi) => (
                              <div key={bi} className={styles.yearBox}>
                                {box.label.replace(/พ\.ศ\.\s*/g, '')}{box.pct > 0 ? ` (${box.pct}%)` : ""}
                              </div>
                            ))}
                            {yearBoxItems.length > 3 && (
                              <button
                                onClick={() => setExpandYears(!expandYears)}
                                className={`${styles.expandBtn} ${styles.expandBtnLg} ${expandYears ? styles.expandBtnOn : styles.expandBtnOff}`}
                                title={expandYears ? "แสดงน้อยลง" : "แสดงทั้งหมด"}
                              >
                                <i className={`bi bi-${expandYears ? "dash" : "plus"} ${styles.expandIconLg}`} />
                              </button>
                            )}
                          </>
                        ) : (
                          <div className={styles.emptyText}>—</div>
                        )}
                      </div>
                    </div>

                    {/* Inner Box for yearNotes (สัดส่วนปีที่ปลูกที่ตรวจพบในแปลง) */}
                    {yearNotes.length > 0 && (
                      <div className={styles.notesBox}>
                        <div className={styles.notesBoxLabel}>
                          <i className={`bi bi-pie-chart-fill ${styles.notesBoxIcon}`} /> สัดส่วนปีที่เริ่มปลูกที่ตรวจพบในแปลง:
                        </div>
                        <div className={styles.yearBoxRow}>
                          {yearNotes.slice(0, expandNotes ? yearNotes.length : 3).map((note, ni) => {
                            const beNote = convertYearNoteToBE(note);
                            const displayNote = beNote;
                            return (
                              <div key={ni} className={styles.noteBox}>
                                {displayNote.replace(/พ\.ศ\.\s*/g, '')}
                              </div>
                            );
                          })}
                          {yearNotes.length > 3 && (
                            <button
                              onClick={() => setExpandNotes(!expandNotes)}
                              className={`${styles.expandBtn} ${styles.expandBtnSm} ${expandNotes ? styles.expandBtnOn : styles.expandBtnOff}`}
                              title={expandNotes ? "แสดงน้อยลง" : "แสดงทั้งหมด"}
                            >
                              <i className={`bi bi-${expandNotes ? "dash" : "plus"} ${styles.expandIconSm}`} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Common params: variety, spacing, tree count */}
                    <div className={styles.paramsSection}>
                      {displayVariety && <div>• พันธุ์ยาง: <strong className={styles.strongDark}>{displayVariety}</strong> {varietyDesc && <span className={styles.paramSource}>{varietyDesc}</span>}</div>}
                      {displaySpacing && <div>• ระยะปลูก: <strong className={styles.strongDark}>{displaySpacing}</strong> {spacingDesc && <span className={styles.paramSource}>{spacingDesc}</span>}</div>}
                      {displayTreeCount > 0 && <div>• จำนวนต้น: <strong className={styles.strongDark}>{displayTreeCount.toLocaleString("th-TH")}</strong> ต้น {treeCountDesc && <span className={styles.paramSource}>{treeCountDesc}</span>}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
