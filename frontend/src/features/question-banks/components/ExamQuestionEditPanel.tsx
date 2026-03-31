import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  TextArea,
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  IconButton,
} from "@carbon/react";
import { Add, TrashCan } from "@carbon/icons-react";
import { Section, FieldRow, ActionRow } from "@/shared/layout/SettingsPanel";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { Dropdown } from "@carbon/react";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import { updateQuestion } from "@/infrastructure/api/repositories/questionBank.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import { resolveExamQuestionTypeFromBankQuestion } from "@/shared/ui/questionVisual";
import { GlobalSaveIndicator } from "./GlobalSaveIndicator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTO_SAVE_DELAY = 800;
const TRUE_FALSE_OPTIONS = ["True", "False"];
const QUESTION_TYPE_ITEMS: Array<{ id: ExamQuestionType; label: string }> = [
  { id: "single_choice", label: "單選題" },
  { id: "multiple_choice", label: "多選題" },
  { id: "true_false", label: "是非題" },
  { id: "short_answer", label: "簡答題" },
  { id: "essay", label: "問答題" },
];

const isChoiceType = (t: ExamQuestionType) =>
  t === "true_false" || t === "single_choice" || t === "multiple_choice";

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------
interface ExamFormState {
  questionType: ExamQuestionType;
  prompt: string;
  score: number;
  options: string[];
  singleAnswer: number | null;
  multiAnswers: number[];
  shortAnswer: string;
  essayAnswer: string;
}

const toFormState = (q: BankQuestion): ExamFormState => {
  const qType = resolveExamQuestionTypeFromBankQuestion(q);
  const options = Array.isArray(q.options) ? q.options.map(String) : [];

  let singleAnswer: number | null = null;
  let multiAnswers: number[] = [];
  let shortAnswer = "";
  let essayAnswer = "";

  if (qType === "single_choice" || qType === "true_false") {
    singleAnswer = typeof q.correctAnswer === "number" ? q.correctAnswer : null;
  } else if (qType === "multiple_choice") {
    multiAnswers = Array.isArray(q.correctAnswer) ? (q.correctAnswer as number[]) : [];
  } else if (qType === "short_answer") {
    shortAnswer = q.correctAnswer != null ? String(q.correctAnswer) : "";
  } else if (qType === "essay") {
    essayAnswer = q.correctAnswer != null ? String(q.correctAnswer) : "";
  }

  return {
    questionType: qType,
    prompt: q.prompt || "",
    score: q.score ?? 1,
    options: qType === "true_false" ? [...TRUE_FALSE_OPTIONS] : options,
    singleAnswer,
    multiAnswers,
    shortAnswer,
    essayAnswer,
  };
};

