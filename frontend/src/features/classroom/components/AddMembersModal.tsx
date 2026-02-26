import React, { useState } from "react";
import {
  Modal,
  TextArea,
  RadioButtonGroup,
  RadioButton,
  InlineNotification,
} from "@carbon/react";
import { addMembers } from "@/infrastructure/api/repositories/classroom.repository";

interface AddMembersModalProps {
  open: boolean;
  classroomId: string;
  onClose: () => void;
  onAdded: () => void;
}

export const AddMembersModal: React.FC<AddMembersModalProps> = ({
  open,
  classroomId,
  onClose,
  onAdded,
}) => {
  const [text, setText] = useState("");
  const [role, setRole] = useState<"student" | "ta">("student");
  const [result, setResult] = useState<{
    added: string[];
    already_exists: string[];
    not_found: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const usernames = text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (usernames.length === 0) return;

    setSubmitting(true);
    try {
      const res = await addMembers(classroomId, usernames, role);
      setResult(res);
      if (res.added.length > 0) {
        onAdded();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setText("");
    setResult(null);
    setRole("student");
    onClose();
  };

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      modalHeading="新增成員"
      primaryButtonText={submitting ? "處理中..." : "新增"}
      primaryButtonDisabled={submitting || !text.trim()}
      secondaryButtonText="取消"
    >
      <TextArea
        id="add-members-textarea"
        labelText="輸入 username（逗號、換行或分號分隔）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="student1&#10;student2&#10;student3"
      />
      <div style={{ marginTop: "1rem" }}>
        <RadioButtonGroup
          legendText="角色"
          name="member-role"
          valueSelected={role}
          onChange={(val) => setRole(val as "student" | "ta")}
        >
          <RadioButton labelText="Student" value="student" id="role-student" />
          <RadioButton labelText="TA" value="ta" id="role-ta" />
        </RadioButtonGroup>
      </div>

      {result && (
        <div style={{ marginTop: "1rem" }}>
          {result.added.length > 0 && (
            <InlineNotification
              kind="success"
              title={`已新增 ${result.added.length} 人`}
              subtitle={result.added.join(", ")}
              lowContrast
              hideCloseButton
            />
          )}
          {result.already_exists.length > 0 && (
            <InlineNotification
              kind="info"
              title={`已存在 ${result.already_exists.length} 人`}
              subtitle={result.already_exists.join(", ")}
              lowContrast
              hideCloseButton
            />
          )}
          {result.not_found.length > 0 && (
            <InlineNotification
              kind="warning"
              title={`找不到 ${result.not_found.length} 人`}
              subtitle={result.not_found.join(", ")}
              lowContrast
              hideCloseButton
            />
          )}
        </div>
      )}
    </Modal>
  );
};
