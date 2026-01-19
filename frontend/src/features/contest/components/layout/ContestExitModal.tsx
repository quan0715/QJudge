import React from "react";
import { Modal } from "@carbon/react";
import { WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { isContestEnded } from "@/core/entities/contest.entity";

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
  const { t } = useTranslation("contest");
  const hasEnded = contest ? isContestEnded(contest) : false;
  const { t: tc } = useTranslation("common");

  const getExamStatusLabel = () => {
    if (contest?.examStatus === "in_progress") {
      return t("exitModal.examStatusInProgress");
    }
    if (contest?.examStatus === "paused") {
      return t("exitModal.examStatusPaused");
    }
    return t("exitModal.examStatusLocked");
  };

  const getExitMessage = () => {
    // Teacher/Admin
    if (
      contest?.currentUserRole === "teacher" ||
      contest?.currentUserRole === "admin"
    ) {
      return t("exitModal.teacherAdminExit");
    }

    // Student - Not joined
    if (!contest?.hasJoined && !contest?.isRegistered) {
      return t("exitModal.studentNotJoined");
    }

    // Student - Joined but exam not started (or submitted)
    if (
      !contest?.status ||
      contest.status !== "published" ||
      hasEnded ||
      contest.examStatus === "submitted" ||
      contest.examStatus === "not_started"
    ) {
      return t("exitModal.studentNotJoined");
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
          <WarningAlt size={16} /> {t("exitModal.warningAutoSubmit")}
        </strong>
        <br />
        <br />
        {t("exitModal.examStatusLabel", {
          status: getExamStatusLabel(),
        })}
        <br />
        {t("exitModal.autoSubmitWarning")}
        <br />
        <br />
        {t("exitModal.confirmSubmitAndExitQuestion")}
      </span>
    );
  };

  return (
    <Modal
      open={open}
      modalHeading={
        shouldWarnOnExit
          ? t("exitModal.confirmSubmitAndExit")
          : t("exitModal.confirmExit")
      }
      primaryButtonText={
        shouldWarnOnExit
          ? t("exitModal.submitAndExit")
          : t("exitModal.confirmExitBtn")
      }
      secondaryButtonText={tc("button.cancel")}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      danger={shouldWarnOnExit}
    >
      <p>{getExitMessage()}</p>
    </Modal>
  );
};

export default ContestExitModal;
