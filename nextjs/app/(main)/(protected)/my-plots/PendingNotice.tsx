import plotStyles from "./PlotCard.module.css";

/** Compact amber notice shown in place of a chart/simulation before the plot data is ready. */
export function PendingNotice({ title, subtitle, icon = "bi-clock-history" }: { title: string; subtitle: React.ReactNode; icon?: string }) {
  return (
    <div className={plotStyles.emptyGraph}>
      <div className={plotStyles.emptyGraphIconBox}>
        <i className={`bi ${icon} ${plotStyles.emptyGraphIcon}`} aria-hidden="true" />
      </div>
      <div>
        <div className={plotStyles.emptyGraphTitle}>{title}</div>
        <div className={plotStyles.emptyGraphSubtitle}>{subtitle}</div>
      </div>
    </div>
  );
}
