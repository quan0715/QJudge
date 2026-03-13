import { Button } from "@carbon/react";
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
  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Button
            key={option.value}
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
        );
      })}
    </div>
  );
}
