import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  IconButton,
  Layer,
  NumberInput,
  Select,
  SelectItem,
  TextInput,
  Tag,
  RadioButton,
  RadioButtonGroup,
  Checkbox,
  InlineLoading,
} from "@carbon/react";
import {
  Add,
  TrashCan,
  Close,
  DataBase,
  Draggable,
  Copy,
} from "@carbon/icons-react";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import {
  EXAM_QUESTION_TYPE_ICON as TYPE_ICON,
  EXAM_QUESTION_TYPE_TAG_COLOR as TYPE_TAG_COLOR,
} from "@/shared/ui/examQuestionTypeVisual";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import styles from "./ExamQuestionEditCard.module.scss";

// --- Constants ---

import { useTranslation } from "react-i18next";

const TRUE_FALSE_OPTIONS = ["True", "False"];
const ALLOWED_TYPE_SWITCHES: Record<ExamQuestionType, ExamQuestionType[]> = {
  single_choice: ["single_choice", "multiple_choice"],
  multiple_choice: ["multiple_choice", "single_choice"],
  short_answer: ["short_answer", "essay"],
  essay: ["essay", "short_answer"],
  true_false: ["true_false"],
};

// --- Form types & helpers ---

interface QuestionFormState {
  questionType: ExamQuestionType;
  prompt: string;
  score: string;
  options: string[];
  singleAnswerIndex: string;
  multiAnswerIndexes: string[];
  essayReferenceAnswer: string;
  shortAnswer: string;
}

const getDefaultOptions = (type: ExamQuestionType): string[] => {
  if (type === "true_false") return [...TRUE_FALSE_OPTIONS];
  if (type === "essay" || type === "short_answer") return [];
  return ["", ""];
};

const isChoiceType = (type: ExamQuestionType) =>
  type === "true_false" || type === "single_choice" || type === "multiple_choice";

const toSingleAnswerIndex = (
  value: unknown,
  options: string[],
  questionType: ExamQuestionType,
): string => {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (typeof value === "boolean") return value ? "0" : "1";
  if (typeof value === "string") {
    const lowered = value.toLowerCase().trim();
    if (questionType === "true_false") {
      if (lowered === "true") return "0";
      if (lowered === "false") return "1";
    }
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) return String(asNumber);
    const matchingIndex = options.findIndex((option) => option === value);
    if (matchingIndex >= 0) return String(matchingIndex);
  }
  return "";
};

const toMultiAnswerIndexes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "number" && Number.isInteger(item)) return String(item);
      if (typeof item === "string") {
        const asNumber = Number(item);
        if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) return String(asNumber);
      }
      return "";
    })
    .filter(Boolean);
};

const toFormState = (question: ExamQuestion): QuestionFormState => {
  const options = question.options || [];
  const base: QuestionFormState = {
    questionType: question.questionType,
    prompt: question.prompt,
    score: String(question.score || 0),
    options: [],
    singleAnswerIndex: "",
    multiAnswerIndexes: [],
    essayReferenceAnswer: "",
    shortAnswer: "",
  };

  if (question.questionType === "multiple_choice") {
    return { ...base, options, multiAnswerIndexes: toMultiAnswerIndexes(question.correctAnswer) };
  }
  if (question.questionType === "short_answer") {
    const answer = question.correctAnswer;
    return {
      ...base,
      shortAnswer: answer == null ? "" : typeof answer === "string" ? answer : String(answer),
    };
  }
  if (question.questionType === "essay") {
    return {
      ...base,
      essayReferenceAnswer:
        typeof question.correctAnswer === "string"
          ? question.correctAnswer
          : question.correctAnswer == null
            ? ""
            : JSON.stringify(question.correctAnswer),
    };
  }
  const resolvedOptions =
    question.questionType === "true_false"
      ? options.length >= 2
        ? options.slice(0, 2)
        : [...TRUE_FALSE_OPTIONS]
      : options;
  return {
    ...base,
    options: resolvedOptions,
    singleAnswerIndex: toSingleAnswerIndex(
      question.correctAnswer,
      resolvedOptions,
      question.questionType,
    ),
  };
};

