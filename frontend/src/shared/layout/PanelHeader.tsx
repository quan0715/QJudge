import type { ReactNode } from "react";
import styles from "./PanelHeader.module.scss";

interface PanelHeaderProps {
  title?: ReactNode;
  /** Alternative leading content, such as a panel's tabs. */
  children?: ReactNode;
  /** Carbon icon-only actions; use size="sm" to fill the header height. */
  actions?: ReactNode;
}

export function PanelHeader({ title, children, actions }: PanelHeaderProps) {
  return <div className={styles.header}>
    <div className={styles.content}>
      {title != null ? <span className={styles.title}>{title}</span> : children}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </div>;
}
