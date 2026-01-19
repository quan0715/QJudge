import React, { useState } from "react";
import { Modal, TextInput, InlineNotification } from "@carbon/react";

import type { ContestDetail } from "@/core/entities/contest.entity";

export interface ContestRegistrationModalProps {
  open: boolean;
  contest: ContestDetail;
  onClose: () => void;
  onSubmit: (data: { nickname?: string; password?: string }) => void;
}

/**
 * 競賽報名確認 Modal
 * 支援私有競賽密碼輸入、匿名模式暱稱設定
 */
export const ContestRegistrationModal: React.FC<ContestRegistrationModalProps> = ({
  open,
  contest,
  onClose,
  onSubmit,
}) => {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    onSubmit({
      nickname: nickname || undefined,
      password: password || undefined,
    });
    // Reset form
    setNickname("");
    setPassword("");
  };

  const handleClose = () => {
    onClose();
    // Reset form
    setNickname("");
    setPassword("");
  };

  return (
    <Modal
      open={open}
      modalHeading="競賽報名"
      primaryButtonText="確認報名"
      secondaryButtonText="取消"
      onRequestSubmit={handleSubmit}
      onRequestClose={handleClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Confirmation message */}
        <p>確定要報名「{contest.name}」嗎？</p>

        {/* Private contest password input */}
        {contest.visibility === "private" && (
          <div>
            <p style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              此競賽為私有競賽，請輸入加入密碼。
            </p>
            <TextInput
              id="registration-password"
              labelText="密碼"
              type="password"
              placeholder="請輸入競賽密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        {/* Anonymous mode nickname input */}
        {contest.anonymousModeEnabled && (
          <div>
            <p style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              本競賽已啟用匿名模式，您可以設定一個暱稱。排行榜和提交列表將顯示您的暱稱而非真實帳號。
            </p>
            <TextInput
              id="registration-nickname"
              labelText="暱稱 (選填)"
              placeholder="留空則使用預設帳號名稱"
              value={nickname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNickname(e.target.value)
              }
              maxLength={50}
            />
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
                marginTop: "0.5rem",
              }}
            >
              您可以在報名後隨時修改暱稱。
            </p>
          </div>
        )}

        {/* Exam mode warning */}
        {contest.examModeEnabled && (
          <InlineNotification
            kind="warning"
            title="注意"
            subtitle="此競賽為考試模式，開始後將啟用防作弊監控。"
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
