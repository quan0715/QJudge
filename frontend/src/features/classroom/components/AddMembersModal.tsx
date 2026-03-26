import React, { useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import {
  Modal,
  TextArea,
  InlineNotification,
  Button,
  Tag,
} from "@carbon/react";
import { addMembers } from "@/infrastructure/api/repositories/classroom.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import "./AddMembersModal.scss";

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
  const { t } = useTranslation("classroom");
  const { showToast } = useToast();
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
      showToast({
        kind: "error",
        title: t("addMembersFailed", "新增成員失敗"),
        subtitle: err instanceof Error ? err.message : t("loadFailedHint", "請稍後再試"),
      });
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

  return ReactDOM.createPortal(
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
      <div className="classroom-add-members__actions-row">
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
          className="classroom-add-members__hidden-input"
          onChange={handleFileUpload}
        />
        {csvName ? <span className="classroom-add-members__csv-name">已載入：{csvName}</span> : null}
        <Button
          kind="ghost"
          size="sm"
          onClick={() => buildPreview(text)}
          disabled={!text.trim()}
        >
          預覽名單
        </Button>
      </div>
      <p className="classroom-add-members__hint">
        新增後預設為一般成員。若需調整為 TA，請在成員管理頁後續調整角色。
      </p>

      {preview && (
        <div className="classroom-add-members__preview">
          <div className="classroom-add-members__preview-tags">
            <Tag type="green">可提交 {preview.valid.length}</Tag>
            <Tag type="gray">重複 {preview.duplicated.length}</Tag>
            <Tag type="red">格式錯誤 {preview.invalid.length}</Tag>
          </div>
          <p className="classroom-add-members__hint classroom-add-members__hint--tight">
            送出時只會提交「可提交」名單。結果會在下方顯示新增/已存在/找不到明細。
          </p>
        </div>
      )}

      {result && (
        <div className="classroom-add-members__result">
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
    </Modal>,
    getModalPortalRoot(),
  ) as unknown as React.ReactElement;
};
