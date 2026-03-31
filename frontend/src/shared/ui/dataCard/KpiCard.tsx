import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./DataCard.module.scss";

export interface KpiCardProps {
  icon?: React.ComponentType<{ size?: number }> | ReactNode;
  value: ReactNode;
  label: string;
  /** Unit suffix rendered inline after value in smaller text (e.g. "ms", "分", "%") */
  unit?: string;
  /** Secondary description rendered below the label */
  description?: string;
  /** Custom style applied to the value element (e.g. color for status) */
  valueStyle?: CSSProperties;
  meta?: ReactNode;
  showBorder?: boolean;
  /** Full surrounding border (Tile-like appearance), overrides showBorder */
  outline?: boolean;
  /** Set true when the card is rendered on top of a cover image — applies a
   *  dark frosted-glass backdrop for readability. */
  onCover?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Animate the numeric value counting up from 0 on mount.
   *  Only takes effect when `value` is a finite number. */
  animated?: boolean;
  /** Duration of the count-up animation in ms (default: 900) */
  animationDuration?: number;
}

// Easing: ease-out-expo — fast start, smooth deceleration
const easeOutExpo = (t: number) =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

function useCountUp(target: number, duration: number, enabled: boolean) {
  const [display, setDisplay] = useState(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setDisplay(target);
      return;
    }
    setDisplay(0);
    startTimeRef.current = null;

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(easeOutExpo(progress) * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, enabled]);

  return display;
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
  unit,
  description,
  valueStyle,
  meta,
  showBorder = true,
  outline = false,
  onCover = false,
  active,
  onClick,
  className,
  style,
  animated = false,
  animationDuration = 900,
}: KpiCardProps) => {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : null;
  const countedValue = useCountUp(
    numericValue ?? 0,
    animationDuration,
    animated && numericValue !== null
  );

  const displayValue = animated && numericValue !== null ? countedValue : value;

  return (
    <div
      className={[
        styles.card,
        styles.kpi,
        !outline && showBorder ? styles.kpiBorder : "",
        outline ? styles.outline : "",
        active ? styles.kpiActive : "",
        onCover ? styles.kpiOnCover : "",
        className || "",
      ].join(" ")}
      style={{ ...style, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-pressed={onClick ? active : undefined}
    >
      <div className={styles.kpiIcon}>{renderIconNode(icon)}</div>
      <div className={styles.kpiValue} style={valueStyle}>
        {displayValue}
        {unit && <span className={styles.kpiUnit}>{unit}</span>}
      </div>
      <div className={styles.kpiLabel}>{label}</div>
      {description && <div className={styles.kpiDescription}>{description}</div>}
      {meta ? <div className={styles.kpiMeta}>{meta}</div> : null}
    </div>
  );
};

export default KpiCard;
