import type { ReactNode } from "react";
import { DashboardBlock } from "./DashboardBlock";
import { MetricBlock } from "./typography/MetricBlock";
import styles from "./KPIBlock.module.scss";

export interface KPIBlockProps {
  /** Small section label rendered above the value. */
  title: ReactNode;
  /** Highlighted KPI value (e.g. "126 人", "78%", "0.0 / 103"). */
  value: ReactNode;
  /** Optional inline icon / badge rendered next to the value. */
  trailing?: ReactNode;
  /** Value size. Defaults to "lg" for KPI emphasis. */
  size?: "default" | "lg";
  /** Align label + value to start (default) or end. */
  align?: "start" | "end";
  /** Inherit DashboardBlock padding contract. */
  padding?: "default" | "compact" | "flush";
  /** Visualization slot — chart, progress bar, list, etc. */
  children?: ReactNode;
  ariaLabel?: string;
}

export function KPIBlock({
  title,
  value,
  trailing,
  size = "lg",
  align = "start",
  padding = "default",
  children,
  ariaLabel,
}: KPIBlockProps) {
  const resolvedAriaLabel =
    ariaLabel ?? (typeof title === "string" ? title : undefined);
  return (
    <DashboardBlock padding={padding} ariaLabel={resolvedAriaLabel}>
      <MetricBlock
        label={title}
        value={value}
        size={size}
        align={align}
        trailing={trailing}
      />
      {children ? <div className={styles.body}>{children}</div> : null}
    </DashboardBlock>
  );
}
