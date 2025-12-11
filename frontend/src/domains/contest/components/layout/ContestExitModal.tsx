import React from "react";
import { Modal } from "@carbon/react";
import { WarningAlt } from "@carbon/icons-react";
import type { ContestDetail } from "@/core/entities/contest.entity";

interface ContestExitModalProps {
  open: boolean;
  contest: ContestDetail | null;
  shouldWarnOnExit: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Modal shown when user attempts to exit a contest.
 * Shows different messages based on user role and exam status.
 */
const ContestExitModal: React.FC<ContestExitModalProps> = ({
  open,
  contest,
  shouldWarnOnExit,
  onClose,
  onConfirm,
}) => {
  const getExitMessage = () => {
    // Teacher/Admin
    if (
      contest?.currentUserRole === "teacher" ||
      contest?.currentUserRole === "admin"
    ) {
      return "確定要離開競賽管理頁面嗎？";
    }

    // Student - Not joined
    if (!contest?.hasJoined && !contest?.isRegistered) {
      return "確定要離開競賽頁面嗎？";
    }

    // Student - Joined but exam not started (or submitted)
    if (
      !contest?.status ||
      contest.status === "inactive" ||
      contest.examStatus === "submitted" ||
      contest.examStatus === "not_started"
    ) {
      return "確定要離開競賽頁面嗎？";
    }

    // Student - Exam in progress, paused, or locked (warn about auto-submit)
    return (
      <span>
        <strong
          style={{
            color: "var(--cds-support-error)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <WarningAlt size={16} /> 警告：離開將會自動交卷！
        </strong>
        <br />
        <br />
        您的考試狀態為「
        {contest?.examStatus === "in_progress"
          ? "進行中"
          : contest?.examStatus === "paused"
          ? "暫停中"
          : "已鎖定"}
        」。
        <br />
        確認離開後，系統將自動為您交卷，您將無法再作答。
        <br />
        <br />
        確定要交卷並離開嗎？
      </span>
    );
  };

  return (
    <Modal
      open={open}
      modalHeading={shouldWarnOnExit ? "確認交卷並離開" : "確認離開競賽"}
      primaryButtonText={shouldWarnOnExit ? "交卷並離開" : "確認離開"}
      secondaryButtonText="取消"
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      danger={shouldWarnOnExit}
    >
      <p>{getExitMessage()}</p>
    </Modal>
  );
};

export default ContestExitModal;
