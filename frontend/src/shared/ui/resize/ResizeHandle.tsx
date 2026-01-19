import React from "react";
import { Separator as PanelSeparator } from "react-resizable-panels";
import "./ResizeHandle.scss";

export type ResizeOrientation = "horizontal" | "vertical";

export interface ResizeHandleProps {
  /** 
   * Orientation of the resize handle
   * - "horizontal": For vertical panel groups (resizes height)
   * - "vertical": For horizontal panel groups (resizes width)
   */
  orientation?: ResizeOrientation;
  /** Additional className */
  className?: string;
  /** Disable the handle */
  disabled?: boolean;
}

/**
 * ResizeHandle - Global reusable resize handle component
 * 
 * Uses react-resizable-panels' Separator with consistent styling.
 * 
 * @example
 * // For horizontal panel groups (vertical resize bar)
 * <ResizeHandle orientation="vertical" />
 * 
 * // For vertical panel groups (horizontal resize bar)
 * <ResizeHandle orientation="horizontal" />
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  orientation = "vertical",
  className,
  disabled = false,
}) => {
  const baseClass = "resize-handle";
  const orientationClass = `${baseClass}--${orientation}`;
  const disabledClass = disabled ? `${baseClass}--disabled` : "";
  
  const combinedClassName = [
    baseClass,
    orientationClass,
    disabledClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PanelSeparator
      className={combinedClassName}
      aria-disabled={disabled}
    />
  );
};

export default ResizeHandle;
