import React, { useState } from "react";
import { Modal, TextInput } from "@carbon/react";

export type AddUserRole = "admin" | "participant";

interface AddUserModalProps {
  role: AddUserRole;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => Promise<void>;
}

const ROLE_COPY: Record<
  AddUserRole,
  {
    heading: string;
    label: string;
    placeholder: string;
    helper?: string;
  }
> = {
  admin: {
    heading: "新增管理員",
    label: "用戶名",
    placeholder: "輸入用戶名",
    helper: "管理員可以管理競賽設定、參賽者和題目，但無法新增或移除其他管理員。",
  },
  participant: {
    heading: "新增參賽者",
    label: "使用者名稱 (Username)",
    placeholder: "輸入要加入的使用者名稱",
  },
};

export const AddUserModal: React.FC<AddUserModalProps> = ({
  role,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const copy = ROLE_COPY[role];

  const resetAndClose = () => {
    setUsername("");
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      await onSubmit(trimmed);
      resetAndClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      modalHeading={copy.heading}
      primaryButtonText={adding ? "新增中..." : "新增"}
      secondaryButtonText="取消"
      onRequestClose={resetAndClose}
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={adding || !username.trim()}
    >
      <TextInput
        id={`${role}-username`}
        labelText={copy.label}
        placeholder={copy.placeholder}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      {copy.helper && (
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
          {copy.helper}
        </p>
      )}
    </Modal>
  );
};

export default AddUserModal;
