import React, { useRef, useState } from "react";
import {
  Modal,
  TextArea,
  InlineNotification,
  Button,
  Tag,
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
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState<{
    valid: string[];
    duplicated: string[];
    invalid: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    added: string[];
    already_exists: string[];
    not_found: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildPreview = (rawText: string) => {
    const source = rawText
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const duplicated: string[] = [];
    const invalid: string[] = [];

    source.forEach((username) => {
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        invalid.push(username);
        return;
      }
      if (seen.has(username)) {
        duplicated.push(username);
        return;
      }
      seen.add(username);
      valid.push(username);
    });

    setPreview({ valid, duplicated, invalid });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setCsvName(file.name);
    setText((prev) => (prev ? `${prev}\n${content}` : content));
    setPreview(null);
    setResult(null);
    event.target.value = "";
  };

  const handleSubmit = async () => {
    const usernames = preview?.valid ?? [];
    if (usernames.length === 0) return;

    setSubmitting(true);
    try {
      const res = await addMembers(classroomId, usernames);
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
    setPreview(null);
    setCsvName("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      modalHeading="新增成員（先預覽再提交）"
      primaryButtonText={submitting ? "處理中..." : "確認新增"}
      primaryButtonDisabled={submitting || !preview || preview.valid.length === 0}
      secondaryButtonText="取消"
    >
      <TextArea
        id="add-members-textarea"
        labelText="輸入 username（逗號、換行或分號分隔）"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setResult(null);
        }}
        rows={5}
        placeholder="student1&#10;student2&#10;student3"
      />
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          匯入 CSV
        </Button>
        <input
          ref={fileInputRef}
          id="add-members-csv-input"
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        {csvName ? <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>已載入：{csvName}</span> : null}
        <Button
          kind="ghost"
          size="sm"
          onClick={() => buildPreview(text)}
          disabled={!text.trim()}
        >
          預覽名單
        </Button>
      </div>
      <p style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
        新增後預設為一般成員。若需調整為 TA，請在成員管理頁後續調整角色。
      </p>

      {preview && (
        <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="green">可提交 {preview.valid.length}</Tag>
            <Tag type="gray">重複 {preview.duplicated.length}</Tag>
            <Tag type="red">格式錯誤 {preview.invalid.length}</Tag>
          </div>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
            送出時只會提交「可提交」名單。結果會在下方顯示新增/已存在/找不到明細。
          </p>
        </div>
      )}

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
