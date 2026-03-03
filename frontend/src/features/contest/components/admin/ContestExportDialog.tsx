import { useState, useEffect, useCallback } from "react";
import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  RadioButtonGroup,
  RadioButton,
  Dropdown,
  Button,
  InlineLoading,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { getExamQuestions, downloadContestFile } from "@/infrastructure/api/repositories";
import { useExamPdfExport } from "@/features/contest/components/admin/examEditor/pdf/useExamPdfExport";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import { stringifyExamQuestionJsonV1 } from "@/features/contest/components/admin/examEditor/examQuestionJson";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Flat value used by the radio group */
type ExportTarget =
  | "exam-question"   // Exam 題目卷
  | "exam-answer"     // Exam 答案卷
  | "exam-json"       // Exam JSON
  | "coding-pdf"      // Coding test PDF
  | "coding-markdown"; // Coding test Markdown

interface ContestExportDialogProps {
  open: boolean;
  onClose: () => void;
  contest: ContestDetail;
  contestId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const isExportTarget = (value: unknown): value is ExportTarget =>
  value === "exam-question" ||
  value === "exam-answer" ||
  value === "exam-json" ||
  value === "coding-pdf" ||
  value === "coding-markdown";

const sanitizeFilename = (name: string): string => {
  // eslint-disable-next-line no-control-regex
  const s = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/^[\s.]+|[\s.]+$/g, "");
  return (s.length > 200 ? s.substring(0, 200) : s) || "contest";
};

const SCALE_OPTIONS = [
  { id: 0.5, label: "50%" },
  { id: 0.75, label: "75%" },
  { id: 1.0, label: "100%" },
  { id: 1.25, label: "125%" },
  { id: 1.5, label: "150%" },
  { id: 2.0, label: "200%" },
];

const LANGUAGE_OPTIONS = [
  { id: "zh-TW", label: "中文（繁體）" },
  { id: "en", label: "English" },
];

