import type { ReactNode } from "react";
import styles from "./MetricBlock.module.scss";

export interface MetricBlockProps {
  label: ReactNode;
  value: ReactNode;
  align?: "start" | "end";
  trailing?: ReactNode;
}

export function MetricBlock({
  label,
  value,
  align = "start",
  trailing,
}: MetricBlockProps) {
  const rootClass = [styles.root, align === "end" && styles.alignEnd]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={rootClass}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>
        {value}
        {trailing}
      </strong>
    </div>
  );
}
