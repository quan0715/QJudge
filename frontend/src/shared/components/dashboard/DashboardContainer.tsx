import type { ReactNode } from "react";
import styles from "./DashboardContainer.module.scss";

type Layout = "stack" | "split" | "grid";
type Columns = 2 | 3 | 4 | "auto";
type Proportions = "equal" | "main-aside" | "aside-main";

export interface DashboardContainerProps {
  layout: Layout;
  columns?: Columns;
  proportions?: Proportions;
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

const PROPORTIONS_CLASS: Record<Exclude<Proportions, "equal">, string> = {
  "main-aside": styles.proportionsMainAside,
  "aside-main": styles.proportionsAsideMain,
};

export function DashboardContainer({
  layout,
  columns,
  proportions = "equal",
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
    layout === "split" &&
      proportions !== "equal" &&
      PROPORTIONS_CLASS[proportions],
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
