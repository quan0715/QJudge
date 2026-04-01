import React, { useCallback, useMemo, useRef, useState } from "react";
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
  reservedUsernames?: string[];
  onClose: () => void;
  onAdded: () => void;
}

export const AddMembersModal: React.FC<AddMembersModalProps> = ({
  open,
  classroomId,
  reservedUsernames = [],
  onClose,
  onAdded,
}) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
  const { showToast } = useToast();
  const reservedUsernameSet = useMemo(
    () => new Set(reservedUsernames.map((name) => name.trim()).filter(Boolean)),
    [reservedUsernames],
  );
  const [text, setText] = useState("");
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState<{
    valid: string[];
    duplicated: string[];
    invalid: string[];
    reserved: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    added: string[];
    already_exists: string[];
    not_found: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildPreview = useCallback((rawText: string) => {
    const source = rawText
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const duplicated: string[] = [];
    const invalid: string[] = [];
    const reserved: string[] = [];

    source.forEach((username) => {
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        invalid.push(username);
        return;
      }
      if (reservedUsernameSet.has(username)) {
        reserved.push(username);
        return;
      }
      if (seen.has(username)) {
        duplicated.push(username);
        return;
      }
      seen.add(username);
      valid.push(username);
    });

    setPreview({ valid, duplicated, invalid, reserved });
  }, [reservedUsernameSet]);

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
      modalHeading={t("addMembersModal.title")}
      primaryButtonText={submitting ? t("addMembersModal.processing") : t("addMembersModal.confirm")}
      primaryButtonDisabled={submitting || !preview || preview.valid.length === 0}
      secondaryButtonText={tc("button.cancel")}
    >
      <TextArea
        id="add-members-textarea"
        labelText={t("addMembersModal.usernameLabel")}
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
          {t("addMembersModal.importCsv")}
        </Button>
        <input
          ref={fileInputRef}
          id="add-members-csv-input"
          type="file"
          accept=".csv,text/csv"
          className="classroom-add-members__hidden-input"
          onChange={handleFileUpload}
        />
        {csvName ? <span className="classroom-add-members__csv-name">{t("addMembersModal.csvLoaded")}{csvName}</span> : null}
        <Button
          kind="ghost"
          size="sm"
          onClick={() => buildPreview(text)}
          disabled={!text.trim()}
        >
          {t("addMembersModal.preview")}
        </Button>
      </div>
      <p className="classroom-add-members__hint">
        {t("addMembersModal.hint")}
      </p>

      {preview && (
        <div className="classroom-add-members__preview">
          <div className="classroom-add-members__preview-tags">
            <Tag type="green">{t("addMembersModal.tagValid")} {preview.valid.length}</Tag>
            <Tag type="gray">{t("addMembersModal.tagDuplicated")} {preview.duplicated.length}</Tag>
            <Tag type="blue">{t("addMembersModal.tagReserved", "保留")} {preview.reserved.length}</Tag>
            <Tag type="red">{t("addMembersModal.tagInvalid")} {preview.invalid.length}</Tag>
          </div>
          <p className="classroom-add-members__hint classroom-add-members__hint--tight">
            {t("addMembersModal.previewHint")}
          </p>
        </div>
      )}

      {result && (
        <div className="classroom-add-members__result">
          {result.added.length > 0 && (
            <InlineNotification
              kind="success"
              title={`${t("addMembersModal.resultAdded")} ${result.added.length}${t("addMembersModal.personUnit")}`}
              subtitle={result.added.join(", ")}
              lowContrast
              hideCloseButton
            />
          )}
          {result.already_exists.length > 0 && (
            <InlineNotification
              kind="info"
              title={`${t("addMembersModal.resultExists")} ${result.already_exists.length}${t("addMembersModal.personUnit")}`}
              subtitle={result.already_exists.join(", ")}
              lowContrast
              hideCloseButton
            />
          )}
          {result.not_found.length > 0 && (
            <InlineNotification
              kind="warning"
              title={`${t("addMembersModal.resultNotFound")} ${result.not_found.length}${t("addMembersModal.personUnit")}`}
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
