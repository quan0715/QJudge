import { Tile } from "@carbon/react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./DataCard.module.scss";

export type InfoCardSize = "sm" | "default";

export interface InfoCardProps {
  title: string;
  value: ReactNode;
  description?: string;
  unit?: string;
  icon?: ReactNode | React.ComponentType<{ size?: number }>;
  size?: InfoCardSize;
  fillBackground?: boolean;
  outline?: boolean;
  valueStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
}

const sizeClassMap: Record<InfoCardSize, string> = {
  sm: styles.sizeSm,
  default: styles.sizeDefault,
};

const renderIconNode = (
  icon: React.ComponentType<{ size?: number }> | ReactNode | undefined,
  size = 16
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

export const InfoCard = ({
  title,
  value,
  description,
  unit,
  icon,
  size = "default",
  fillBackground = false,
  outline = true,
  valueStyle,
  className,
  style,
}: InfoCardProps) => {
  const tileClassName = [
    styles.card,
    sizeClassMap[size],
    outline && styles.outline,
    fillBackground && styles.filled,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tile className={tileClassName} style={style}>
      <div className={styles.title}>
        {title}
        {icon && <span>{renderIconNode(icon)}</span>}
      </div>
      <div className={styles.value} style={valueStyle}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </Tile>
  );
};

export default InfoCard;
