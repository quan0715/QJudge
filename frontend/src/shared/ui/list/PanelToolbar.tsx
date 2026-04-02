import type { ReactNode } from "react";
import styles from "./PanelToolbar.module.scss";

interface PanelToolbarProps {
  /** Left side — typically a title string */
  title?: string;
  /** Save/operation status shown next to title */
  status?: ReactNode;
  /** Right side — icon-only action buttons */
  actions?: ReactNode;
  className?: string;
}

export const PanelToolbar = ({ title, status, actions, className }: PanelToolbarProps) => (
  <div className={[styles.toolbar, className].filter(Boolean).join(" ")}>
    <div className={styles.left}>
      {title && <h4 className={styles.title}>{title}</h4>}
      {status}
    </div>
    <div className={styles.right}>
      {actions}
    </div>
  </div>
);
