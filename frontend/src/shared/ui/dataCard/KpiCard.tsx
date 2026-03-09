import type { CSSProperties, ReactNode } from "react";
import styles from "./DataCard.module.scss";

export interface KpiCardProps {
  icon?: React.ComponentType<{ size?: number }> | ReactNode;
  value: ReactNode;
  label: string;
  showBorder?: boolean;
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
  showBorder = true,
  className,
  style,
}: KpiCardProps) => {
  return (
    <div
      className={`${styles.card} ${styles.kpi} ${showBorder ? styles.kpiBorder : ""} ${className || ""}`}
      style={style}
    >
      <div className={styles.kpiIcon}>{renderIconNode(icon)}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  );
};

export default KpiCard;