const buildPayload = (
  form: QuestionFormState,
  includeScore = true,
): ExamQuestionUpsertPayload => {
  const payload: ExamQuestionUpsertPayload = {
    question_type: form.questionType,
    prompt: form.prompt.trim(),
    score: includeScore ? Number(form.score || 0) : 1,
  };
  if (form.questionType === "essay") {
    if (form.essayReferenceAnswer.trim()) {
      payload.correct_answer = form.essayReferenceAnswer.trim();
    }
    return payload;
  }
  if (form.questionType === "short_answer") {
    if (form.shortAnswer.trim()) {
      payload.correct_answer = form.shortAnswer.trim();
    }
    return payload;
  }
  if (form.questionType === "true_false") {
    payload.options = form.options.map((o) => o.trim());
    if (form.singleAnswerIndex !== "") {
      payload.correct_answer = Number(form.singleAnswerIndex);
    }
    return payload;
  }
  const options = form.options.map((o) => o.trim());
  payload.options = options;
  if (form.questionType === "multiple_choice") {
    payload.correct_answer = form.multiAnswerIndexes.map(Number);
    return payload;
  }
  if (form.singleAnswerIndex !== "") {
    payload.correct_answer = Number(form.singleAnswerIndex);
  }
  return payload;
};

/** Deep-compare two form states to detect dirty */
const isFormDirty = (
  a: QuestionFormState,
  b: QuestionFormState,
  includeScore = true,
): boolean => {
  if (a.questionType !== b.questionType) return true;
  if (a.prompt !== b.prompt) return true;
  if (includeScore && a.score !== b.score) return true;
  if (a.singleAnswerIndex !== b.singleAnswerIndex) return true;
  if (a.essayReferenceAnswer !== b.essayReferenceAnswer) return true;
  if (a.shortAnswer !== b.shortAnswer) return true;
  if (a.options.length !== b.options.length) return true;
  if (a.options.some((o, i) => o !== b.options[i])) return true;
  if (a.multiAnswerIndexes.length !== b.multiAnswerIndexes.length) return true;
  if (a.multiAnswerIndexes.some((o, i) => o !== b.multiAnswerIndexes[i])) return true;
  return false;
};

// --- Preview helpers ---

/** Get the correct answer index for true_false / single_choice */
const getCorrectSingleIndex = (question: ExamQuestion): number | null => {
  const { correctAnswer, questionType } = question;
  if (correctAnswer == null) return null;
  if (questionType === "true_false") {
    if (correctAnswer === 0 || correctAnswer === true || correctAnswer === "true") return 0;
    if (correctAnswer === 1 || correctAnswer === false || correctAnswer === "false") return 1;
    return null;
  }
  if (typeof correctAnswer === "number") return correctAnswer;
  const n = Number(correctAnswer);
  return Number.isInteger(n) ? n : null;
};

const getCorrectMultiIndexes = (question: ExamQuestion): Set<number> => {
  if (!Array.isArray(question.correctAnswer)) return new Set();
  return new Set(
    (question.correctAnswer as number[]).filter((v) => typeof v === "number" && Number.isInteger(v)),
  );
};

const toNumberInputValue = (value: string | number): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1";
  return String(Math.max(1, Math.round(parsed)));
};

// --- Component ---

interface ExamQuestionEditCardProps {
  question: ExamQuestion;
  index: number;
  showScoreField?: boolean;
  frozen?: boolean;
  startEditingSignal?: number;
  onAutoSave: (payload: ExamQuestionUpsertPayload, questionId?: string) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onDuplicate: (questionId: string) => Promise<void>;
  onSaveToBank?: (question: ExamQuestion) => void;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
}

