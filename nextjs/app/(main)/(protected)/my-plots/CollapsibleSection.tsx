"use client";

import { useState } from "react";
import styles from "./ProjectCarbonSummary.module.css";
import { Accordion } from "./Accordion";

/** Same collapsible header shell as ProjectCarbonSummary's "ปริมาณคาร์บอนรวม" —
 *  reused here so the plot dashboard's map/graph sections toggle the same way. */
export function CollapsibleSection({ icon, title, subtitle, isMobile, defaultOpen = false, open, onToggle, keepMounted, children }: {
  icon: string;
  title: string;
  /** Shown after the title (e.g. the plot's location); hidden when empty. */
  subtitle?: string;
  isMobile: boolean;
  defaultOpen?: boolean;
  /** Controlled mode: when set, the parent owns the open state (e.g. accordion
   *  groups where opening one section closes the others). */
  open?: boolean;
  onToggle?: () => void;
  /** Keep the content mounted after its first open so its state survives collapsing. */
  keepMounted?: boolean;
  children: React.ReactNode;
}) {
  const [localExpanded, setLocalExpanded] = useState(defaultOpen);
  const isExpanded = open ?? localExpanded;
  const toggle = onToggle ?? (() => setLocalExpanded(!localExpanded));

  return (
    <div className={styles.container}>
      <div className={`${styles.header} ${isMobile ? styles.headerMobile : ""} ${isExpanded ? styles.headerExpanded : styles.headerCollapsed}`}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <i className={`bi ${icon}`} />
          </div>
          <div className={styles.headerTitleGroup}>
            <div className={`${styles.headerTitle} ${isMobile ? styles.headerTitleMobile : ""}`}>{title}</div>
            {subtitle && (
              <div className={styles.headerSubtitle}>
                <i className="bi bi-geo-alt" aria-hidden="true" />
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`${styles.headerToggle} ${isExpanded ? styles.headerToggleExpanded : styles.headerToggleCollapsed}`}
        >
          ดูข้อมูล
          <i className={`bi bi-chevron-${isExpanded ? "up" : "down"}`} />
        </button>
      </div>
      <Accordion open={isExpanded} keepMounted={keepMounted}>
        {children}
      </Accordion>
    </div>
  );
}
