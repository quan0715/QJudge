import type { ReactNode } from "react";
import styles from "./DashboardBlock.module.scss";

type Padding = "default" | "compact" | "flush";

export interface DashboardBlockProps {
  padding?: Padding;
  children: ReactNode;
  ariaLabel?: string;
}

const PAD: Record<Padding, string> = {
  default: styles.paddingDefault,
  compact: styles.paddingCompact,
  flush: styles.paddingFlush,
};

export function DashboardBlock({
  padding = "default",
  children,
  ariaLabel,
}: DashboardBlockProps) {
  return (
    <section
      className={`${styles.root} ${PAD[padding]}`}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}
