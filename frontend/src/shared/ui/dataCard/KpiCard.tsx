import type { CSSProperties, ReactNode } from "react";
import styles from "./DataCard.module.scss";

export interface KpiCardProps {
  icon?: React.ComponentType<{ size?: number }> | ReactNode;
  value: ReactNode;
  label: string;
  meta?: ReactNode;
  showBorder?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

const renderIconNode = (
  icon: React.ComponentType<{ size?: number }> | ReactNode | undefined,
  size = 20
) => {
  if (!icon) return null;
  const asAny = icon as any;
  const isForwardRef =
    typeof asAny === "object" && asAny !== null && "$$typeof" in asAny && "render" in asAny;
  if (typeof icon === "function" || isForwardRef) {
    const Icon = icon as React.ComponentType<{ size?: number }>;
    return <Icon size={size} />;
  }
  return icon;
};

export const KpiCard = ({
  icon,
  value,
  label,
  meta,
  showBorder = true,
  active,
  onClick,
  className,
  style,
}: KpiCardProps) => {
  return (
    <div
      className={`${styles.card} ${styles.kpi} ${showBorder ? styles.kpiBorder : ""} ${active ? styles.kpiActive : ""} ${className || ""}`}
      style={{ ...style, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-pressed={onClick ? active : undefined}
    >
      <div className={styles.kpiIcon}>{renderIconNode(icon)}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {meta ? <div className={styles.kpiMeta}>{meta}</div> : null}
    </div>
  );
};

export default KpiCard;