const LAYOUT_OPTIONS = [
  { id: "normal" as const, label: "一般" },
  { id: "compact" as const, label: "緊湊" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ContestExportDialog({
  open,
  onClose,
  contest,
  contestId,
}: ContestExportDialogProps) {
  const { t } = useTranslation("contest");
  const isExamMode = contest.contestType === "paper_exam";

  // --- Shared state ---
  const defaultTarget: ExportTarget = isExamMode ? "exam-question" : "coding-pdf";
  const [target, setTarget] = useState<ExportTarget>(defaultTarget);
  const [busy, setBusy] = useState(false);

  // --- Exam-specific ---
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const { exportPdf: exportExamPdf, generating: examGenerating } = useExamPdfExport({
    contest,
    questions: examQuestions,
  });

  // --- Coding-specific ---
  const [language, setLanguage] = useState("zh-TW");
  const [scale, setScale] = useState(1.0);
  const [layout, setLayout] = useState<"normal" | "compact">("normal");

  const handleTargetChange = useCallback(
    (selection: unknown, event?: { target?: { value?: unknown } }) => {
      if (isExportTarget(selection)) {
        setTarget(selection);
        return;
      }

      const eventValue = event?.target?.value;
      if (isExportTarget(eventValue)) {
        setTarget(eventValue);
      }
    },
    []
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setTarget(isExamMode ? "exam-question" : "coding-pdf");
    setBusy(false);
  }, [open, isExamMode]);

  // Load exam questions when dialog opens (exam mode only)
  useEffect(() => {
    if (!open || !isExamMode) return;
    let cancelled = false;
    (async () => {
      setLoadingQuestions(true);
      try {
        const list = await getExamQuestions(contestId);
        if (!cancelled) setExamQuestions(list.sort((a, b) => a.order - b.order));
      } catch {
        if (!cancelled) setExamQuestions([]);
      } finally {
        if (!cancelled) setLoadingQuestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isExamMode, contestId]);

  // --- Export handler ---
  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      if (target === "exam-question" || target === "exam-answer") {
        await exportExamPdf(target === "exam-answer" ? "answer" : "question");
      } else if (target === "exam-json") {
        const safeName = sanitizeFilename(contest.name);
        const content = stringifyExamQuestionJsonV1(examQuestions, contest.name);
        const blob = new Blob([content], { type: "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_exam_questions.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const format = target === "coding-pdf" ? "pdf" as const : "markdown" as const;
        const blob = await downloadContestFile(contestId, format, language, scale, layout);
        const ext = format === "pdf" ? "pdf" : "md";
        const safeName = sanitizeFilename(contest.name);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_題目.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }, [
    target,
    exportExamPdf,
    examQuestions,
    contestId,
    language,
    scale,
    layout,
    contest.name,
    onClose,
  ]);

  const isExamTarget = target === "exam-question" || target === "exam-answer" || target === "exam-json";
  const isCodingPdf = target === "coding-pdf";
  const noExamQuestions = isExamMode && !loadingQuestions && examQuestions.length === 0;
  const exporting = busy || examGenerating;

  return (
    <ComposedModal open={open} onClose={onClose} size="sm">
      <ModalHeader title="匯出檔案" />
      <ModalBody>
        {/* Loading state for exam questions */}
        {isExamMode && loadingQuestions && (
          <InlineLoading description="載入題目中..." />
        )}

        {/* No exam questions */}
        {isExamMode && noExamQuestions && (
          <p style={{ color: "var(--cds-text-secondary)" }}>
            目前沒有題目，請先新增題目後再匯出。
          </p>
        )}

        {/* Target selection */}
        {!(isExamMode && (loadingQuestions || noExamQuestions)) && (
          <>
            <RadioButtonGroup
              legendText="選擇匯出內容"
              name="export-target"
              valueSelected={target}
              onChange={(selection, _name, event) => handleTargetChange(selection, event)}
              orientation="vertical"
            >
              {isExamMode
                ? [
                    <RadioButton
                      key="export-exam-question"
                      id="export-exam-question"
                      labelText="題目卷 — 僅包含題目與選項"
                      value="exam-question"
                    />,
                    <RadioButton
                      key="export-exam-answer"
                      id="export-exam-answer"
                      labelText="答案卷 — 包含題目、選項與正確答案"
                      value="exam-answer"
                    />,
                    <RadioButton
                      key="export-exam-json"
                      id="export-exam-json"
                      labelText={`${t("examJson.exportOption")} — 匯出可重新匯入的題目檔`}
                      value="exam-json"
                    />,
                  ]
                : [
                    <RadioButton
                      key="export-coding-pdf"
                      id="export-coding-pdf"
                      labelText="PDF — 題目匯出為 PDF 檔案"
                      value="coding-pdf"
                    />,
                    <RadioButton
                      key="export-coding-markdown"
                      id="export-coding-markdown"
                      labelText="Markdown — 題目匯出為 Markdown 檔案"
                      value="coding-markdown"
                    />,
                  ]}
            </RadioButtonGroup>

            {/* Coding test PDF/Markdown options */}
            {!isExamTarget && (
              <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <Dropdown
                  id="export-language"
                  titleText={t("download.language")}
                  label={t("download.selectLanguage")}
                  items={LANGUAGE_OPTIONS}
                  itemToString={(item) => item?.label ?? ""}
                  selectedItem={LANGUAGE_OPTIONS.find((l) => l.id === language)}
                  onChange={({ selectedItem }) => { if (selectedItem) setLanguage(selectedItem.id); }}
                />

                {isCodingPdf && (
                  <>
                    <Dropdown
                      id="export-scale"
                      titleText={t("download.scale")}
                      label={t("download.selectScale")}
                      items={SCALE_OPTIONS}
                      itemToString={(item) => item?.label ?? ""}
                      selectedItem={SCALE_OPTIONS.find((s) => s.id === scale)}
                      onChange={({ selectedItem }) => { if (selectedItem) setScale(selectedItem.id); }}
                    />
                    <Dropdown
                      id="export-layout"
                      titleText={t("download.layout")}
                      label={t("download.selectLayout")}
                      items={LAYOUT_OPTIONS}
                      itemToString={(item) => item?.label ?? ""}
                      selectedItem={LAYOUT_OPTIONS.find((l) => l.id === layout)}
                      onChange={({ selectedItem }) => { if (selectedItem) setLayout(selectedItem.id); }}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          取消
        </Button>
        <Button
          kind="primary"
          disabled={exporting || (isExamMode && (loadingQuestions || noExamQuestions))}
          onClick={handleExport}
        >
          {exporting ? "匯出中..." : "匯出"}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
