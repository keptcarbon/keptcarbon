"use client";

import { useState } from "react";
import type { EstimatedParameters } from "@/lib/carbon-api";
import { type PlotFormData, type CarbonResult, convertYearNoteToBE } from "./utils";
import styles from "./PlotDetailCard.module.css";

export function PlotDetailCard({
    form,
    cr,
    ep,
    areaRai,
}: {
    form: PlotFormData | undefined;
    cr: CarbonResult;
    ep: EstimatedParameters | null | undefined;
    areaRai?: number;
}) {
    const [expandYears, setExpandYears] = useState(false);
    const [expandNotes, setExpandNotes] = useState(false);

    const userEnteredYear = !!form?.plantYear;
    const yearParam = ep?.year_of_planting;
    const rawNotes = yearParam?.note ?? [];
    const yearNotes = rawNotes;

    // Parse year boxes from value
    let yearBoxItems: Array<{ label: string; pct: number }> = [];
    let displayYearBE: number | null = null;

    if (yearParam) {
        if (typeof yearParam.value === "number" && yearParam.value > 0) {
            displayYearBE = yearParam.value + 543;
            yearBoxItems = [{ label: `${displayYearBE}`, pct: 0 }];
        } else if (Array.isArray(yearParam.value) && yearParam.value.length > 0) {
            const parsed = (yearParam.value as string[]).map(s => {
                const yearMatch = s.match(/^(\d{4})/);
                const pctMatch = s.match(/([\d.]+)%/);
                const yearCE = yearMatch ? parseInt(yearMatch[1]) : null;
                const yearBE = yearCE !== null ? yearCE + 543 : null;
                const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
                return { label: yearBE ? `${yearBE}` : s, pct, yearBE };
            }).filter((x): x is { label: string; pct: number; yearBE: number } => x.yearBE !== null);
            parsed.sort((a, b) => b.pct - a.pct);
            yearBoxItems = parsed;
            if (parsed.length > 0) displayYearBE = parsed[0].yearBE;
        }
    }
    if (!displayYearBE && cr.plantYearBE > 0) displayYearBE = cr.plantYearBE;

    const getSourceText = (source?: string | null, isFromUserFallback?: boolean) => {
        if (!source) return isFromUserFallback ? "" : "(คำนวณจากระบบ)";
        if (source.includes("default")) return "(ค่าเริ่มต้น)";
        if (source.includes("user input") || source.includes("user_input")) return "";
        return "(คำนวณจากระบบ)";
    };

    const variety = ep?.rubber_clone?.value ? String(ep.rubber_clone.value) : (form?.variety || "");
    const spacing = ep?.spacing_system?.value ? String(ep.spacing_system.value).replace(/\s*\([^)]*\)/, "").trim() : (form?.spacing || "");
    const treeCount = (ep?.tree_count && typeof ep.tree_count.value === "number")
        ? ep.tree_count.value
        : (parseInt(form?.treeCount || "0") || cr.trees);

    const varietyDesc = getSourceText(ep?.rubber_clone?.source, !!form?.variety);
    const spacingDesc = getSourceText(ep?.spacing_system?.source, !!form?.spacing);
    const treeCountDesc = getSourceText(ep?.tree_count?.source, !!form?.treeCount);

    return (
        <div className={styles.wrapper}>
            <div className={styles.card}>
                {/* Header Section */}
                <div className={styles.header}>
                    <span className={styles.headerLabel}>
                        <i className="bi bi-layers-fill" /> ข้อมูลที่ใช้ในการประมวลผล
                    </span>
                    {areaRai !== undefined && (
                        <div className={styles.areaText}>
                            พื้นที่: <strong className={styles.strongDark}>{areaRai.toFixed(2)}</strong> ไร่
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
                    {variety && <div>• พันธุ์ยาง: <strong className={styles.strongDark}>{variety}</strong> {varietyDesc && <span className={styles.paramSource}>{varietyDesc}</span>}</div>}
                    {spacing && <div>• ระยะปลูก: <strong className={styles.strongDark}>{spacing}</strong> {spacingDesc && <span className={styles.paramSource}>{spacingDesc}</span>}</div>}
                    {treeCount > 0 && <div>• จำนวนต้น: <strong className={styles.strongDark}>{treeCount.toLocaleString("th-TH")}</strong> ต้น {treeCountDesc && <span className={styles.paramSource}>{treeCountDesc}</span>}</div>}
                </div>
            </div>
        </div>
    );
}