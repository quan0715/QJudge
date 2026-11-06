import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ExamWorkspaceShell.module.scss";

interface ExamIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  /** Tooltip text when it differs from the accessible name. */
  tooltip?: string;
  tooltipPlacement?: "right" | "bottom";
  children: ReactNode;
}

/** Icon-only control with a hover/focus tooltip shared by the header and rail. */
export function ExamIconButton({ label, tooltip, tooltipPlacement = "bottom", className, children, ...props }: ExamIconButtonProps) {
  return (
    <button type="button" aria-label={label} className={[styles.iconButton, className].filter(Boolean).join(" ")} {...props}>
      {children}
      <span className={styles.tooltip} data-placement={tooltipPlacement} aria-hidden="true">{tooltip ?? label}</span>
    </button>
  );
}
