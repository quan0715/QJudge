import { useId } from "react";
import { Button } from "@carbon/react";
import { motion } from "motion/react";
import type { ElementType } from "react";
import styles from "./IconModeSwitcher.module.scss";

export interface IconModeOption<T extends string> {
  value: T;
  label: string;
  icon: ElementType;
}

interface IconModeSwitcherProps<T extends string> {
  value: T;
  options: IconModeOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
}

export function IconModeSwitcher<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  tooltipPosition = "bottom",
}: IconModeSwitcherProps<T>) {
  const layoutId = useId();

  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <div key={option.value} className={styles.btnWrap}>
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={styles.activeBg}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <Button
              kind="ghost"
              hasIconOnly
              size="sm"
              renderIcon={option.icon}
              iconDescription={option.label}
              tooltipPosition={tooltipPosition}
              className={`${styles.iconBtn} ${isActive ? styles.iconBtnActive : ""}`}
              aria-label={option.label}
              aria-selected={isActive}
              role="tab"
              onClick={() => onChange(option.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
