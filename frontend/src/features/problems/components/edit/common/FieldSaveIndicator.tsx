import React from "react";
import { InlineLoading, Button } from "@carbon/react";
import { Checkmark, ErrorFilled, Renew } from "@carbon/icons-react";
import type { FieldSaveStatus } from "@/features/problems/hooks/useAutoSave";
import styles from "./FieldSaveIndicator.module.scss";

export interface FieldSaveIndicatorProps {
  /** Current save status */
  status: FieldSaveStatus;
  /** Error message to display */
  error?: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional class name */
  className?: string;
}

/**
 * FieldSaveIndicator - Shows save status next to form fields
 *
 * States:
 * - idle: Hidden (no indicator)
 * - saving: Spinning loader with "儲存中..."
 * - saved: Green checkmark with "已儲存" (fades after 2s)
 * - error: Red error icon with error message and retry button
 */
export const FieldSaveIndicator: React.FC<FieldSaveIndicatorProps> = ({
  status,
  error,
  onRetry,
  size = "sm",
  className,
}) => {
  // Don't render anything for idle state
  if (status === "idle") {
    return null;
  }

  const sizeClass = size === "sm" ? styles.small : styles.medium;

  return (
    <div className={`${styles.indicator} ${sizeClass} ${className || ""}`}>
      {status === "saving" && (
        <InlineLoading
          status="active"
          description="儲存中..."
          className={styles.loading}
        />
      )}

      {status === "saved" && (
        <span className={styles.saved}>
          <Checkmark size={16} className={styles.icon} />
          <span className={styles.text}>已儲存</span>
        </span>
      )}

      {status === "error" && (
        <span className={styles.error}>
          <ErrorFilled size={16} className={styles.icon} />
          <span className={styles.text}>{error || "儲存失敗"}</span>
          {onRetry && (
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              iconDescription="重試"
              renderIcon={Renew}
              onClick={onRetry}
              className={styles.retryButton}
            />
          )}
        </span>
      )}
    </div>
  );
};

export default FieldSaveIndicator;
