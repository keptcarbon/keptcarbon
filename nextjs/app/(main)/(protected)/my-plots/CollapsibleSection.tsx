"use client";

import { useState } from "react";
import styles from "./ProjectCarbonSummary.module.css";
import { Accordion } from "./Accordion";

/** Same collapsible header shell as ProjectCarbonSummary's "ปริมาณคาร์บอนรวม" —
 *  reused here so the plot dashboard's map/graph sections toggle the same way. */
export function CollapsibleSection({ icon, title, isMobile, defaultOpen = false, children }: {
  icon: string;
  title: string;
  isMobile: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <div className={styles.container}>
      <div className={`${styles.header} ${isMobile ? styles.headerMobile : ""} ${isExpanded ? styles.headerExpanded : styles.headerCollapsed}`}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <i className={`bi ${icon}`} />
          </div>
          <div className={`${styles.headerTitle} ${isMobile ? styles.headerTitleMobile : ""}`}>{title}</div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`${styles.headerToggle} ${isExpanded ? styles.headerToggleExpanded : styles.headerToggleCollapsed}`}
        >
          ดูข้อมูล
          <i className={`bi bi-chevron-${isExpanded ? "up" : "down"}`} />
        </button>
      </div>
      <Accordion open={isExpanded}>
        {children}
      </Accordion>
    </div>
  );
}
