import React from "react";
import { Modal, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestDetail } from "@/core/entities/contest.entity";

export interface ContestRegistrationModalProps {
  open: boolean;
  contest: ContestDetail;
  onClose: () => void;
  onSubmit: () => void;
}

/**
 * 競賽報名確認 Modal
 */
export const ContestRegistrationModal: React.FC<ContestRegistrationModalProps> = ({
  open,
  contest,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation("contest");

  const handleSubmit = () => {
    onSubmit();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      open={open}
      modalHeading={t("registration.title", "競賽報名")}
      primaryButtonText={t("registration.confirm", "確認報名")}
      secondaryButtonText={t("registration.cancel", "取消")}
      onRequestSubmit={handleSubmit}
      onRequestClose={handleClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Confirmation message */}
        <p>{t("registration.confirmMessage", { name: contest.name, defaultValue: `確定要報名「${contest.name}」嗎？` })}</p>

        {/* Exam mode warning */}
        {contest.cheatDetectionEnabled && (
          <InlineNotification
            kind="warning"
            title={t("registration.warningTitle", "注意")}
            subtitle={t(
              "registration.warningSubtitle",
              "此競賽已啟用作弊檢查，開始後將啟用防作弊監控。",
            )}
            lowContrast
            hideCloseButton
            style={{ marginTop: "0.5rem" }}
          />
        )}
      </div>
    </Modal>
  );
};

export default ContestRegistrationModal;
