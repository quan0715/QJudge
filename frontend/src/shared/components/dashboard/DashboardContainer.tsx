import type { ReactNode } from "react";
import styles from "./DashboardContainer.module.scss";

type Layout = "stack" | "split" | "grid";
type Columns = 2 | 3 | 4 | "auto";

export interface DashboardContainerProps {
  layout: Layout;
  columns?: Columns;
  dividers?: "auto" | "none";
  bordered?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}

const COLS_CLASS: Record<Columns, string> = {
  2: styles.gridCols2,
  3: styles.gridCols3,
  4: styles.gridCols4,
  auto: styles.gridColsAuto,
};

export function DashboardContainer({
  layout,
  columns,
  dividers = "none",
  bordered = false,
  children,
  ariaLabel,
}: DashboardContainerProps) {
  const classes = [
    styles.root,
    styles[layout],
    dividers === "auto" && styles.dividers,
    bordered && styles.bordered,
    layout === "grid" && columns && COLS_CLASS[columns],
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
