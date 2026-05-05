import type { ReactNode } from "react";
import styles from "./MetricBlock.module.scss";

export interface MetricBlockProps {
  label: ReactNode;
  value: ReactNode;
  size?: "default" | "lg";
  align?: "start" | "end";
  trailing?: ReactNode;
}

export function MetricBlock({
  label,
  value,
  size = "default",
  align = "start",
  trailing,
}: MetricBlockProps) {
  const valueClass = size === "lg" ? styles.valueLg : styles.valueDefault;
  const rootClass = [styles.root, align === "end" && styles.alignEnd]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={rootClass}>
      <span className={styles.label}>{label}</span>
      <strong className={`${styles.value} ${valueClass}`}>
        {value}
        {trailing}
      </strong>
    </div>
  );
}
