import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  IconButton,
  InlineNotification,
  Modal,
  MultiSelect,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
} from "@carbon/react";
import {
  Add,
  Draggable,
  Renew,
  TrashCan,
  View,
  Edit as EditIcon,
} from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";

import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import {
  createExamQuestion,
  deleteExamQuestion,
  getExamQuestions,
  reorderExamQuestions,
  updateExamQuestion,
  type ExamQuestionUpsertPayload,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import styles from "./ExamQuestionsSection.module.scss";

// ─── Form helpers ────────────────────────────────────────────────

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

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

const TYPE_TAG_COLOR: Record<ExamQuestionType, string> = {
  true_false: "purple",
  single_choice: "blue",
  multiple_choice: "teal",
  short_answer: "green",
  essay: "warm-gray",
};

const TRUE_FALSE_OPTIONS = ["True", "False"];

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
  questionType: ExamQuestionType
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
  const base = {
    questionType: question.questionType,
    prompt: question.prompt,
    score: String(question.score || 0),
    options: [],
    singleAnswerIndex: "",
    multiAnswerIndexes: [] as string[],
    essayReferenceAnswer: "",
    shortAnswer: "",
  } satisfies QuestionFormState;

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
  // true_false & single_choice
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

  // true_false: always send fixed True/False options
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

// ─── QuestionCard ────────────────────────────────────────────────

interface QuestionCardProps {
  question: ExamQuestion;
  index: number;
  onClick: (question: ExamQuestion) => void;
  frozen?: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  onClick,
  frozen = false,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={dragControls}
      className={styles.card}
      drag={!frozen}
    >
      {/* Drag handle */}
      <div
        className={styles.dragHandle}
        onPointerDown={(e) => { if (!frozen) dragControls.start(e); }}
        style={frozen ? { opacity: 0.3, cursor: "not-allowed" } : undefined}
      >
        <Draggable size={16} />
      </div>

      {/* Clickable content area */}
      <button
        type="button"
        className={styles.cardClickable}
        onClick={() => { if (!frozen) onClick(question); }}
        style={frozen ? { cursor: "default" } : undefined}
      >
        {/* Order number */}
        <div className={styles.orderBadge}>{index + 1}</div>

        {/* Main content */}
        <div className={styles.cardBody}>
          <div className={styles.cardMeta}>
            <Tag type={TYPE_TAG_COLOR[question.questionType] as never} size="sm">
              {TYPE_LABEL[question.questionType]}
            </Tag>
            <Tag type="outline" size="sm">{question.score} 分</Tag>
          </div>
          <div className={styles.cardPrompt}>
            <MarkdownContent.Rich>{question.prompt}</MarkdownContent.Rich>
          </div>
          {question.options && question.options.length > 0 && (
            <div className={styles.cardOptions}>
              {question.options.map((opt, i) => (
                <span key={i} className={styles.optionChip}>
                  {String.fromCharCode(65 + i)}. {opt}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </Reorder.Item>
  );
};

// ─── ExamQuestionsSection ────────────────────────────────────────

interface ExamQuestionsSectionProps {
  contestId: string;
  registerRef: (el: HTMLElement | null) => void;
  onQuestionsChange?: (questions: ExamQuestion[]) => void;
  frozen?: boolean;
}

const ExamQuestionsSection: React.FC<ExamQuestionsSectionProps> = ({
  contestId,
  registerRef,
  onQuestionsChange,
  frozen = false,
}) => {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<QuestionFormState>(createInitialForm());
  const [previewPrompt, setPreviewPrompt] = useState(false);
  const { confirm, modalProps } = useConfirmModal();

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQuestions = useCallback(async () => {
    if (!contestId) return;
    try {
      setLoading(true);
      const list = await getExamQuestions(contestId);
      const sorted = list.sort((a, b) => a.order - b.order);
      setQuestions(sorted);
      onQuestionsChange?.(sorted);
    } catch (error) {
      console.error("Failed to load exam questions", error);
      showToast({ kind: "error", title: "載入失敗", subtitle: "載入 Exam 題目失敗" });
    } finally {
      setLoading(false);
    }
  }, [contestId, onQuestionsChange, showToast]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const questionSummary = useMemo(() => {
    const totalScore = questions.reduce((sum, q) => sum + q.score, 0);
    return { count: questions.length, totalScore };
  }, [questions]);

  // ── Drag reorder ──────────────────────────────────────────────

  const handleReorder = useCallback(
    (newOrder: ExamQuestion[]) => {
      setQuestions(newOrder);
      onQuestionsChange?.(newOrder);

      if (reorderTimeoutRef.current) {
        clearTimeout(reorderTimeoutRef.current);
      }
      reorderTimeoutRef.current = setTimeout(async () => {
        const orders = newOrder.map((q, order) => ({ id: q.id, order }));
        try {
          await reorderExamQuestions(contestId, orders);
        } catch (error) {
          console.error("Failed to reorder", error);
          showToast({ kind: "error", title: "排序更新失敗" });
          loadQuestions();
        }
      }, 600);
    },
    [contestId, onQuestionsChange, loadQuestions, showToast],
  );

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingQuestion(null);
    setForm(createInitialForm());
    setPreviewPrompt(false);
    setModalOpen(true);
  };

  const openEditModal = (question: ExamQuestion) => {
    setEditingQuestion(question);
    setForm(toFormState(question));
    setPreviewPrompt(false);
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
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

    // true_false doesn't need option validation — options are fixed
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
  };

  const handleSave = async () => {
    if (!contestId) return;
    if (!validateForm()) return;
    try {
      setSaving(true);
      const payload = buildPayload(form);
      if (editingQuestion) {
        await updateExamQuestion(contestId, editingQuestion.id, payload);
        showToast({ kind: "success", title: "Exam 題目已更新" });
      } else {
        await createExamQuestion(contestId, { ...payload, order: questions.length });
        showToast({ kind: "success", title: "Exam 題目已新增" });
      }
      setModalOpen(false);
      await loadQuestions();
    } catch (error) {
      console.error("Failed to save exam question", error);
      const message = error instanceof Error ? error.message : "儲存失敗";
      showToast({ kind: "error", title: "儲存失敗", subtitle: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInModal = async () => {
    if (!contestId || !editingQuestion) return;
    const accepted = await confirm({
      title: `確定刪除題目 #${editingQuestion.order + 1}？`,
      danger: true,
      confirmLabel: "刪除",
      cancelLabel: "取消",
    });
    if (!accepted) return;
    try {
      await deleteExamQuestion(contestId, editingQuestion.id);
      showToast({ kind: "success", title: "Exam 題目已刪除" });
      setModalOpen(false);
      await loadQuestions();
    } catch (error) {
      console.error("Failed to delete exam question", error);
      showToast({ kind: "error", title: "刪除失敗" });
    }
  };

  // ── Modal form helpers ────────────────────────────────────────

  const handleTypeChange = (nextType: ExamQuestionType) => {
    setForm((prev) => {
      if (nextType === "essay" || nextType === "short_answer") {
        return {
          ...prev,
          questionType: nextType,
          options: [],
          singleAnswerIndex: "",
          multiAnswerIndexes: [],
        };
      }
      if (nextType === "true_false") {
        return {
          ...prev,
          questionType: nextType,
          options: [...TRUE_FALSE_OPTIONS],
          multiAnswerIndexes: [],
          singleAnswerIndex: "",
        };
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
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? value : o)),
    }));

  const removeOption = (index: number) => {
    setForm((prev) => {
      const nextOptions = prev.options.filter((_, i) => i !== index);
      const nextSingleAnswer =
        prev.singleAnswerIndex === String(index)
          ? ""
          : prev.singleAnswerIndex !== "" && Number(prev.singleAnswerIndex) > index
            ? String(Number(prev.singleAnswerIndex) - 1)
            : prev.singleAnswerIndex;
      const nextMultiAnswers = prev.multiAnswerIndexes
        .filter((item) => item !== String(index))
        .map((item) => (Number(item) > index ? String(Number(item) - 1) : item));
      return {
        ...prev,
        options: nextOptions,
        singleAnswerIndex: nextSingleAnswer,
        multiAnswerIndexes: nextMultiAnswers,
      };
    });
  };

  const answerOptions = form.options.map((o, i) => ({
    id: String(i),
    label: `${i + 1}. ${o.trim() || `選項 ${i + 1}`}`,
  }));

  // ── Modal: option editing section (only for single/multiple choice) ──

  const renderChoiceOptions = () => {
    if (form.questionType === "true_false") {
      // True/False — fixed options, just pick answer
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Select
            id="exam-q-tf-answer"
            labelText="標準答案"
            value={form.singleAnswerIndex}
            onChange={(e) => setForm((p) => ({ ...p, singleAnswerIndex: e.target.value }))}
          >
            <SelectItem value="" text="請選擇答案" />
            <SelectItem value="0" text="True" />
            <SelectItem value="1" text="False" />
          </Select>
        </div>
      );
    }

    // single_choice / multiple_choice — editable options
    return (
      <>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>選項</span>
            <Button size="sm" kind="tertiary" renderIcon={Add} onClick={addOption}>
              新增選項
            </Button>
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {form.options.map((option, index) => (
              <div
                key={`opt-${index}`}
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}
              >
                <TextInput
                  id={`exam-q-opt-${index}`}
                  labelText={index === 0 ? "選項內容" : ""}
                  hideLabel={index !== 0}
                  placeholder={`選項 ${index + 1}`}
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                />
                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  iconDescription="刪除選項"
                  renderIcon={TrashCan}
                  onClick={() => removeOption(index)}
                  disabled={form.options.length <= 2}
                />
              </div>
            ))}
          </div>
        </div>
        {form.questionType === "multiple_choice" ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <MultiSelect
              id="exam-q-multi-answer"
              titleText="標準答案"
              label="請選擇正確答案"
              items={answerOptions}
              itemToString={(item) => item?.label || ""}
              selectedItems={answerOptions.filter((item) =>
                form.multiAnswerIndexes.includes(item.id),
              )}
              onChange={({ selectedItems }) => {
                setForm((p) => ({
                  ...p,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  multiAnswerIndexes: (selectedItems ?? []).map((item: any) => item.id),
                }));
              }}
            />
          </div>
        ) : (
          <Select
            id="exam-q-single-answer"
            labelText="標準答案"
            value={form.singleAnswerIndex}
            onChange={(e) => setForm((p) => ({ ...p, singleAnswerIndex: e.target.value }))}
          >
            <SelectItem value="" text="請選擇答案" />
            {answerOptions.map((o) => (
              <SelectItem key={`ans-${o.id}`} value={o.id} text={o.label} />
            ))}
          </Select>
        )}
      </>
    );
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <section id="exam-questions" ref={registerRef}>
      <div className={styles.header}>
        <h3 className={styles.title}>考試題目</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Renew}
            hasIconOnly
            iconDescription="重新整理"
            onClick={loadQuestions}
            disabled={loading}
          />
          <Button size="sm" renderIcon={Add} onClick={openCreateModal}>
            新增題目
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <Tag type="teal">{`題目數：${questionSummary.count}`}</Tag>
        <Tag type="blue">{`總配分：${questionSummary.totalScore}`}</Tag>
      </div>

      {frozen && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="題目已凍結"
          subtitle="已有學生開始作答，拖曳排序、編輯及刪除功能已停用。仍可新增題目。"
          style={{ marginBottom: "1rem" }}
        />
      )}

      {/* Card list with drag reorder */}
      {questions.length > 0 ? (
        <Reorder.Group
          axis="y"
          values={questions}
          onReorder={handleReorder}
          as="div"
          className={styles.cardList}
        >
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              onClick={openEditModal}
              frozen={frozen}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className={styles.empty}>
          {loading ? "載入中..." : "尚未建立 Exam 題目，點擊上方「新增題目」開始建立。"}
        </div>
      )}

      {/* Question Create/Edit Modal */}
      <Modal
        open={modalOpen}
        modalHeading={editingQuestion ? "編輯 Exam 題目" : "新增 Exam 題目"}
        primaryButtonText={saving ? "儲存中..." : "儲存"}
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleSave}
        primaryButtonDisabled={saving}
        size="lg"
      >
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <Select
            id="exam-q-type"
            labelText="題型"
            value={form.questionType}
            onChange={(e) => handleTypeChange(e.target.value as ExamQuestionType)}
          >
            <SelectItem value="single_choice" text="單選題" />
            <SelectItem value="multiple_choice" text="多選題" />
            <SelectItem value="true_false" text="是非題" />
            <SelectItem value="short_answer" text="簡答題" />
            <SelectItem value="essay" text="問答題" />
          </Select>
          <TextInput
            id="exam-q-score"
            labelText="配分"
            type="number"
            min={1}
            value={form.score}
            onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))}
          />
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                題目內容（支援 Markdown / LaTeX）
              </span>
              <IconButton
                kind="ghost"
                size="sm"
                label={previewPrompt ? "編輯" : "預覽"}
                onClick={() => setPreviewPrompt((p) => !p)}
              >
                {previewPrompt ? <EditIcon size={16} /> : <View size={16} />}
              </IconButton>
            </div>
            {previewPrompt ? (
              <div className={styles.markdownPreview}>
                {form.prompt.trim() ? (
                  <MarkdownContent.Rich>{form.prompt}</MarkdownContent.Rich>
                ) : (
                  <span style={{ color: "var(--cds-text-placeholder)" }}>（尚無內容）</span>
                )}
              </div>
            ) : (
              <TextArea
                id="exam-q-prompt"
                labelText=""
                hideLabel
                rows={6}
                value={form.prompt}
                onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))}
                placeholder="支援 Markdown 語法，例如 **粗體**、`code`、$x^2$ 數學公式"
              />
            )}
          </div>

          {isChoiceType(form.questionType) && renderChoiceOptions()}
          {form.questionType === "short_answer" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <TextInput
                id="exam-q-short-answer"
                labelText="標準答案"
                placeholder="輸入簡答標準答案（如數字、關鍵字）"
                value={form.shortAnswer}
                onChange={(e) => setForm((p) => ({ ...p, shortAnswer: e.target.value }))}
              />
            </div>
          )}
          {form.questionType === "essay" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <TextArea
                id="exam-q-essay-answer"
                labelText="參考答案（可選，支援 Markdown）"
                rows={4}
                value={form.essayReferenceAnswer}
                onChange={(e) => setForm((p) => ({ ...p, essayReferenceAnswer: e.target.value }))}
                placeholder="支援 Markdown 語法"
              />
            </div>
          )}
        </div>

        {/* Delete button inside modal (only in edit mode, disabled when frozen) */}
        {editingQuestion && (
          <div className={styles.modalDangerZone}>
            <Button
              kind="danger--ghost"
              size="sm"
              renderIcon={TrashCan}
              onClick={handleDeleteInModal}
              disabled={frozen}
            >
              刪除此題目
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmModal {...modalProps} />
    </section>
  );
};

export default ExamQuestionsSection;
