import type React from "react";
import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
  /** Carbon icon component (e.g. Trophy, Bullhorn) */
  icon?: React.ComponentType<{ size: number; className?: string }>;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  children,
  compact = false,
  className,
}) => (
  <div className={[styles.root, compact && styles.compact, className].filter(Boolean).join(" ")}>
    {Icon && <Icon size={28} className={styles.icon} />}
    {title && <p className={styles.title}>{title}</p>}
    {description && <p className={styles.description}>{description}</p>}
    {children}
    {action && <div className={styles.action}>{action}</div>}
  </div>
);

export default EmptyState;
