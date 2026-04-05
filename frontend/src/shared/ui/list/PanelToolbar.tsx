import type { ReactNode } from "react";
import styles from "./PanelToolbar.module.scss";

const cx = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" ");

export interface PanelToolbarProps {
  /** Left-most actions (e.g. toggle sidebar button) */
  leftActions?: ReactNode;
  /** Left side — typically a title string */
  title?: string;
  /** Save/operation status shown next to title */
  status?: ReactNode;
  /** Right side — icon-only action buttons */
  actions?: ReactNode;
  className?: string;
}

export const PanelToolbar = ({ leftActions, title, status, actions, className }: PanelToolbarProps) => (
  <div className={cx(styles.toolbar, className)}>
    <div className={cx(styles.left, !leftActions && title && styles.leftWithTitle)}>
      {leftActions}
      {title ? <h4 className={styles.title}>{title}</h4> : null}
      {status}
    </div>
    <div className={styles.right}>{actions}</div>
  </div>
);