const ExamQuestionEditCard: React.FC<ExamQuestionEditCardProps> = ({
  question,
  index,
  showScoreField = true,
  frozen,
  startEditingSignal,
  onAutoSave,
  onDelete,
  onDuplicate,
  onSaveToBank,
  onPointerDownDrag,
}) => {
  const { showToast } = useToast();
  const { t } = useTranslation("contest");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<QuestionFormState>(() => toFormState(question));
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const originalFormRef = useRef<QuestionFormState>(toFormState(question));
  const latestFormRef = useRef<QuestionFormState>(toFormState(question));
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync form when question prop changes (after external save/reload)
  useEffect(() => {
    if (!editing) {
      const next = toFormState(question);
      setForm(next);
      originalFormRef.current = next;
    }
  }, [question, editing]);

  useEffect(() => {
    if (startEditingSignal == null) return;
    setEditing(true);
  }, [question.id, startEditingSignal]);

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, []);

  // Click outside → save if dirty, else just close
  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        handleCloseOrSave();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });

  // Escape → save if dirty, else just close
  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseOrSave();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  const getValidationError = useCallback((): string | null => {
    if (!form.prompt.trim()) {
      return t("examEditor.validation.emptyPrompt", "題目內容不可為空");
    }
    if (showScoreField) {
      const score = Number(form.score || 0);
      if (!Number.isFinite(score) || score <= 0) {
        return t("examEditor.validation.invalidScore", "配分必須大於 0");
      }
    }
    if (!isChoiceType(form.questionType)) return null;
    if (form.options.length < 2) {
      return t("examEditor.validation.minOptions", "至少需要 2 個選項");
    }
    if (form.options.some((o) => !o.trim())) {
      return t("examEditor.validation.blankOption", "選項文字不可空白");
    }
    return null;
  }, [form, showScoreField, t]);

  const persistAutoSave = useCallback(
    async (showValidationError = false): Promise<boolean> => {
      const validationError = getValidationError();
      if (validationError) {
        if (showValidationError) {
          showToast({
            kind: "error",
            title: t("examEditor.validationFailed", "驗證失敗"),
            subtitle: validationError,
          });
        }
        return false;
      }

      try {
        setSaving(true);
        const snapshot = latestFormRef.current;
        const payload = buildPayload(snapshot, showScoreField);
        await onAutoSave(payload, question.id);
        originalFormRef.current = { ...snapshot };
        return true;
      } catch (error) {
        const subtitle =
          error instanceof Error
            ? error.message
            : t("examEditor.saveFailed", "儲存失敗");
        showToast({
          kind: "error",
          title: t("examEditor.saveFailed", "儲存失敗"),
          subtitle,
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [getValidationError, onAutoSave, question.id, showScoreField, showToast, t]
  );

  const handleCloseOrSave = async () => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    if (isFormDirty(latestFormRef.current, originalFormRef.current)) {
      const ok = await persistAutoSave(true);
      if (!ok) return;
      setEditing(false);
    } else {
      setEditing(false);
    }
  };

  const handleInlineBlurAutoSave = useCallback(() => {
    if (!editing || frozen) return;
    if (!isFormDirty(latestFormRef.current, originalFormRef.current, showScoreField)) return;
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    void persistAutoSave(false);
  }, [editing, frozen, persistAutoSave, showScoreField]);

  useEffect(() => {
    if (!editing || frozen) return;
    if (!isFormDirty(form, originalFormRef.current, showScoreField)) return;
    if (getValidationError()) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      void persistAutoSave(false);
    }, 1000);
  }, [editing, form, frozen, getValidationError, persistAutoSave, showScoreField]);

  const handleTypeChange = (nextType: ExamQuestionType) => {
    const currentType = form.questionType;
    const allowedTypes = ALLOWED_TYPE_SWITCHES[currentType] ?? [currentType];
    if (!allowedTypes.includes(nextType)) {
      showToast({
        kind: "warning",
        title: t("examEditor.typeSwitchRestricted", "題型切換受限"),
        subtitle: t(
          "examEditor.typeSwitchRule",
          "僅允許「單選題 ↔ 多選題」與「簡答題 ↔ 問答題」互相切換。",
        ),
      });
      return;
    }

    setForm((prev) => {
      if (nextType === "essay" || nextType === "short_answer") {
        return { ...prev, questionType: nextType, options: [], singleAnswerIndex: "", multiAnswerIndexes: [] };
      }
      if (nextType === "true_false") {
        return { ...prev, questionType: nextType, options: [...TRUE_FALSE_OPTIONS], multiAnswerIndexes: [], singleAnswerIndex: "" };
      }
      return {
        ...prev,
        questionType: nextType,
        options: prev.options.length > 0 ? prev.options : getDefaultOptions(nextType),
        singleAnswerIndex: "",
        multiAnswerIndexes: [],
      };
    });
  };

  const addOption = () => setForm((prev) => ({ ...prev, options: [...prev.options, ""] }));
  const updateOption = (i: number, value: string) =>
    setForm((prev) => ({ ...prev, options: prev.options.map((o, idx) => (idx === i ? value : o)) }));
  const removeOption = (i: number) => {
    setForm((prev) => {
      const nextOptions = prev.options.filter((_, idx) => idx !== i);
      const nextSingleAnswer =
        prev.singleAnswerIndex === String(i) ? ""
          : prev.singleAnswerIndex !== "" && Number(prev.singleAnswerIndex) > i
            ? String(Number(prev.singleAnswerIndex) - 1) : prev.singleAnswerIndex;
      const nextMultiAnswers = prev.multiAnswerIndexes
        .filter((item) => item !== String(i))
        .map((item) => (Number(item) > i ? String(Number(item) - 1) : item));
      return { ...prev, options: nextOptions, singleAnswerIndex: nextSingleAnswer, multiAnswerIndexes: nextMultiAnswers };
    });
  };

  // ─── PREVIEW MODE ───
  if (!editing) {
    const correctSingle = getCorrectSingleIndex(question);
    const correctMulti = getCorrectMultiIndexes(question);
    const tfOptions = question.options.length >= 2
      ? question.options
      : [t("examEditor.trueOption", "是 (True)"), t("examEditor.falseOption", "否 (False)")];

    return (
      <Layer>
        <div
          ref={cardRef}
          className={`${styles.card} ${styles.cardPreview}`}
          onClick={() => {
            if (!frozen) setEditing(true);
          }}
          role="button"
          tabIndex={frozen ? -1 : 0}
          onKeyDown={(event) => {
            if (frozen) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setEditing(true);
            }
          }}
        >
          {!frozen && onPointerDownDrag && (
            <div
              className={styles.dragIndicator}
              data-testid={`exam-card-reorder-${question.id}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDownDrag(event);
              }}
            >
              <Draggable size={16} />
            </div>
          )}
          <div className={styles.previewBody}>
            <div className={styles.header}>
              <span className={styles.label}>
                {t("examEditor.questionNumber", { num: index + 1 })}{" "}
                <Tag size="sm" type={TYPE_TAG_COLOR[question.questionType] as never}>
                  <span className={styles.typeTagContent}>
                    {React.createElement(TYPE_ICON[question.questionType], { size: 12 })}
                    {t(`common:questionType.label.${question.questionType}`, question.questionType)}
                  </span>
                </Tag>
                {question.sourceBank ? (
                  <Tag size="sm" type="blue" className={styles.sourceBankTag}>
                    <DataBase size={12} />
                    {question.sourceBank.name}
                  </Tag>
                ) : !frozen && onSaveToBank ? (
                  <button
                    type="button"
                    className={styles.saveToBankButton}
                    data-testid={`exam-card-save-to-bank-${question.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSaveToBank(question);
                    }}
                  >
                    <DataBase size={12} />
                    {t("examEditor.saveToBank", { defaultValue: "收錄到題庫" })}
                  </button>
                ) : null}
              </span>
              <div className={styles.headerRight}>
                {showScoreField ? (
                  <span className={styles.score}>{t("examEditor.scoreUnit", { score: question.score })}</span>
                ) : null}
                {!frozen && (
                  <>
                    <IconButton
                      kind="ghost"
                      size="sm"
                      label={t("examEditor.actions.copy", "複製")}
                      data-testid={`exam-card-duplicate-${question.id}`}
                      onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate(question.id);
                    }}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <IconButton
                      kind="ghost"
                      size="sm"
                      label={t("examEditor.actions.delete", "刪除")}
                      data-testid={`exam-card-delete-${question.id}`}
                      onClick={(event) => {
                      event.stopPropagation();
                      onDelete(question.id);
                    }}
                    >
                      <TrashCan size={16} />
                    </IconButton>
                  </>
                )}
              </div>
            </div>

            {question.prompt ? (
              <div className={styles.prompt}>
                <MarkdownRenderer enableHighlight enableCopy>{question.prompt}</MarkdownRenderer>
              </div>
            ) : (
              <div className={styles.promptEmpty}>{t("examEditor.promptEmpty", "（尚未填寫題目敘述）")}</div>
            )}

            <div className={styles.answerArea}>
              <div className={styles.answerLabel}>{t("examEditor.correctAnswer", "正確答案")}</div>

              {/* Non-interactive answer display */}
              <div className={styles.previewAnswers}>
                {/* True/False */}
                {question.questionType === "true_false" && (
                  <div className={styles.optionList}>
                    {tfOptions.map((label, i) => (
                      <div key={i} className={styles.answerText}>
                        <strong>{String.fromCharCode(65 + i)}.</strong>{" "}
                        <MarkdownRenderer>{label}</MarkdownRenderer>
                        {correctSingle === i ? (
                          <Tag type="green" size="sm">
                            {t("examEditor.correctAnswer", "正確答案")}
                          </Tag>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* Single choice */}
                {question.questionType === "single_choice" && (
                  <RadioButtonGroup
                    name={`preview-${question.id}`}
                    legendText=""
                    orientation="vertical"
                    valueSelected={correctSingle != null ? String(correctSingle) : undefined}
                    onChange={() => {}}
                  >
                    {question.options.map((opt, i) => (
                      <RadioButton
                        key={i}
                        labelText={`${String.fromCharCode(65 + i)}. ${opt}`}
                        value={String(i)}
                        id={`pv-${question.id}-opt-${i}`}
                      />
                    ))}
                  </RadioButtonGroup>
                )}

                {/* Multiple choice */}
                {question.questionType === "multiple_choice" && (
                  <div className={styles.optionList}>
                    {question.options.map((opt, i) => (
                      <Checkbox
                        key={i}
                        id={`pv-${question.id}-mc-${i}`}
                        labelText={`${String.fromCharCode(65 + i)}. ${opt}`}
                        checked={correctMulti.has(i)}
                        onChange={() => {}}
                      />
                    ))}
                  </div>
                )}

                {/* Short answer */}
                {question.questionType === "short_answer" && (
                  <div className={styles.answerText}>
                    {question.correctAnswer != null
                      ? <MarkdownRenderer>{String(question.correctAnswer)}</MarkdownRenderer>
                      : <span className={styles.answerEmpty}>{t("examEditor.answerNotSet", "（未設定答案）")}</span>}
                  </div>
                )}

                {/* Essay */}
                {question.questionType === "essay" && (
                  <div className={styles.answerText}>
                    {question.correctAnswer
                      ? <MarkdownRenderer>{String(question.correctAnswer)}</MarkdownRenderer>
                      : <span className={styles.answerEmpty}>{t("examEditor.referenceNotSet", "（未設定參考答案）")}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Layer>
    );
  }

  // ─── EDIT MODE ───
  const TypeIcon = TYPE_ICON[form.questionType];

  return (
    <Layer>
      <div
        ref={cardRef}
        className={`${styles.card} ${styles.cardEditing}`}
        onBlurCapture={handleInlineBlurAutoSave}
      >
        <div className={styles.editToolbar}>
          <div className={styles.editToolbarLeft}>
            <div className={styles.typeSelector}>
              <TypeIcon size={16} />
              <Select
                id={`eqc-type-${question.id}`}
                labelText=""
                hideLabel
                size="sm"
                value={form.questionType}
                onChange={(e) => handleTypeChange(e.target.value as ExamQuestionType)}
                disabled={frozen}
                inline
              >
                {(["single_choice", "multiple_choice", "true_false", "short_answer", "essay"] as ExamQuestionType[]).map((type) => (
                  <SelectItem
                    key={type}
                    value={type}
                    text={t(`common:questionType.label.${type}`, type)}
                    disabled={!(ALLOWED_TYPE_SWITCHES[form.questionType] ?? [form.questionType]).includes(type)}
                  />
                ))}
              </Select>
            </div>
            {showScoreField ? (
              <div className={styles.scoreInline}>
                <NumberInput
                  id={`eqc-score-${question.id}`}
                  label={t("examEditor.scoreLabel", "分")}
                  className={styles.scoreNumberInput}
                  hideLabel
                  size="sm"
                  min={1}
                  step={1}
                  value={Number(form.score || 1)}
                  onChange={(_e, { value }) =>
                    setForm((p) => ({ ...p, score: toNumberInputValue(value) }))
                  }
                  disabled={frozen}
                />
              </div>
            ) : null}
          </div>
          <div className={styles.editToolbarRight}>
            {saving ? (
              <InlineLoading
                status="active"
                description={t("common.saving", "儲存中...")}
              />
            ) : (
              <span className={styles.autoSaveHint}>
                {t("examEditor.autoSaveEnabled", "自動儲存中")}
              </span>
            )}
            <IconButton kind="ghost" size="sm" label={t("button.close", "關閉")} onClick={handleCloseOrSave}>
              <Close size={16} />
            </IconButton>
          </div>
        </div>

        <div className={styles.editBody}>
          {/* Prompt */}
          <div className={styles.promptSection}>
            <MarkdownField
              id={`eqc-prompt-${question.id}`}
              labelText={t("examEditor.promptLabel", "題目敘述")}
              value={form.prompt}
              onChange={(val) => setForm((p) => ({ ...p, prompt: val }))}
              placeholder={t("examEditor.promptPlaceholder", "輸入題目敘述（支援 Markdown / LaTeX）")}
              minHeight="200px"
              disabled={!!frozen}
            />
          </div>

          {/* Answer area with inline correct-answer selection */}
          <div className={styles.answerArea}>
            <div className={styles.answerLabel}>{t("examEditor.optionsAndAnswer", "選項與正確答案")}</div>

            {/* True/False: radio to pick correct answer */}
            {form.questionType === "true_false" && (
              <div className={styles.editOptionList}>
                {form.options.map((label, i) => (
                  <div key={i} className={styles.editOptionRow}>
                    <RadioButton
                      name={`edit-tf-${question.id}`}
                      id={`edit-tf-${question.id}-${i}`}
                      labelText=""
                      value={String(i)}
                      checked={form.singleAnswerIndex === String(i)}
                      onChange={() => setForm((p) => ({ ...p, singleAnswerIndex: String(i) }))}
                      disabled={frozen}
                    />
                    <span className={styles.optionLetter}>{String.fromCharCode(65 + i)}.</span>
                    <div className={styles.optionMarkdown}>
                      <MarkdownField
                        id={`eqc-tf-option-${question.id}-${i}`}
                        labelText=""
                        value={label}
                        onChange={(val) => updateOption(i, val)}
                        placeholder={t("examEditor.optionPlaceholder", { letter: String.fromCharCode(65 + i) })}
                        minHeight="96px"
                        disabled={!!frozen}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Single choice: radio + editable option text */}
            {form.questionType === "single_choice" && (
              <div className={styles.editOptionList}>
                {form.options.map((option, i) => (
                  <div key={`opt-${i}`} className={styles.editOptionRow}>
                    <RadioButton
                      name={`edit-sc-${question.id}`}
                      id={`edit-sc-${question.id}-${i}`}
                      labelText=""
                      value={String(i)}
                      checked={form.singleAnswerIndex === String(i)}
                      onChange={() => setForm((p) => ({ ...p, singleAnswerIndex: String(i) }))}
                      disabled={frozen}
                    />
                    <span className={styles.optionLetter}>{String.fromCharCode(65 + i)}.</span>
                    <div className={styles.optionInput}>
                      <TextInput
                        id={`eqc-opt-${question.id}-${i}`}
                        labelText=""
                        hideLabel
                        size="sm"
                        placeholder={t("examEditor.optionPlaceholder", { letter: String.fromCharCode(65 + i) })}
                        value={option}
                        onChange={(e) => updateOption(i, e.target.value)}
                        disabled={frozen}
                      />
                    </div>
                    {!frozen && (
                      <div className={styles.optionActions}>
                        <IconButton
                          kind="ghost"
                          size="sm"
                          label={t("examEditor.deleteOption", "刪除選項")}
                          onClick={() => removeOption(i)}
                          disabled={form.options.length <= 2}
                        >
                          <TrashCan size={14} />
                        </IconButton>
                      </div>
                    )}
                  </div>
                ))}
                {!frozen && (
                  <div className={styles.addOptionRow}>
                    <Button size="sm" kind="ghost" renderIcon={Add} onClick={addOption}>
                      {t("examEditor.addOption", "新增選項")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Multiple choice: checkbox + editable option text */}
            {form.questionType === "multiple_choice" && (
              <div className={styles.editOptionList}>
                {form.options.map((option, i) => (
                  <div key={`opt-${i}`} className={styles.editOptionRow}>
                    <Checkbox
                      id={`edit-mc-${question.id}-${i}`}
                      labelText=""
                      checked={form.multiAnswerIndexes.includes(String(i))}
                      onChange={(_: unknown, { checked }: { checked: boolean }) => {
                        setForm((p) => ({
                          ...p,
                          multiAnswerIndexes: checked
                            ? [...p.multiAnswerIndexes, String(i)]
                            : p.multiAnswerIndexes.filter((x) => x !== String(i)),
                        }));
                      }}
                      disabled={frozen}
                    />
                    <span className={styles.optionLetter}>{String.fromCharCode(65 + i)}.</span>
                    <div className={styles.optionInput}>
                      <TextInput
                        id={`eqc-opt-${question.id}-${i}`}
                        labelText=""
                        hideLabel
                        size="sm"
                        placeholder={t("examEditor.optionPlaceholder", { letter: String.fromCharCode(65 + i) })}
                        value={option}
                        onChange={(e) => updateOption(i, e.target.value)}
                        disabled={frozen}
                      />
                    </div>
                    {!frozen && (
                      <div className={styles.optionActions}>
                        <IconButton
                          kind="ghost"
                          size="sm"
                          label={t("examEditor.deleteOption", "刪除選項")}
                          onClick={() => removeOption(i)}
                          disabled={form.options.length <= 2}
                        >
                          <TrashCan size={14} />
                        </IconButton>
                      </div>
                    )}
                  </div>
                ))}
                {!frozen && (
                  <div className={styles.addOptionRow}>
                    <Button size="sm" kind="ghost" renderIcon={Add} onClick={addOption}>
                      {t("examEditor.addOption", "新增選項")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Short answer */}
            {form.questionType === "short_answer" && (
              <div className={styles.shortInput}>
                <MarkdownField
                  id={`eqc-short-answer-${question.id}`}
                  labelText={t("examEditor.standardAnswer", "標準答案")}
                  placeholder={t("examEditor.shortAnswerPlaceholder", "輸入簡答標準答案（如數字、關鍵字）")}
                  value={form.shortAnswer}
                  onChange={(val) => setForm((p) => ({ ...p, shortAnswer: val }))}
                  minHeight="96px"
                  disabled={!!frozen}
                />
              </div>
            )}

            {/* Essay */}
            {form.questionType === "essay" && (
              <div className={styles.essayArea}>
                <MarkdownField
                  id={`eqc-essay-answer-${question.id}`}
                  labelText={t("examEditor.referenceAnswer", "參考答案")}
                  value={form.essayReferenceAnswer}
                  onChange={(val) => setForm((p) => ({ ...p, essayReferenceAnswer: val }))}
                  placeholder={t("examEditor.referencePlaceholder", "參考答案（可選，支援 Markdown）")}
                  minHeight="112px"
                  disabled={!!frozen}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layer>
  );
};

export default ExamQuestionEditCard;
