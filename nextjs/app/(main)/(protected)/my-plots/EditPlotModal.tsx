"use client";

import { useState } from "react";
import type { SavedPlot } from "./types";
import styles from "./EditPlotModal.module.css";

const VARIETY_OPTIONS = ["RRIM 600", "RRIT 251"];
const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];
const GROWTH_MODEL_OPTIONS = [
  { label: "Anchored Chapman-Richards", value: "chapman_richards" },
  { label: "Anchored Weibull", value: "weibull" },
  { label: "Anchored Gompertz", value: "gompertz" },
  { label: "Anchored Schumacher", value: "schumacher" },
];
const ALLOMETRY_OPTIONS = [
  { label: "Hytonen et al. (2018)", value: "hytonen_2018" },
  { label: "Chiarawipa et al. (2012)", value: "chiarawipa_2012" },
];

const CURRENT_BE_YEAR = new Date().getFullYear() + 543;
const NEW_YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => String(CURRENT_BE_YEAR + i));
const OLD_YEAR_OPTIONS = Array.from({ length: CURRENT_BE_YEAR - 2534 + 1 }, (_, i) => String(CURRENT_BE_YEAR - i));

export function EditPlotModal({ plot, index, onClose, onSave, onSaveAndProcess, processing, isMobile }: { plot: SavedPlot; index: number; onClose: () => void; onSave: (p: SavedPlot) => void; onSaveAndProcess?: (p: SavedPlot) => void; processing?: boolean; isMobile: boolean }) {
  const form = plot.backendData?.form;
  const isUserYear = !!form?.plantYear;
  const isUserTrees = !!form?.treeCount;
  const isUserVariety = !!form?.variety;
  const isUserSpacing = !!form?.spacing;

  const [formData, setFormData] = useState({
    name: plot.name || "",
    ownerName: plot.ownerName || "",
    province: plot.province || "",
    areaRai: (plot.selectedAreaRai || plot.areaRai)?.toString() || "",
    plantStatus: form?.plantStatus || "",
    trees: isUserTrees && plot.trees ? plot.trees.toString() : "",
    plantYearBE: isUserYear && plot.plantYearBE ? plot.plantYearBE.toString() : "",
    variety: isUserVariety && plot.variety ? plot.variety : "",
    spacing: isUserSpacing && plot.spacing ? plot.spacing : "",
    growthModel: form?.growthModel || "",
    allometry: form?.allometry || "",
  });

  const buildUpdatedPlot = (): SavedPlot => {
    // Current year BE to calculate age
    const currentBE = new Date().getFullYear() + 543;
    let ageNum = 0;

    let effectivePlantYear = parseInt(formData.plantYearBE) || undefined;

    if (formData.plantStatus === "replanting") {
      ageNum = 0;
      effectivePlantYear = effectivePlantYear || currentBE;
    } else if (formData.plantStatus === "existing") {
      if (effectivePlantYear) {
        ageNum = currentBE - effectivePlantYear;
      }
    }

    const treesNum = parseInt(formData.trees) || plot.trees || 0;
    const sp = formData.spacing || plot.spacing || "";

    // Detect if any carbon-affecting fields have changed
    const prevPlantYear = plot.plantYearBE || 0;
    const newPlantYear = effectivePlantYear || 0;
    const prevTrees = plot.trees || 0;
    const prevSpacing = plot.spacing || "";
    const prevStatus = plot.plantStatus || "";
    const prevGrowthModel = form?.growthModel || "";
    const prevAllometry = form?.allometry || "";

    const carbonFieldsChanged =
      newPlantYear !== prevPlantYear ||
      treesNum !== prevTrees ||
      sp !== prevSpacing ||
      formData.plantStatus !== prevStatus ||
      formData.growthModel !== prevGrowthModel ||
      formData.allometry !== prevAllometry;

    const newForm = {
      ...(plot.backendData?.form || {}),
      plantStatus: formData.plantStatus ? formData.plantStatus : undefined,
      plantYear: effectivePlantYear ? String(effectivePlantYear) : undefined,
      treeCount: formData.trees ? formData.trees : undefined,
      variety: formData.variety ? formData.variety : undefined,
      spacing: formData.spacing ? formData.spacing : undefined,
      growthModel: formData.growthModel ? formData.growthModel : undefined,
      allometry: formData.allometry ? formData.allometry : undefined,
    };

    // If carbon-affecting fields changed, mark as needing reprocessing.
    // Do NOT recalculate locally — wait for the user to hit "ประมวลผล" to get
    // accurate backend results.
    return {
      ...plot,
      name: formData.name,
      ownerName: formData.ownerName,
      province: formData.province,
      selectedAreaRai: parseFloat(formData.areaRai) || 0,
      rubberAge: ageNum,
      trees: treesNum,
      plantYearBE: effectivePlantYear,
      plantStatus: formData.plantStatus,
      variety: formData.variety,
      spacing: formData.spacing,
      // If carbon-affecting fields changed: clear results so the user must reprocess
      carbonTotal: carbonFieldsChanged ? 0 : plot.carbonTotal,
      carbonProfile: carbonFieldsChanged ? [] : (plot.carbonProfile || []),

      processed: carbonFieldsChanged ? false : plot.processed,
      backendData: {
        ...(plot.backendData || {}),
        form: newForm,
        // Clear stale backend ep data so the details panel doesn't show old results
        ep: carbonFieldsChanged ? null : (plot.backendData?.ep ?? null),
      }
    };
  };

  const handleSaveClick = () => onSave(buildUpdatedPlot());
  const handleSaveAndProcessClick = () => onSaveAndProcess?.(buildUpdatedPlot());

  const fieldLabel = (icon: string, text: React.ReactNode) => (
    <label className={styles.fieldLabel}>
      <i className={`bi ${icon} ${styles.fieldLabelIcon}`} />
      {text}
    </label>
  );

  const SelectField = ({ value, onChange, disabled, children }: { value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode }) => (
    <div className={styles.selectWrap}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`${styles.select} ${value ? styles.selectFilled : styles.selectEmpty}`}
      >
        {children}
      </select>
      <i className={`bi bi-chevron-down ${styles.selectChevron} ${disabled ? styles.selectChevronDisabled : ""}`} />
    </div>
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={`${styles.header} ${isMobile ? styles.headerMobile : ""}`}>
          <div className={styles.headerRow}>
            <div className={styles.headerIcon}>
              <i className="bi bi-pencil-square" />
            </div>
            <div>
              <div className={styles.headerTitle}>แก้ไขข้อมูลแปลงที่ {index}</div>
              <div className={styles.headerSubtitle}>แก้ไขได้เฉพาะสถานะแปลงและรายละเอียดข้อมูล</div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className={`${styles.body} ${isMobile ? styles.bodyMobile : ""}`}>

          {/* สถานะแปลง */}
          <div className={styles.statusSection}>
            {fieldLabel("bi-info-circle", <><span>สถานะแปลง</span><span className={styles.requiredMark}>*</span></>)}
            <div className={styles.statusRow}>
              {(["replanting", "existing"] as const).map(status => {
                const active = formData.plantStatus === status;
                const label = status === "replanting" ? "เริ่มปลูกใหม่" : "ปลูกมาแล้ว";
                return (
                  <div
                    key={status}
                    onClick={() => setFormData(f => ({
                      ...f,
                      plantStatus: status,
                      plantYearBE: status === "replanting" ? String(new Date().getFullYear() + 543) : "",
                    }))}
                    className={`${styles.statusOption} ${active ? styles.statusOptionActive : ""}`}
                  >
                    <div className={`${styles.statusRadio} ${active ? styles.statusRadioActive : ""}`}>
                      {active && <div className={styles.statusRadioDot} />}
                    </div>
                    <span className={`${styles.statusLabel} ${active ? styles.statusLabelActive : ""}`}>{label}</span>
                  </div>
                );
              })}
            </div>
            {!formData.plantStatus && (
              <div className={styles.statusWarning}>
                <i className="bi bi-exclamation-circle-fill" /> กรุณาเลือกสถานะแปลงก่อน
              </div>
            )}
          </div>

          {/* Fields section */}
          <div className={`${styles.fieldsSection} ${!formData.plantStatus ? styles.fieldsSectionDisabled : ""}`}>

            {/* ปีที่ปลูก + พันธุ์ยาง + จำนวนต้น + ระยะปลูก — 2x2, same order as map-draw */}
            <div className={`${styles.fieldGrid} ${isMobile ? styles.fieldGridMobile : ""}`}>
              <div>
                {fieldLabel("bi-calendar-event", "ปีที่ปลูก (พ.ศ.)")}
                <SelectField
                  value={formData.plantYearBE}
                  onChange={v => setFormData(f => ({ ...f, plantYearBE: v }))}
                  disabled={!formData.plantStatus}
                >
                  <option value="">— เลือกปีที่ปลูก —</option>
                  {(formData.plantStatus === "replanting" ? NEW_YEAR_OPTIONS : formData.plantStatus === "existing" ? OLD_YEAR_OPTIONS : []).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                {fieldLabel("bi-tags", "พันธุ์ยาง")}
                <SelectField value={formData.variety} onChange={v => setFormData(f => ({ ...f, variety: v }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </SelectField>
              </div>
              <div>
                {fieldLabel("bi-tree-fill", "จำนวนต้น")}
                <div className={styles.inputWrap}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.trees}
                    onKeyDown={e => {
                      if (['.', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={e => {
                      const val = e.target.value.split('.')[0].replace(/\D/g, '');
                      setFormData(f => ({ ...f, trees: val }));
                    }}
                    placeholder="ระบุจำนวนต้น"
                    className={styles.input}
                  />
                  <span className={styles.inputSuffix}>ต้น</span>
                </div>
              </div>
              <div>
                {fieldLabel("bi-arrows-fullscreen", "ระยะปลูก (ม.)")}
                <SelectField value={formData.spacing} onChange={v => setFormData(f => ({ ...f, spacing: v }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s} ม.</option>)}
                </SelectField>
              </div>
            </div>

            {/* Growth Model + สมการ Allometry */}
            <div className={`${styles.fieldGrid} ${isMobile ? styles.fieldGridMobile : ""}`}>
              <div>
                {fieldLabel("bi-graph-up", "Growth Model")}
                <SelectField value={formData.growthModel} onChange={v => setFormData(f => ({ ...f, growthModel: v }))}>
                  <option value="">— เลือก model —</option>
                  {GROWTH_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
              </div>
              <div>
                {fieldLabel("bi-calculator", "สมการ Allometry")}
                <SelectField value={formData.allometry} onChange={v => setFormData(f => ({ ...f, allometry: v }))}>
                  <option value="">— เลือกสมการ —</option>
                  {ALLOMETRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectField>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`${styles.footer} ${isMobile ? styles.footerMobile : ""}`}>
          <button
            onClick={onClose}
            disabled={processing}
            className={`${styles.btnCancel} ${processing ? styles.btnDisabled : ""}`}
          >ยกเลิก</button>
          <button
            onClick={handleSaveClick}
            disabled={processing}
            className={`${styles.btnSave} ${processing ? styles.btnDisabled : ""}`}
            title="บันทึกข้อมูล โดยยังไม่ประมวลผลคาร์บอนใหม่"
          >
            <i className="bi bi-floppy-disk" /> บันทึก
          </button>
          {onSaveAndProcess && (
            <button
              onClick={handleSaveAndProcessClick}
              disabled={processing}
              className={`${styles.btnSaveProcess} ${processing ? styles.btnDisabled : ""}`}
              title="บันทึกและประมวลผลคาร์บอนใหม่ทันที"
            >
              {processing ? (
                <><i className={`bi bi-arrow-repeat ${styles.spinIcon}`} /> กำลังประมวลผล...</>
              ) : (
                <><i className="bi bi-lightning-charge-fill" /> บันทึกและประมวลผล</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
