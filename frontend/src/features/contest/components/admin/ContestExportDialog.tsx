import { useState, useEffect, useCallback } from "react";
import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  RadioButtonGroup,
  RadioButton,
  Dropdown,
  Checkbox,
  Button,
  InlineLoading,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import {
  downloadContestFile,
  downloadExamPaperFile,
} from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import type { ContestExportTarget } from "@/features/contest/modules/types";
import s from "./ContestExportDialog.module.scss";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ExportTarget = ContestExportTarget;

interface ContestExportDialogProps {
  open: boolean;
  onClose: () => void;
  contest: ContestDetail;
  contestId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ALL_EXPORT_TARGETS: readonly ExportTarget[] = [
  "exam-question",
  "exam-answer",
  "coding-pdf",
  "coding-markdown",
];

const isExportTarget = (value: unknown): value is ExportTarget =>
  typeof value === "string" &&
  ALL_EXPORT_TARGETS.includes(value as ExportTarget);

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

const getExportLoadingDescription = (target: ExportTarget): string => {
  switch (target) {
    case "exam-question":
      return "正在產生題目卷 PDF...";
    case "exam-answer":
      return "正在產生答案卷 PDF...";
    case "coding-pdf":
      return "正在產生 PDF...";
    case "coding-markdown":
      return "正在匯出 Markdown...";
    default:
      return "正在匯出...";
  }
};

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
  const contestModule = getContestTypeModule(contest.contestType);
  const availableTargets = contestModule.admin.getExportTargets(contest);

  // --- Shared state ---
  const [target, setTarget] = useState<ExportTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeAnswerArea, setIncludeAnswerArea] = useState(true);

  // --- Coding-specific ---
  const [language, setLanguage] = useState("zh-TW");
  const [scale, setScale] = useState(1.0);
  const [layout, setLayout] = useState<"normal" | "compact">("normal");

  const handleTargetChange = useCallback(
    (selection: unknown, event?: { target?: { value?: unknown } }) => {
      if (
        isExportTarget(selection) &&
        availableTargets.includes(selection)
      ) {
        setTarget(selection);
        return;
      }

      const eventValue = event?.target?.value;
      if (
        isExportTarget(eventValue) &&
        availableTargets.includes(eventValue)
      ) {
        setTarget(eventValue);
      }
    },
    [availableTargets]
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setTarget(null);
    setBusy(false);
    setIncludeAnswerArea(true);
    setLanguage("zh-TW");
    setScale(1.0);
    setLayout("normal");
  }, [open]);

  // --- Export handler ---
  const handleExport = useCallback(async () => {
    if (!target) return;
    if (!availableTargets.includes(target)) return;
    setBusy(true);
    try {
      if (target === "exam-question" || target === "exam-answer") {
        await downloadExamPaperFile(
          contestId,
          target === "exam-answer" ? "answer" : "question",
          language,
          scale,
          includeAnswerArea
        );
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
    contestId,
    language,
    scale,
    layout,
    contest.name,
    onClose,
    availableTargets,
  ]);

  const isExamTarget = target?.startsWith("exam-") ?? false;
  const isExamPaperTarget =
    target === "exam-question" || target === "exam-answer";
  const isCodingPdf = target === "coding-pdf";
  const hasSelectedTarget = target !== null;
  const exporting = busy;

  return (
    <ComposedModal open={open} onClose={onClose} size="md">
      <ModalHeader title="匯出檔案" />
      <ModalBody className={s.modalBody}>
        {/* Target selection */}
        <div className={s.fieldGroup}>
          <p className={s.sectionTitle}>{t("download.exportType")}</p>
          <p className={s.targetHelp}>{t("download.selectExportType")}</p>
          <RadioButtonGroup
            legendText=""
            name="export-target"
            valueSelected={target ?? undefined}
            onChange={(selection, _name, event) => handleTargetChange(selection, event)}
            orientation="vertical"
            className={s.radioList}
          >
            {availableTargets.map((value) => {
              if (value === "exam-question") {
                return (
                  <RadioButton
                    key="export-exam-question"
                    id="export-exam-question"
                    labelText="題目卷 — 僅包含題目與選項"
                    value="exam-question"
                    disabled={exporting}
                  />
                );
              }
              if (value === "exam-answer") {
                return (
                  <RadioButton
                    key="export-exam-answer"
                    id="export-exam-answer"
                    labelText="答案卷 — 包含題目、選項與正確答案"
                    value="exam-answer"
                    disabled={exporting}
                  />
                );
              }
              if (value === "coding-markdown") {
                return (
                  <RadioButton
                    key="export-coding-markdown"
                    id="export-coding-markdown"
                    labelText="Markdown — 題目匯出為 Markdown 檔案"
                    value="coding-markdown"
                    disabled={exporting}
                  />
                );
              }
              return (
                <RadioButton
                  key="export-coding-pdf"
                  id="export-coding-pdf"
                  labelText="PDF — 題目匯出為 PDF 檔案"
                  value="coding-pdf"
                  disabled={exporting}
                />
              );
            })}
          </RadioButtonGroup>
        </div>

        {hasSelectedTarget && (
          <div className={s.section}>
            <p className={s.sectionTitle}>{t("download.settings")}</p>
            {/* Paper exam options */}
            {isExamPaperTarget && (
              <div className={s.settingsStack}>
                <div className={s.fieldGroup}>
                  <p className={s.fieldLabel}>{t("download.language")}</p>
                  <RadioButtonGroup
                    name="export-language-exam"
                    valueSelected={language}
                    orientation="vertical"
                    className={s.radioList}
                    onChange={(value) => setLanguage(String(value))}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <RadioButton
                        key={`export-language-${option.id}`}
                        id={`export-language-${option.id}`}
                        labelText={option.label}
                        value={option.id}
                        disabled={exporting}
                      />
                    ))}
                  </RadioButtonGroup>
                </div>
                {target === "exam-question" && (
                  <div className={s.checkboxBlock}>
                    <Checkbox
                      id="include-answer-area"
                      labelText={t("download.includeAnswerArea")}
                      checked={includeAnswerArea}
                      onChange={(_event, { checked }) => setIncludeAnswerArea(checked)}
                      disabled={exporting}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Coding test PDF/Markdown options */}
            {!isExamTarget && (
              <div className={s.settingsStack}>
                <Dropdown
                  id="export-language"
                  titleText={t("download.language")}
                  label={t("download.selectLanguage")}
                  items={LANGUAGE_OPTIONS}
                  itemToString={(item) => item?.label ?? ""}
                  selectedItem={LANGUAGE_OPTIONS.find((l) => l.id === language)}
                  onChange={({ selectedItem }) => { if (selectedItem) setLanguage(selectedItem.id); }}
                  disabled={exporting}
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
                      disabled={exporting}
                    />
                    <Dropdown
                      id="export-layout"
                      titleText={t("download.layout")}
                      label={t("download.selectLayout")}
                      items={LAYOUT_OPTIONS}
                      itemToString={(item) => item?.label ?? ""}
                      selectedItem={LAYOUT_OPTIONS.find((l) => l.id === layout)}
                      onChange={({ selectedItem }) => { if (selectedItem) setLayout(selectedItem.id); }}
                      disabled={exporting}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {exporting && (
          <div className={s.loadingArea} aria-live="polite">
            <InlineLoading description={getExportLoadingDescription(target ?? "coding-pdf")} />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose} disabled={exporting}>
          取消
        </Button>
        <Button
          kind="primary"
          disabled={exporting || !hasSelectedTarget}
          onClick={handleExport}
        >
          {exporting ? "匯出中..." : "匯出"}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
}
