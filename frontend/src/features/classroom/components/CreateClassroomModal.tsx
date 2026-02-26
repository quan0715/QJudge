import React, { useState } from "react";
import { Modal, TextInput, TextArea } from "@carbon/react";

interface CreateClassroomModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}

export const CreateClassroomModal: React.FC<CreateClassroomModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(name.trim(), description.trim());
      setName("");
      setDescription("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      modalHeading="建立教室"
      primaryButtonText={submitting ? "建立中..." : "建立"}
      primaryButtonDisabled={submitting || !name.trim()}
      secondaryButtonText="取消"
    >
      <TextInput
        id="classroom-name"
        labelText="教室名稱"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例：資料結構 2026 秋"
      />
      <div style={{ marginTop: "1rem" }}>
        <TextArea
          id="classroom-description"
          labelText="描述（選填）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="課程簡介"
        />
      </div>
    </Modal>
  );
};
