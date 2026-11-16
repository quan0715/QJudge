import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconButton } from "@carbon/react";

interface ExamIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  tooltipPlacement?: "right" | "bottom";
  children: ReactNode;
}

/** Icon-only control with a hover/focus tooltip shared by the header and rail. */
export function ExamIconButton({ label, tooltipPlacement = "bottom", className, children, ...props }: ExamIconButtonProps) {
  return (
    <IconButton
      type="button"
      kind="ghost"
      size="sm"
      align={tooltipPlacement}
      isSelected={props["aria-pressed"] === true || props["aria-pressed"] === "true"}
      label={label}
      className={className}
      {...props}
    >
      {children}
    </IconButton>
  );
}