const buildPayload = (form: ExamFormState, existing: BankQuestion): UpsertBankQuestionPayload => {
  const existingMeta =
    existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};

  let correctAnswer: unknown = null;
  if (form.questionType === "single_choice" || form.questionType === "true_false") {
    correctAnswer = form.singleAnswer;
  } else if (form.questionType === "multiple_choice") {
    correctAnswer = form.multiAnswers;
  } else if (form.questionType === "short_answer") {
    correctAnswer = form.shortAnswer || null;
  } else if (form.questionType === "essay") {
    correctAnswer = form.essayAnswer || null;
  }

  return {
    questionType: "exam",
    title: "",
    prompt: form.prompt.trim(),
    options:
      form.questionType === "true_false"
        ? [...TRUE_FALSE_OPTIONS]
        : isChoiceType(form.questionType)
          ? form.options
          : [],
    correctAnswer,
    score: form.score,
    order: existing.order,
    metadata: { ...existingMeta, exam_question_type: form.questionType },
  };
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ExamQuestionEditPanelProps {
  question: BankQuestion;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ExamQuestionEditPanel = ({ question, onSaved }: ExamQuestionEditPanelProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const [form, setForm] = useState<ExamFormState>(() => toFormState(question));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const latestRef = useRef(form);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync form when question prop changes (different question selected)
  useEffect(() => {
    const next = toFormState(question);
    setForm(next);
    latestRef.current = next;
    setSaveStatus("idle");
  }, [question.bankItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFields = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      const payload = buildPayload(latestRef.current, question);
      await updateQuestion(question.bankItemId, payload);
      setSaveStatus("saved");
      onSaved?.();
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveStatus("error");
      showToast({ kind: "error", title: t("message.error"), subtitle: t("message.saveFailed", "儲存失敗") });
    } finally {
      savingRef.current = false;
    }
  }, [question, onSaved, showToast, t]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveFields();
    }, AUTO_SAVE_DELAY);
  }, [saveFields]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void saveFields();
      }
    };
  }, [saveFields]);

  // --- Field updaters ---
  const update = (patch: Partial<ExamFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      latestRef.current = next;
      return next;
    });
    scheduleSave();
  };

  const handleTypeChange = (nextType: ExamQuestionType) => {
    const patch: Partial<ExamFormState> = { questionType: nextType };
    if (nextType === "true_false") {
      patch.options = [...TRUE_FALSE_OPTIONS];
      patch.singleAnswer = null;
      patch.multiAnswers = [];
    } else if (nextType === "essay" || nextType === "short_answer") {
      patch.options = [];
      patch.singleAnswer = null;
      patch.multiAnswers = [];
    } else if (nextType === "single_choice") {
      patch.options = form.options.length >= 2 ? form.options : ["", ""];
      patch.singleAnswer = null;
      patch.multiAnswers = [];
    } else if (nextType === "multiple_choice") {
      patch.options = form.options.length >= 2 ? form.options : ["", ""];
      patch.singleAnswer = null;
      patch.multiAnswers = [];
    }
    update(patch);
  };

  const addOption = () => update({ options: [...form.options, ""] });
  const updateOption = (i: number, value: string) => {
    const next = form.options.map((o, idx) => (idx === i ? value : o));
    update({ options: next });
  };
  const removeOption = (i: number) => {
    const nextOptions = form.options.filter((_, idx) => idx !== i);
    let nextSingle = form.singleAnswer;
    if (nextSingle === i) nextSingle = null;
    else if (nextSingle !== null && nextSingle > i) nextSingle--;
    const nextMulti = form.multiAnswers
      .filter((v) => v !== i)
      .map((v) => (v > i ? v - 1 : v));
    update({ options: nextOptions, singleAnswer: nextSingle, multiAnswers: nextMulti });
  };

  // --- Render ---
  return (
    <>
      <GlobalSaveIndicator status={saveStatus} />

      <Section title={t("questionBank.examType", "題型設定")}>
        <ActionRow label={t("questionBank.questionType", "題型")}>
          <Dropdown
            id="exam-question-type"
            label=""
            titleText=""
            hideLabel
            size="sm"
            items={QUESTION_TYPE_ITEMS}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={QUESTION_TYPE_ITEMS.find((i) => i.id === form.questionType) ?? QUESTION_TYPE_ITEMS[0]}
            onChange={({ selectedItem }) => {
              if (selectedItem) handleTypeChange(selectedItem.id);
            }}
          />
        </ActionRow>
{/* Score is set at contest level, not in the bank */}
      </Section>

      <Section title={t("questionBank.prompt", "題目內容")}>
        <FieldRow label={t("questionBank.promptLabel", "題幹")} description={t("questionBank.promptDesc", "支援 Markdown 與 LaTeX 語法")}>
          <MarkdownField
            id="exam-prompt"
            value={form.prompt}
            onChange={(v) => update({ prompt: v })}
            minHeight="160px"
            placeholder={t("questionBank.promptPlaceholder", "輸入題目內容…")}
          />
        </FieldRow>

        {isChoiceType(form.questionType) && form.questionType !== "true_false" && (
          <FieldRow label={t("questionBank.options", "選項")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {form.options.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, minWidth: "1.5rem" }}>{String.fromCharCode(65 + i)}.</span>
                  <TextInput
                    id={`exam-option-${i}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                  />
                  {form.options.length > 2 && (
                    <IconButton
                      label={t("button.delete", "刪除")}
                      kind="ghost"
                      size="sm"
                      onClick={() => removeOption(i)}
                    >
                      <TrashCan size={16} />
                    </IconButton>
                  )}
                </div>
              ))}
              <IconButton
                label={t("questionBank.addOption", "新增選項")}
                kind="ghost"
                size="sm"
                onClick={addOption}
              >
                <Add size={16} />
              </IconButton>
            </div>
          </FieldRow>
        )}
      </Section>

      <Section title={t("questionBank.answer", "答案設定")}>
        {form.questionType === "true_false" && (
          <FieldRow label={t("questionBank.correctAnswer", "正確答案")}>
            <RadioButtonGroup
              name="exam-true-false"
              legendText=""
              valueSelected={form.singleAnswer != null ? String(form.singleAnswer) : ""}
              onChange={(selection) =>
                update({ singleAnswer: selection === undefined ? null : Number(selection) })
              }
            >
              <RadioButton labelText="True" value="0" id="tf-true" />
              <RadioButton labelText="False" value="1" id="tf-false" />
            </RadioButtonGroup>
          </FieldRow>
        )}

        {form.questionType === "single_choice" && (
          <FieldRow label={t("questionBank.correctAnswer", "正確答案")}>
            <RadioButtonGroup
              name="exam-single-choice"
              legendText=""
              valueSelected={form.singleAnswer != null ? String(form.singleAnswer) : ""}
              onChange={(selection) =>
                update({ singleAnswer: selection === undefined ? null : Number(selection) })
              }
            >
              {form.options.map((opt, i) => (
                <RadioButton
                  key={i}
                  labelText={`${String.fromCharCode(65 + i)}. ${opt || "—"}`}
                  value={String(i)}
                  id={`sc-${i}`}
                />
              ))}
            </RadioButtonGroup>
          </FieldRow>
        )}

        {form.questionType === "multiple_choice" && (
          <FieldRow label={t("questionBank.correctAnswer", "正確答案（可多選）")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {form.options.map((opt, i) => (
                <Checkbox
                  key={i}
                  id={`mc-${i}`}
                  labelText={`${String.fromCharCode(65 + i)}. ${opt || "—"}`}
                  checked={form.multiAnswers.includes(i)}
                  onChange={(_e: unknown, { checked }: { checked: boolean }) => {
                    const next = checked
                      ? [...form.multiAnswers, i].sort()
                      : form.multiAnswers.filter((v) => v !== i);
                    update({ multiAnswers: next });
                  }}
                />
              ))}
            </div>
          </FieldRow>
        )}

        {form.questionType === "short_answer" && (
          <FieldRow label={t("questionBank.correctAnswer", "正確答案")}>
            <TextInput
              id="exam-short-answer"
              labelText=""
              hideLabel
              value={form.shortAnswer}
              onChange={(e) => update({ shortAnswer: e.target.value })}
              placeholder={t("questionBank.shortAnswerPlaceholder", "輸入正確答案…")}
            />
          </FieldRow>
        )}

        {form.questionType === "essay" && (
          <FieldRow label={t("questionBank.referenceAnswer", "參考答案")} description={t("questionBank.essayDesc", "問答題的參考答案（非必填）")}>
            <TextArea
              id="exam-essay-answer"
              labelText=""
              hideLabel
              value={form.essayAnswer}
              onChange={(e) => update({ essayAnswer: e.target.value })}
              rows={4}
              placeholder={t("questionBank.essayPlaceholder", "輸入參考答案…")}
            />
          </FieldRow>
        )}
      </Section>
    </>
  );
};

export default ExamQuestionEditPanel;
