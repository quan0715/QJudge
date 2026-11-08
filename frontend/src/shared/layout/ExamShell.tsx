import { useEffect, type ReactNode } from "react";
import styles from "./ExamShell.module.scss";

interface ExamShellProps {
  header: ReactNode;
  rail?: ReactNode;
  /** Pinned to the bottom of the rail, e.g. the account and settings menu. */
  railFooter?: ReactNode;
  showNavigation?: boolean;
  navigation: ReactNode;
  navigationCollapsed: boolean;
  children: ReactNode;
  auxiliary?: ReactNode;
}

/** Layout only: exam state and allowed actions belong to the feature adapter. */
export function ExamShell({ header, rail, railFooter, showNavigation = true, navigation, navigationCollapsed, children, auxiliary }: ExamShellProps) {
  // The shell owns the viewport: the page itself must never scroll under it.
  useEffect(() => {
    const { documentElement: html, body } = document;
    const previous = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      [html.style.overflow, body.style.overflow] = previous;
    };
  }, []);

  return (
    <div className={styles.shell} data-exam-shell>
      <header className={styles.header}>{header}</header>
      <div className={styles.body}>
        {rail && (
          <nav className={styles.rail} aria-label="考試功能">
            {rail}
            {railFooter && <div className={styles.railFooter}>{railFooter}</div>}
          </nav>
        )}
        {/* While answering, the question list and the panes share one frame split by dividers. */}
        <div className={styles.stage} data-joined={showNavigation}>
          <aside hidden={!showNavigation} className={styles.navigation} data-collapsed={navigationCollapsed} aria-label="題目導覽">{navigation}</aside>
          <main className={styles.workspace} aria-label="考試工作區">{children}</main>
          {auxiliary && <aside className={styles.auxiliary} aria-label="考試輔助工具">{auxiliary}</aside>}
        </div>
      </div>
    </div>
  );
}
