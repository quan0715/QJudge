import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import {
  Modal,
  TextArea,
  InlineNotification,
  Button,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
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
  const normalizeToken = (value: string) =>
    value.replace(/^\ufeff/, "").trim().replace(/^["']+|["']+$/g, "");

  const isEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);

  const isIdentifier = (value: string) =>
    isEmail(value) || /^[^\s,;\t]+$/u.test(value);

  const normalizeIdentifierKey = (value: string) => {
    const normalized = normalizeToken(value);
    return normalized.toLowerCase();
  };

  const reservedUsernameSet = useMemo(
    () =>
      new Set(
        reservedUsernames
          .map((name) => normalizeIdentifierKey(name))
          .filter(Boolean),
      ),
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

  const parseManualTokens = (rawText: string) =>
    rawText
      .split(/[\n,;\t]+/)
      .flatMap((line) => {
        const normalizedLine = line.trim();
        if (!normalizedLine) return [];
        if (!normalizedLine.includes(",")) {
          return [normalizedLine];
        }
        return normalizedLine.split(",");
      })
      .map(normalizeToken)
      .filter(Boolean);

  const parseCsvIdentifiers = (rawText: string) => {
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headerKeywords = new Set(["username", "user_name", "account", "email", "mail", "帳號", "信箱", "電子郵件"]);
    const identifiers: string[] = [];

    lines.forEach((line, index) => {
      const cells = line.split(/[,\t;]/).map(normalizeToken).filter(Boolean);
      if (cells.length === 0) return;
      const loweredCells = cells.map((cell) => cell.toLowerCase());
      const headerIndex = loweredCells.findIndex((cell) => headerKeywords.has(cell));

      if (index === 0 && headerIndex >= 0) {
        return;
      }

      if (headerIndex >= 0) {
        return;
      }

      if (
        lines.length === 1 &&
        cells.length > 1 &&
        cells.every(isIdentifier)
      ) {
        identifiers.push(...cells);
        return;
      }

      const preferred = cells.find(isEmail) ?? cells[0];
      if (preferred) identifiers.push(preferred);
    });

    return identifiers;
  };

  const summaryRows = useMemo(() => {
    if (result) {
      return [
        {
          label: t("addMembersModal.statusAdded", "已加入"),
          items: result.added,
          tagType: "green" as const,
        },
        {
          label: t("addMembersModal.statusPending", "未加入"),
          items: result.already_exists,
          tagType: "blue" as const,
        },
        {
          label: t("addMembersModal.statusNotFound", "帳號不存在"),
          items: result.not_found,
          tagType: "red" as const,
        },
        {
          label: t("addMembersModal.statusReserved", "保留名單"),
          items: preview?.reserved ?? [],
          tagType: "gray" as const,
        },
      ];
    }

    if (!preview) return null;

    return [
      {
        label: t("addMembersModal.statusAddable", "可加入"),
        items: preview.valid,
        tagType: "green" as const,
      },
      {
        label: t("addMembersModal.statusDuplicated", "重複"),
        items: preview.duplicated,
        tagType: "blue" as const,
      },
      {
        label: t("addMembersModal.statusInvalid", "格式錯誤"),
        items: preview.invalid,
        tagType: "red" as const,
      },
      {
        label: t("addMembersModal.statusReserved", "保留名單"),
        items: preview.reserved,
        tagType: "gray" as const,
      },
    ];
  }, [preview, result, t]);

  const buildPreview = (source: string[]) => {
    const seen = new Set<string>();
    const valid: string[] = [];
    const duplicated: string[] = [];
    const invalid: string[] = [];
    const reserved: string[] = [];

    source.forEach((username) => {
      if (!isIdentifier(username)) {
        invalid.push(username);
        return;
      }
      const key = normalizeIdentifierKey(username);
      if (reservedUsernameSet.has(username) || reservedUsernameSet.has(key)) {
        reserved.push(username);
        return;
      }
      if (seen.has(key)) {
        duplicated.push(username);
        return;
      }
      seen.add(key);
      valid.push(username);
    });

    setPreview({ valid, duplicated, invalid, reserved });
  };

  useEffect(() => {
    const tokens = parseManualTokens(text);
    if (tokens.length === 0) {
      setPreview(null);
      setResult(null);
      return;
    }
    buildPreview(tokens);
    setResult(null);
  }, [text, reservedUsernameSet]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const identifiers = parseCsvIdentifiers(content);
    setCsvName(file.name);
    setText((prev) => {
      const imported = identifiers.join("\n");
      if (!imported) return prev;
      return prev ? `${prev}\n${imported}` : imported;
    });
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
        showToast({
          kind: "success",
          title: t(
            "addMembersModal.successTitle",
            `成功新增 ${res.added.length} 人`,
          ),
          subtitle: res.added.join(", "),
        });
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
      </div>
      <p className="classroom-add-members__hint">
        {t(
          "addMembersModal.hint",
          "輸入 username 或 email。支援換行、逗號、分號、Tab，CSV 匯入後會自動檢查。",
        )}
      </p>

      {summaryRows && (
        <div className="classroom-add-members__result">
          {result?.added.length ? (
            <InlineNotification
              kind="success"
              title={t(
                "addMembersModal.successTitle",
                `成功新增 ${result.added.length} 人`,
              )}
              subtitle={result.added.join(", ")}
              lowContrast
              hideCloseButton
            />
          ) : null}

          <TableContainer
            title={result ? t("addMembersModal.resultTableTitle", "送出結果") : t("addMembersModal.previewTableTitle", "即時檢查結果")}
          >
            <Table useZebraStyles size="sm">
              <TableHead>
                <TableRow>
                  <TableHeader>{t("addMembersModal.tableStatus", "狀態")}</TableHeader>
                  <TableHeader>{t("addMembersModal.tableCount", "數量")}</TableHeader>
                  <TableHeader>{t("addMembersModal.tableMembers", "名單")}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>
                      <Tag type={row.tagType}>{row.label}</Tag>
                    </TableCell>
                    <TableCell>{row.items.length}</TableCell>
                    <TableCell>
                      <div className="classroom-add-members__table-items">
                        {row.items.length > 0 ? row.items.join(", ") : "—"}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {!result ? (
            <p className="classroom-add-members__hint classroom-add-members__hint--tight">
              {t("addMembersModal.previewHint", "下方表格會即時顯示已加入、未加入、帳號不存在與保留名單。")}
            </p>
          ) : null}
        </div>
      )}
    </Modal>,
    getModalPortalRoot(),
  ) as unknown as React.ReactElement;
};
