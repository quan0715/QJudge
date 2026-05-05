import React, { useState } from "react";
import { Modal, TextInput, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ContestDetail } from "@/core/entities/contest.entity";

export interface ContestRegistrationModalProps {
  open: boolean;
  contest: ContestDetail;
  onClose: () => void;
  onSubmit: (data: { password?: string }) => void;
}

/**
 * 競賽報名確認 Modal
 * 支援私有競賽密碼輸入
 */
export const ContestRegistrationModal: React.FC<ContestRegistrationModalProps> = ({
  open,
  contest,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation("contest");
  const requiresPassword = contest.requiresPassword ?? contest.visibility === "private";
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    onSubmit({
      password: password || undefined,
    });
    setPassword("");
  };

  const handleClose = () => {
    onClose();
    setPassword("");
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

        {/* Password gate */}
        {requiresPassword && (
          <div>
            <p style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              {t("registration.requiresPasswordHint", "此競賽需要密碼才能加入。")}
            </p>
            <TextInput
              id="registration-password"
              labelText={t("registration.passwordLabel", "密碼")}
              type="password"
              placeholder={t("registration.passwordPlaceholder", "請輸入競賽密碼")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

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
