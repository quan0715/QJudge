import type { ReactNode } from "react";
import styles from "./TimeDisplay.module.scss";

export interface TimeDisplayProps {
  value: ReactNode;
  variant?: "countdown" | "header";
  label?: ReactNode;
}

export function TimeDisplay({
  value,
  variant = "countdown",
  label,
}: TimeDisplayProps) {
  const valueClass = variant === "header" ? styles.header : styles.countdown;
  return (
    <span className={styles.root}>
      {label && <span className={styles.label}>{label}</span>}
      <span className={`${styles.value} ${valueClass}`}>{value}</span>
    </span>
  );
}
