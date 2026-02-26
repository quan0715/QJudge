import React from "react";
import { InlineLoading, Button } from "@carbon/react";
import { Checkmark, ErrorFilled, Renew } from "@carbon/icons-react";
import styles from "./FieldSaveIndicator.module.scss";

export type FieldSaveStatus = "idle" | "saving" | "saved" | "error";

export interface FieldSaveIndicatorProps {
  status: FieldSaveStatus;
  error?: string;
  onRetry?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export const FieldSaveIndicator: React.FC<FieldSaveIndicatorProps> = ({
  status,
  error,
  onRetry,
  size = "sm",
  className,
}) => {
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
