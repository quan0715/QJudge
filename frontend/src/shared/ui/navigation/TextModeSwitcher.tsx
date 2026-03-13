import { useId } from "react";
import { motion } from "motion/react";
import styles from "./TextModeSwitcher.module.scss";

export interface TextModeOption<T extends string> {
  value: T;
  label: string;
  shortLabel: string;
}

interface TextModeSwitcherProps<T extends string> {
  value: T;
  options: TextModeOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function TextModeSwitcher<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: TextModeSwitcherProps<T>) {
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
          <button
            key={option.value}
            type="button"
            className={`${styles.textBtn} ${isActive ? styles.textBtnActive : ""}`}
            aria-label={option.label}
            aria-selected={isActive}
            role="tab"
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={styles.activeBg}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className={styles.textLabel}>{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
