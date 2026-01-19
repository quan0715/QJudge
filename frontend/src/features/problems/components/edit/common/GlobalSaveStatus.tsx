import React from "react";
import { InlineLoading } from "@carbon/react";
import { Checkmark, ErrorFilled } from "@carbon/icons-react";
import type { GlobalSaveStatus as GlobalSaveStatusType } from "@/features/problems/hooks/useAutoSave";
import styles from "./GlobalSaveStatus.module.scss";

export interface GlobalSaveStatusProps {
  /** Current global save status */
  status: GlobalSaveStatusType;
  /** Additional class name */
  className?: string;
}

/**
 * GlobalSaveStatus - Shows overall save status in the header
 *
 * States:
 * - idle: Hidden
 * - saving: "儲存中..."
 * - saved: "所有變更已儲存"
 * - error: "部分變更儲存失敗"
 */
export const GlobalSaveStatus: React.FC<GlobalSaveStatusProps> = ({
  status,
  className,
}) => {
  // Don't render anything for idle state
  if (status === "idle") {
    return null;
  }

  return (
    <div className={`${styles.status} ${className || ""}`}>
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
          <span>所有變更已儲存</span>
        </span>
      )}

      {status === "error" && (
        <span className={styles.error}>
          <ErrorFilled size={16} className={styles.icon} />
          <span>部分變更儲存失敗</span>
        </span>
      )}
    </div>
  );
};

export default GlobalSaveStatus;
