import { useMemo, useState, type ChangeEvent } from "react";
import {
  Modal,
  FileUploader,
  TextArea,
  InlineNotification,
  Tag,
  RadioButtonGroup,
  RadioButton,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type {
  ExamQuestionJsonNormalizedQuestion,
  ExamQuestionJsonValidationError,
} from "./examQuestionJson";
import { parseExamQuestionJsonV1 } from "./examQuestionJson";

interface ExamQuestionJsonImportModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmImport: (questions: ExamQuestionJsonNormalizedQuestion[]) => Promise<void>;
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
  onClose,
  onConfirmImport,
}: ExamQuestionJsonImportModalProps) => {
  const { t } = useTranslation("contest");
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importTarget, setImportTarget] = useState<"exam-json">("exam-json");
  const [errors, setErrors] = useState<ExamQuestionJsonValidationError[]>([]);
  const [submitError, setSubmitError] = useState<string>("");
  const [parsedQuestions, setParsedQuestions] = useState<ExamQuestionJsonNormalizedQuestion[] | null>(
    null,
  );

  const handleImportTargetChange = (value: unknown) => {
    const extracted =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "target" in value
          ? (value as { target?: { value?: unknown } }).target?.value
          : undefined;

    if (extracted === "exam-json") {
      setImportTarget("exam-json");
    }
  };

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

  const resetState = () => {
    setFileName("");
    setPastedJsonText("");
    setParsing(false);
    setImporting(false);
    setImportTarget("exam-json");
    setErrors([]);
    setSubmitError("");
    setParsedQuestions(null);
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
      return;
    }

    setParsing(true);
    setErrors([]);
    setSubmitError("");
    setParsedQuestions(null);

    const result = parseExamQuestionJsonV1(trimmed);
    if (result.success && result.data) {
      setParsedQuestions(result.data.questions);
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

  const handleConfirmImport = async () => {
    if (!parsedQuestions || parsedQuestions.length === 0) return;
    setImporting(true);
    setSubmitError("");
    try {
      await onConfirmImport(parsedQuestions);
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("examJson.import.errors.importFailed");
      setSubmitError(message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={t("examJson.import.title")}
      primaryButtonText={importing ? t("examJson.import.importing") : t("examJson.import.confirmReplace")}
      secondaryButtonText={t("examJson.import.cancel")}
      onRequestClose={handleClose}
      onRequestSubmit={handleConfirmImport}
      primaryButtonDisabled={!parsedQuestions || parsing || importing}
      size="lg"
      danger
    >
      <p style={{ marginBottom: "0.75rem", color: "var(--cds-text-secondary)" }}>
        {t("examJson.import.description")}
      </p>

      <RadioButtonGroup
        legendText={t("examJson.import.targetLegend")}
        name="import-target"
        valueSelected={importTarget}
        onChange={(value) => handleImportTargetChange(value)}
        orientation="vertical"
      >
        <RadioButton
          id="import-exam-json"
          labelText={t("examJson.import.targetExamJson")}
          value="exam-json"
        />
      </RadioButtonGroup>

      <FileUploader
        labelTitle={t("examJson.import.uploadTitle")}
        labelDescription={t("examJson.import.uploadHint")}
        buttonLabel={t("examJson.import.chooseFile")}
        filenameStatus="edit"
        accept={[".json", "application/json"]}
        onChange={(event, data) => handleFileChange(event, data)}
        disabled={importing}
      />

      <TextArea
        id="exam-json-paste-input"
        labelText={t("examJson.import.pasteTitle")}
        helperText={t("examJson.import.pasteHint")}
        placeholder={t("examJson.import.pastePlaceholder")}
        rows={10}
        value={pastedJsonText}
        onChange={handlePasteChange}
        disabled={importing}
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
        </div>
      )}
    </Modal>
  );
};

export default ExamQuestionJsonImportModal;
