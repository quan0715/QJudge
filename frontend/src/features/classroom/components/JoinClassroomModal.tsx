import React, { useState } from "react";
import { Modal, TextInput, InlineNotification } from "@carbon/react";
import { joinClassroom } from "@/infrastructure/api/repositories/classroom.repository";

interface JoinClassroomModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: () => void;
}

export const JoinClassroomModal: React.FC<JoinClassroomModalProps> = ({
  open,
  onClose,
  onJoined,
}) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await joinClassroom(code.trim());
      setCode("");
      onJoined();
    } catch (err: any) {
      setError(err?.message || "加入失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setError("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      modalHeading="加入教室"
      primaryButtonText={submitting ? "加入中..." : "加入"}
      primaryButtonDisabled={submitting || !code.trim()}
      secondaryButtonText="取消"
    >
      <TextInput
        id="join-code-input"
        labelText="邀請碼"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={8}
        placeholder="輸入 8 位邀請碼"
      />
      {error && (
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={error}
          lowContrast
          hideCloseButton
          style={{ marginTop: "1rem" }}
        />
      )}
    </Modal>
  );
};
