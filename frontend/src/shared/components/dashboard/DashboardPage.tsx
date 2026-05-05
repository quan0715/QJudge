import type { ReactNode } from "react";
import styles from "./DashboardPage.module.scss";

export interface DashboardPageProps {
  children: ReactNode;
  ariaLabel?: string;
}

export function DashboardPage({ children, ariaLabel }: DashboardPageProps) {
  return (
    <main className={styles.root} aria-label={ariaLabel}>
      <div className={styles.inner}>{children}</div>
    </main>
  );
}
