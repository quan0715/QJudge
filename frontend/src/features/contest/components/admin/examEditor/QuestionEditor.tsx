import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  IconButton,
  Layer,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  MultiSelect,
  Tag,
} from "@carbon/react";
import { Add, TrashCan, DocumentBlank } from "@carbon/icons-react";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import { useToast } from "@/shared/contexts";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import styles from "./QuestionEditor.module.scss";

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

const TRUE_FALSE_OPTIONS = ["True", "False"];

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

const TYPE_TAG_COLOR: Record<ExamQuestionType, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
};

const getDefaultOptions = (type: ExamQuestionType): string[] => {
  if (type === "true_false") return [...TRUE_FALSE_OPTIONS];
  if (type === "essay" || type === "short_answer") return [];
  return ["", ""];
};

const createInitialForm = (type: ExamQuestionType = "single_choice"): QuestionFormState => ({
  questionType: type,
  prompt: "",
  score: "5",
  options: getDefaultOptions(type),
  singleAnswerIndex: "",
  multiAnswerIndexes: [],
  essayReferenceAnswer: "",
  shortAnswer: "",
});

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
    question.questionType === "true_false" ? [...TRUE_FALSE_OPTIONS] : options;
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

export interface ExamQuestionUpsertPayload {
  question_type: ExamQuestionType;
  prompt: string;
  score: number;
  options?: string[];
  correct_answer?: unknown;
  order?: number;
}

const buildPayload = (form: QuestionFormState): ExamQuestionUpsertPayload => {
  const payload: ExamQuestionUpsertPayload = {
    question_type: form.questionType,
    prompt: form.prompt.trim(),
    score: Number(form.score || 0),
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
    payload.options = [...TRUE_FALSE_OPTIONS];
    payload.correct_answer = Number(form.singleAnswerIndex);
    return payload;
  }
  const options = form.options.map((o) => o.trim());
  payload.options = options;
  if (form.questionType === "multiple_choice") {
    payload.correct_answer = form.multiAnswerIndexes.map(Number);
    return payload;
  }
  payload.correct_answer = Number(form.singleAnswerIndex);
  return payload;
};

// --- Component ---

