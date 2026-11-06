import type { ReactNode } from "react";
import styles from "./ExamShell.module.scss";

interface ExamShellProps {
  header: ReactNode;
  rail?: ReactNode;
  showNavigation?: boolean;
  navigation: ReactNode;
  navigationCollapsed: boolean;
  children: ReactNode;
  auxiliary?: ReactNode;
}

/** Layout only: exam state and allowed actions belong to the feature adapter. */
export function ExamShell({ header, rail, showNavigation = true, navigation, navigationCollapsed, children, auxiliary }: ExamShellProps) {
  return (
    <div className={styles.shell} data-exam-shell>
      <header className={styles.header}>{header}</header>
      <div className={styles.body}>
        {rail && <nav className={styles.rail} aria-label="考試功能">{rail}</nav>}
        <aside hidden={!showNavigation} className={styles.navigation} data-collapsed={navigationCollapsed} aria-label="題目導覽">{navigation}</aside>
        <main className={styles.workspace} aria-label="考試工作區">{children}</main>
        {auxiliary && <aside className={styles.auxiliary} aria-label="考試輔助工具">{auxiliary}</aside>}
      </div>
    </div>
  );
}
