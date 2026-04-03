import { useMemo, useState, type ChangeEvent } from "react";
import {
  Button,
  Checkbox,
  FileUploader,
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
  Tag,
  TextArea,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type {
  ExamQuestionImportMode,
  ExamQuestionImportPreviewResponse,
} from "@/infrastructure/api/repositories/examQuestions.repository";
import type {
  ExamQuestionJsonNormalizedQuestion,
  ExamQuestionJsonValidationError,
} from "./examQuestionJson";
import {
  buildExamQuestionImportPromptTemplate,
  parseExamQuestionJsonV1,
} from "./examQuestionJson";

interface ExamQuestionJsonImportModalProps {
  open: boolean;
  contestName: string;
  onClose: () => void;
  onPreviewImport: (payload: {
    payloadJson: string;
    importMode: ExamQuestionImportMode;
  }) => Promise<ExamQuestionImportPreviewResponse>;
  onApplyImport: (payload: {
    payloadJson: string;
    importMode: ExamQuestionImportMode;
    fingerprint?: string;
  }) => Promise<void>;
}

const PREVIEW_LIMIT = 6;

const TYPE_LABEL: Record<string, string> = {
  true_false: "T/F",
  single_choice: "Single",
  multiple_choice: "Multiple",
  short_answer: "Short",
  essay: "Essay",
};

type FileLike = File | { file?: File };

type FileChangeEventLike = {
  target?: {
    files?: FileList | FileLike[];
  };
};

type FileChangeDataLike = {
  addedFiles?: Array<{ file?: File }>;
  currentFiles?: Array<{ file?: File }>;
};

const extractFileFromEvent = (event: unknown, data?: unknown): File | null => {
  const changeData = data as FileChangeDataLike | undefined;
  const fromAdded = changeData?.addedFiles?.[0]?.file;
  if (fromAdded instanceof File) {
    return fromAdded;
  }

  const fromCurrent = changeData?.currentFiles?.[0]?.file;
  if (fromCurrent instanceof File) {
    return fromCurrent;
  }

  const targetFiles = (event as FileChangeEventLike)?.target?.files;
  if (!targetFiles) {
    return null;
  }

  const firstRaw = Array.isArray(targetFiles) ? targetFiles[0] : targetFiles[0];
  if (firstRaw instanceof File) {
    return firstRaw;
  }
  if (
    firstRaw &&
    typeof firstRaw === "object" &&
    "file" in firstRaw &&
    (firstRaw as { file?: unknown }).file instanceof File
  ) {
    return (firstRaw as { file: File }).file;
  }
  return null;
};

const ExamQuestionJsonImportModal = ({
  open,
  contestName,
  onClose,
  onPreviewImport,
  onApplyImport,
}: ExamQuestionJsonImportModalProps) => {
  const { t } = useTranslation("contest");
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<ExamQuestionImportMode>("append");
  const [errors, setErrors] = useState<ExamQuestionJsonValidationError[]>([]);
  const [submitError, setSubmitError] = useState<string>("");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ExamQuestionJsonNormalizedQuestion[] | null>(
    null,
  );
  const [parsedPayloadJson, setParsedPayloadJson] = useState<string>("");
  const [previewResult, setPreviewResult] = useState<ExamQuestionImportPreviewResponse | null>(null);
  const [replaceAllConfirmed, setReplaceAllConfirmed] = useState(false);

  const totalScore = useMemo(
    () => (parsedQuestions ? parsedQuestions.reduce((sum, question) => sum + question.score, 0) : 0),
    [parsedQuestions],
  );

  const typeStats = useMemo(() => {
    if (!parsedQuestions) return [];
    const map = new Map<string, number>();
    parsedQuestions.forEach((question) => {
      const key = question.question_type;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries());
  }, [parsedQuestions]);

  const canStartPreview = !!parsedQuestions && parsedQuestions.length > 0 && !parsing;
  const canApply = !!previewResult && canStartPreview;
  const needsReplaceAllConfirm =
    importMode === "replace_all" && (previewResult?.summary.will_delete ?? 0) > 0;

  const resetState = () => {
    setFileName("");
    setPastedJsonText("");
    setParsing(false);
    setPreviewing(false);
    setImporting(false);
    setImportMode("append");
    setErrors([]);
    setSubmitError("");
    setCopiedPrompt(false);
    setParsedQuestions(null);
    setParsedPayloadJson("");
    setPreviewResult(null);
    setReplaceAllConfirmed(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseContent = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      setParsing(false);
      setErrors([]);
      setSubmitError("");
      setParsedQuestions(null);
      setParsedPayloadJson("");
      setPreviewResult(null);
      setReplaceAllConfirmed(false);
      return;
    }

    setParsing(true);
    setErrors([]);
    setSubmitError("");
    setParsedQuestions(null);
    setParsedPayloadJson("");
    setPreviewResult(null);
    setReplaceAllConfirmed(false);

    const result = parseExamQuestionJsonV1(trimmed);
    if (result.success && result.data) {
      setParsedQuestions(result.data.questions);
      setParsedPayloadJson(trimmed);
      setErrors([]);
    } else {
      setErrors(result.errors ?? [{ field: "json", message: t("examJson.import.errors.invalidJson") }]);
    }
    setParsing(false);
  };

  const [pastedJsonText, setPastedJsonText] = useState("");

  const handleFileChange = (event: unknown, data?: unknown) => {
    const file = extractFileFromEvent(event, data);
    if (!file) {
      setErrors([{ field: "file", message: t("examJson.import.errors.fileReadFailed") }]);
      return;
    }

    setFileName(file.name);
    setPastedJsonText("");
    setParsing(true);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = typeof loadEvent.target?.result === "string" ? loadEvent.target.result : "";
      parseContent(content);
    };

    reader.onerror = () => {
      setErrors([{ field: "file", message: t("examJson.import.errors.fileReadFailed") }]);
      setParsing(false);
    };

    reader.readAsText(file);
  };

  const handlePasteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const content = event.target.value;
    setPastedJsonText(content);
    if (content.trim()) {
      setFileName("");
    }
    parseContent(content);
  };

  const handleModeChange = (value: unknown) => {
    const normalized = String(value ?? "append") as ExamQuestionImportMode;
    setImportMode(normalized);
    setPreviewResult(null);
    setReplaceAllConfirmed(false);
    setSubmitError("");
  };

  const handlePreview = async () => {
    if (!canStartPreview || !parsedPayloadJson) return;
    setPreviewing(true);
    setSubmitError("");
    try {
      const result = await onPreviewImport({
        payloadJson: parsedPayloadJson,
        importMode,
      });
      setPreviewResult(result);
      setReplaceAllConfirmed(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("examJson.import.errors.importFailed");
      setSubmitError(message);
      setPreviewResult(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!parsedPayloadJson) return;

    if (!previewResult) {
      await handlePreview();
      return;
    }

    if (needsReplaceAllConfirm && !replaceAllConfirmed) {
      return;
    }

    setImporting(true);
    setSubmitError("");
    try {
      await onApplyImport({
        payloadJson: parsedPayloadJson,
        importMode,
        fingerprint: previewResult.fingerprint,
      });
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("examJson.import.errors.importFailed");
      setSubmitError(message);
    } finally {
      setImporting(false);
    }
  };

  const handleCopyPrompt = async () => {
    const text = buildExamQuestionImportPromptTemplate(contestName);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("examJson.import.errors.importFailed");
      setSubmitError(message);
    }
  };

  const primaryButtonText = previewResult
    ? importing
      ? t("examJson.import.importing")
      : t("examJson.import.confirmReplace")
    : previewing
      ? t("examJson.import.previewing", "預覽中...")
      : t("examJson.import.previewAction", "預覽變更");

  const primaryButtonDisabled =
    !canStartPreview ||
    parsing ||
    previewing ||
    importing ||
    (previewResult !== null && needsReplaceAllConfirm && !replaceAllConfirmed);

  return (
    <Modal
      open={open}
      modalHeading={t("examJson.import.title")}
      primaryButtonText={primaryButtonText}
      secondaryButtonText={t("examJson.import.cancel")}
      onRequestClose={handleClose}
      onRequestSubmit={() => void handleSubmit()}
      primaryButtonDisabled={primaryButtonDisabled}
      size="lg"
      danger={importMode === "replace_all"}
    >
      <p style={{ marginBottom: "0.75rem", color: "var(--cds-text-secondary)" }}>
        {t("examJson.import.description")}
      </p>

      <div style={{ marginBottom: "0.75rem" }}>
        <Button kind="ghost" size="sm" onClick={() => void handleCopyPrompt()}>
          {t("examJson.import.copyPrompt", "複製 AI 提示詞")}
        </Button>
        {copiedPrompt && (
          <span style={{ marginLeft: "0.5rem", color: "var(--cds-text-success)" }}>
            {t("examJson.import.copyPromptDone", "已複製")}
          </span>
        )}
      </div>

      <RadioButtonGroup
        legendText={t("examJson.import.modeLegend", "選擇匯入模式")}
        name="import-mode"
        valueSelected={importMode}
        onChange={(value) => handleModeChange(value)}
        orientation="vertical"
      >
        <RadioButton
          id="import-mode-append"
          labelText={t("examJson.import.modeAppend", "追加（保留現有題目）")}
          value="append"
        />
        <RadioButton
          id="import-mode-replace-all"
          labelText={t("examJson.import.modeReplaceAll", "全部覆蓋（刪除現有題目）")}
          value="replace_all"
        />
        <RadioButton
          id="import-mode-replace-manual"
          labelText={t("examJson.import.modeReplaceManualOnly", "只覆蓋手動/JSON 題目，保留題庫匯入題")}
          value="replace_manual_only"
        />
      </RadioButtonGroup>

      <FileUploader
        labelTitle={t("examJson.import.uploadTitle")}
        labelDescription={t("examJson.import.uploadHint")}
        buttonLabel={t("examJson.import.chooseFile")}
        filenameStatus="edit"
        accept={[".json", "application/json"]}
        onChange={(event, data) => handleFileChange(event, data)}
        disabled={importing || previewing}
      />

      <TextArea
        id="exam-json-paste-input"
        labelText={t("examJson.import.pasteTitle")}
        helperText={t("examJson.import.pasteHint")}
        placeholder={t("examJson.import.pastePlaceholder")}
        rows={10}
        value={pastedJsonText}
        onChange={handlePasteChange}
        disabled={importing || previewing}
        style={{ marginTop: "1rem" }}
      />

      {fileName && (
        <p style={{ marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
          {t("examJson.import.selectedFile")}: <strong>{fileName}</strong>
        </p>
      )}

      {parsing && (
        <InlineNotification
          lowContrast
          kind="info"
          title={t("examJson.import.parsingTitle")}
          subtitle={t("examJson.import.parsingSubtitle")}
          style={{ marginTop: "1rem" }}
        />
      )}

      {previewing && (
        <InlineNotification
          lowContrast
          kind="info"
          title={t("examJson.import.previewingTitle", "預覽中")}
          subtitle={t("examJson.import.previewingSubtitle", "正在計算匯入變更")}
          style={{ marginTop: "1rem" }}
        />
      )}

      {errors.length > 0 && (
        <InlineNotification
          lowContrast
          kind="error"
          title={t("examJson.import.validationFailed")}
          subtitle={t("examJson.import.validationCount", { count: errors.length })}
          style={{ marginTop: "1rem" }}
        >
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
            {errors.map((error, index) => (
              <li key={`${error.field}-${index}`}>
                <strong>{error.field}</strong>: {error.message}
              </li>
            ))}
          </ul>
        </InlineNotification>
      )}

      {submitError && (
        <InlineNotification
          lowContrast
          kind="error"
          title={t("examJson.import.importFailedTitle")}
          subtitle={submitError}
          style={{ marginTop: "1rem" }}
        />
      )}

      {parsedQuestions && errors.length === 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h5 style={{ marginBottom: "0.75rem" }}>{t("examJson.import.previewTitle")}</h5>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <Tag type="blue">{t("examJson.import.previewQuestionCount", { count: parsedQuestions.length })}</Tag>
            <Tag type="teal">{t("examJson.import.previewTotalScore", { score: totalScore })}</Tag>
            {typeStats.map(([type, count]) => (
              <Tag key={type} type="gray">
                {(TYPE_LABEL[type] ?? type) + `: ${count}`}
              </Tag>
            ))}
          </div>

          {previewResult && (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <Tag type="green">{t("examJson.import.summaryAdd", "新增")}: {previewResult.summary.will_add}</Tag>
              <Tag type="red">{t("examJson.import.summaryDelete", "刪除")}: {previewResult.summary.will_delete}</Tag>
              <Tag type="gray">{t("examJson.import.summaryKeep", "保留")}: {previewResult.summary.will_keep}</Tag>
              <Tag type="cyan">
                {t("examJson.import.summaryScoreDelta", "總分變化")}: {previewResult.summary.score_delta}
              </Tag>
            </div>
          )}

          <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--cds-border-subtle-01)", padding: "0.5rem" }}>
            {parsedQuestions.slice(0, PREVIEW_LIMIT).map((question, index) => (
              <div
                key={`${question.order}-${index}`}
                style={{
                  padding: "0.5rem",
                  borderBottom:
                    index === Math.min(parsedQuestions.length, PREVIEW_LIMIT) - 1
                      ? "none"
                      : "1px solid var(--cds-border-subtle-01)",
                }}
              >
                <strong>
                  #{index + 1} {TYPE_LABEL[question.question_type] ?? question.question_type}
                </strong>
                <div style={{ color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                  {question.prompt.slice(0, 90)}
                  {question.prompt.length > 90 ? "..." : ""}
                </div>
                <div style={{ color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                  {t("examJson.import.previewScore", { score: question.score })}
                </div>
              </div>
            ))}
          </div>

          {parsedQuestions.length > PREVIEW_LIMIT && (
            <p style={{ marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
              {t("examJson.import.previewMore", { count: parsedQuestions.length - PREVIEW_LIMIT })}
            </p>
          )}

          {needsReplaceAllConfirm && (
            <div style={{ marginTop: "0.75rem" }}>
              <Checkbox
                id="replace-all-confirm"
                labelText={t(
                  "examJson.import.replaceAllConfirm",
                  "我了解此操作會刪除現有題目，並以匯入內容覆蓋",
                )}
                checked={replaceAllConfirmed}
                onChange={(_event, { checked }) => setReplaceAllConfirmed(!!checked)}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ExamQuestionJsonImportModal;