interface QuestionEditorProps {
  question: ExamQuestion | null;
  isNew?: boolean;
  frozen?: boolean;
  onSave: (payload: ExamQuestionUpsertPayload, questionId?: string) => Promise<void>;
  onDelete?: (questionId: string) => Promise<void>;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({
  question,
  isNew,
  frozen,
  onSave,
  onDelete,
}) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<QuestionFormState>(createInitialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm(createInitialForm());
    } else if (question) {
      setForm(toFormState(question));
    }
  }, [question, isNew]);

  const validateForm = useCallback((): boolean => {
    if (!form.prompt.trim()) {
      showToast({ kind: "error", title: "驗證失敗", subtitle: "題目內容不可為空" });
      return false;
    }
    const score = Number(form.score || 0);
    if (!Number.isFinite(score) || score <= 0) {
      showToast({ kind: "error", title: "驗證失敗", subtitle: "配分必須大於 0" });
      return false;
    }
    if (!isChoiceType(form.questionType)) return true;
    if (form.questionType !== "true_false") {
      if (form.options.length < 2) {
        showToast({ kind: "error", title: "驗證失敗", subtitle: "至少需要 2 個選項" });
        return false;
      }
      if (form.options.some((o) => !o.trim())) {
        showToast({ kind: "error", title: "驗證失敗", subtitle: "選項文字不可空白" });
        return false;
      }
    }
    if (
      (form.questionType === "single_choice" || form.questionType === "true_false") &&
      form.singleAnswerIndex === ""
    ) {
      showToast({ kind: "error", title: "驗證失敗", subtitle: "請選擇標準答案" });
      return false;
    }
    if (form.questionType === "multiple_choice" && form.multiAnswerIndexes.length === 0) {
      showToast({ kind: "error", title: "驗證失敗", subtitle: "多選題至少要選 1 個答案" });
      return false;
    }
    return true;
  }, [form, showToast]);

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      setSaving(true);
      const payload = buildPayload(form);
      await onSave(payload, question?.id);
    } finally {
      setSaving(false);
    }
  };

  const handleTypeChange = (nextType: ExamQuestionType) => {
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
  const updateOption = (index: number, value: string) =>
    setForm((prev) => ({ ...prev, options: prev.options.map((o, i) => (i === index ? value : o)) }));
  const removeOption = (index: number) => {
    setForm((prev) => {
      const nextOptions = prev.options.filter((_, i) => i !== index);
      const nextSingleAnswer =
        prev.singleAnswerIndex === String(index) ? ""
          : prev.singleAnswerIndex !== "" && Number(prev.singleAnswerIndex) > index
            ? String(Number(prev.singleAnswerIndex) - 1) : prev.singleAnswerIndex;
      const nextMultiAnswers = prev.multiAnswerIndexes
        .filter((item) => item !== String(index))
        .map((item) => (Number(item) > index ? String(Number(item) - 1) : item));
      return { ...prev, options: nextOptions, singleAnswerIndex: nextSingleAnswer, multiAnswerIndexes: nextMultiAnswers };
    });
  };

  const answerOptions = form.options.map((o, i) => ({
    id: String(i),
    label: `${String.fromCharCode(65 + i)}. ${o.trim() || `選項 ${i + 1}`}`,
  }));

  // --- Empty state ---
  if (!question && !isNew) {
    return (
      <div className={styles.emptyState}>
        <DocumentBlank size={48} className={styles.emptyIcon} />
        <p>選擇左側題目進行編輯，或新增一道題目</p>
      </div>
    );
  }

  const questionIndex = question?.order ?? 0;

  return (
    <div className={styles.editorPanel}>
      {/* Compact toolbar */}
      <div className={styles.editorToolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            id="qe-type"
            labelText=""
            hideLabel
            size="sm"
            value={form.questionType}
            onChange={(e) => handleTypeChange(e.target.value as ExamQuestionType)}
            disabled={frozen}
            inline
          >
            <SelectItem value="single_choice" text="單選題" />
            <SelectItem value="multiple_choice" text="多選題" />
            <SelectItem value="true_false" text="是非題" />
            <SelectItem value="short_answer" text="簡答題" />
            <SelectItem value="essay" text="問答題" />
          </Select>
          <div className={styles.scoreInline}>
            <TextInput
              id="qe-score"
              labelText=""
              hideLabel
              size="sm"
              type="number"
              min={1}
              value={form.score}
              onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))}
              disabled={frozen}
            />
            <span>分</span>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          {!isNew && question && !frozen && onDelete && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={TrashCan}
              hasIconOnly
              iconDescription="刪除"
              onClick={() => onDelete(question.id)}
            />
          )}
          <Button
            kind="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving || frozen}
          >
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>

      {/* Card body - scrollable, matching ExamQuestionCard layout */}
      <div className={styles.editorBody}>
        <Layer><div className={styles.card}>
          {/* Card header: matches ExamQuestionCard */}
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>
              {isNew ? "新增題目" : `第 ${questionIndex + 1} 題`}
              <Tag size="sm" type={TYPE_TAG_COLOR[form.questionType] as never}>
                {TYPE_LABEL[form.questionType]}
              </Tag>
            </span>
            <span className={styles.scoreInline}>{form.score} 分</span>
          </div>

          {/* Prompt section: inline editable markdown */}
          <div className={styles.promptSection}>
            <MarkdownField
              id="qe-prompt"
              labelText="題目敘述"
              value={form.prompt}
              onChange={(val) => setForm((p) => ({ ...p, prompt: val }))}
              placeholder="輸入題目敘述（支援 Markdown / LaTeX）"
              minHeight="200px"
              showPreview={false}
              disabled={!!frozen}
            />
          </div>

          {/* Answer area: matches ExamQuestionCard structure */}
          <div className={styles.answerArea}>
            <div className={styles.answerLabel}>作答區</div>

            {/* True/False */}
            {form.questionType === "true_false" && (
              <div className={styles.optionList}>
                <div className={styles.optionRow}>
                  <span className={styles.optionLetter}>A.</span>
                  <span>是 (True)</span>
                </div>
                <div className={styles.optionRow}>
                  <span className={styles.optionLetter}>B.</span>
                  <span>否 (False)</span>
                </div>
              </div>
            )}

            {/* Single/Multiple choice with editable options */}
            {(form.questionType === "single_choice" || form.questionType === "multiple_choice") && (
              <div className={styles.optionList}>
                {form.options.map((option, index) => (
                  <div key={`opt-${index}`} className={styles.optionRow}>
                    <span className={styles.optionLetter}>
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <div className={styles.optionInput}>
                      <TextInput
                        id={`qe-opt-${index}`}
                        labelText=""
                        hideLabel
                        size="sm"
                        placeholder={`選項 ${String.fromCharCode(65 + index)}`}
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        disabled={frozen}
                      />
                    </div>
                    {!frozen && (
                      <div className={styles.optionActions}>
                        <IconButton
                          kind="ghost"
                          size="sm"
                          label="刪除選項"
                          onClick={() => removeOption(index)}
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
                      新增選項
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Short answer */}
            {form.questionType === "short_answer" && (
              <div className={styles.shortInput}>
                <TextInput
                  id="q-preview-short"
                  labelText=""
                  hideLabel
                  placeholder="輸入你的答案..."
                  disabled
                />
              </div>
            )}

            {/* Essay */}
            {form.questionType === "essay" && (
              <div className={styles.essayArea}>
                <TextArea
                  id="q-preview-essay"
                  labelText=""
                  hideLabel
                  placeholder="請詳細作答..."
                  disabled
                />
              </div>
            )}
          </div>

          {/* Correct answer section */}
          <div className={styles.correctAnswerSection}>
            <div className={styles.correctAnswerLabel}>標準答案</div>

            {form.questionType === "true_false" && (
              <Select
                id="qe-tf-answer"
                labelText=""
                hideLabel
                size="sm"
                value={form.singleAnswerIndex}
                onChange={(e) => setForm((p) => ({ ...p, singleAnswerIndex: e.target.value }))}
                disabled={frozen}
              >
                <SelectItem value="" text="請選擇答案" />
                <SelectItem value="0" text="A. 是 (True)" />
                <SelectItem value="1" text="B. 否 (False)" />
              </Select>
            )}

            {form.questionType === "single_choice" && (
              <Select
                id="qe-single-answer"
                labelText=""
                hideLabel
                size="sm"
                value={form.singleAnswerIndex}
                onChange={(e) => setForm((p) => ({ ...p, singleAnswerIndex: e.target.value }))}
                disabled={frozen}
              >
                <SelectItem value="" text="請選擇答案" />
                {answerOptions.map((o) => (
                  <SelectItem key={`ans-${o.id}`} value={o.id} text={o.label} />
                ))}
              </Select>
            )}

            {form.questionType === "multiple_choice" && (
              <MultiSelect
                id="qe-multi-answer"
                titleText=""
                label="請選擇正確答案"
                size="sm"
                items={answerOptions}
                itemToString={(item: { label: string } | null) => item?.label || ""}
                selectedItems={answerOptions.filter((item) =>
                  form.multiAnswerIndexes.includes(item.id),
                )}
                onChange={(data) => {
                  const items = (data.selectedItems ?? []).filter(
                    (item): item is { id: string; label: string } => item != null,
                  );
                  setForm((p) => ({
                    ...p,
                    multiAnswerIndexes: items.map((item) => item.id),
                  }));
                }}
                disabled={frozen}
              />
            )}

            {form.questionType === "short_answer" && (
              <div className={styles.shortInput}>
                <TextInput
                  id="qe-short-answer"
                  labelText=""
                  hideLabel
                  size="sm"
                  placeholder="輸入簡答標準答案（如數字、關鍵字）"
                  value={form.shortAnswer}
                  onChange={(e) => setForm((p) => ({ ...p, shortAnswer: e.target.value }))}
                  disabled={frozen}
                />
              </div>
            )}

            {form.questionType === "essay" && (
              <div className={styles.essayArea}>
                <TextArea
                  id="qe-essay-answer"
                  labelText=""
                  hideLabel
                  rows={4}
                  value={form.essayReferenceAnswer}
                  onChange={(e) => setForm((p) => ({ ...p, essayReferenceAnswer: e.target.value }))}
                  placeholder="參考答案（可選，支援 Markdown）"
                  disabled={frozen}
                />
              </div>
            )}
          </div>
        </div></Layer>
      </div>
    </div>
  );
};

export default QuestionEditor;
export { buildPayload, type ExamQuestionUpsertPayload as QuestionPayload };
