import type { ReactNode } from "react";
import styles from "./DashboardPage.module.scss";

export interface DashboardPageProps {
  children: ReactNode;
  ariaLabel?: string;
  fullBleed?: boolean;
}

export function DashboardPage({
  children,
  ariaLabel,
  fullBleed = false,
}: DashboardPageProps) {
  const innerClassName = fullBleed
    ? `${styles.inner} ${styles.fullBleed}`
    : styles.inner;
  return (
    <main className={styles.root} aria-label={ariaLabel}>
      <div className={innerClassName}>{children}</div>
    </main>
  );
}
