import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button, Modal } from "@carbon/react";
import {
  Add,
  RadioButton as RadioButtonIcon,
  Checkbox as CheckboxIcon,
  Boolean,
  Pen,
  Document,
} from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import type { ContestDetail, ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import {
  getExamQuestions,
  createExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
  reorderExamQuestions,
  type ExamQuestionUpsertPayload,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import WorkTree from "./WorkTree";
import ExamQuestionEditCard from "./ExamQuestionEditCard";
import styles from "./ExamEditorLayout.module.scss";

// --- Question type picker config ---

const QUESTION_TYPES: {
  type: ExamQuestionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { type: "single_choice", label: "單選題", description: "從多個選項中選擇一個正確答案", icon: RadioButtonIcon },
  { type: "multiple_choice", label: "多選題", description: "從多個選項中選擇多個正確答案", icon: CheckboxIcon },
  { type: "true_false", label: "是非題", description: "判斷敘述為「是」或「否」", icon: Boolean },
  { type: "short_answer", label: "簡答題", description: "輸入簡短文字作為答案", icon: Pen },
  { type: "essay", label: "問答題", description: "長篇文字作答，支援參考答案", icon: Document },
];

const DEFAULT_PAYLOADS: Record<ExamQuestionType, Omit<ExamQuestionUpsertPayload, "order">> = {
  single_choice: { question_type: "single_choice", prompt: "新題目", score: 5, options: ["選項 A", "選項 B"], correct_answer: 0 },
  multiple_choice: { question_type: "multiple_choice", prompt: "新題目", score: 5, options: ["選項 A", "選項 B"], correct_answer: [0] },
  true_false: { question_type: "true_false", prompt: "新題目", score: 5, options: ["True", "False"], correct_answer: true },
  short_answer: { question_type: "short_answer", prompt: "新題目", score: 5 },
  essay: { question_type: "essay", prompt: "新題目", score: 5 },
};

interface ExamEditorLayoutProps {
  contestId: string;
  contest: ContestDetail;
}

const ExamEditorLayout: React.FC<ExamEditorLayoutProps> = ({
  contestId,
  contest,
}) => {
  const { showToast } = useToast();
  const { confirm, modalProps } = useConfirmModal();

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for scroll sync
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);

  // Type picker dialog state
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState<number | null>(null);

  const frozen = !!contest.isExamQuestionsFrozen;

  // --- Load questions ---
  const loadQuestions = useCallback(async () => {
    if (!contestId) return;
    try {
      setLoading(true);
      const list = await getExamQuestions(contestId);
      const sorted = list.sort((a, b) => a.order - b.order);
      setQuestions(sorted);
    } catch (error) {
      console.error("Failed to load exam questions", error);
      showToast({ kind: "error", title: "載入失敗", subtitle: "載入 Exam 題目失敗" });
    } finally {
      setLoading(false);
    }
  }, [contestId, showToast]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // Pre-select first question once loaded
  useEffect(() => {
    if (questions.length > 0 && selectedId === null) {
      setSelectedId(questions[0].id);
    }
  }, [questions, selectedId]);

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  // --- Scroll sync: right pane scroll → update selectedId ---
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane || questions.length === 0) return;

    let ticking = false;
    const handleScroll = () => {
      if (programmaticScrollRef.current) return;
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        const paneRect = pane.getBoundingClientRect();
        const paneCenterY = paneRect.top + paneRect.height / 2;

        let closestId: string | null = null;
        let closestDist = Infinity;

        for (const [id, el] of cardRefs.current) {
          const rect = el.getBoundingClientRect();
          const cardCenterY = rect.top + rect.height / 2;
          const dist = Math.abs(cardCenterY - paneCenterY);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = id;
          }
        }

        if (closestId && closestId !== selectedId) {
          setSelectedId(closestId);
        }
      });
    };

    pane.addEventListener("scroll", handleScroll, { passive: true });
    return () => pane.removeEventListener("scroll", handleScroll);
  }, [questions, selectedId]);

  // --- Selection from WorkTree click: scroll right pane to card ---
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const el = cardRefs.current.get(id);
    if (el) {
      programmaticScrollRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 600);
    }
  }, []);

  // --- Open type picker (append or insert) ---
  const openTypePicker = useCallback((order?: number) => {
    setInsertAtOrder(order ?? null);
    setTypePickerOpen(true);
  }, []);

  // --- Create question of selected type ---
  const handleCreateQuestion = useCallback(
    async (type: ExamQuestionType) => {
      setTypePickerOpen(false);
      if (frozen) return;
      try {
        const base = DEFAULT_PAYLOADS[type];
        const order = insertAtOrder ?? questions.length;
        const created = await createExamQuestion(contestId, { ...base, order });
        showToast({ kind: "success", title: "題目已新增" });
        await loadQuestions();
        if (created?.id) {
          setSelectedId(created.id);
          requestAnimationFrame(() => {
            const el = cardRefs.current.get(created.id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
      } catch (error) {
        console.error("Failed to create exam question", error);
        const message = error instanceof Error ? error.message : "新增失敗";
        showToast({ kind: "error", title: "新增失敗", subtitle: message });
      }
    },
    [contestId, frozen, insertAtOrder, questions.length, loadQuestions, showToast],
  );

  // --- Reorder (debounced) ---
  const handleReorder = useCallback(
    (newOrder: ExamQuestion[]) => {
      setQuestions(newOrder);
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
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
    [contestId, loadQuestions, showToast],
  );

  // --- Save (update) ---
  const handleSave = useCallback(
    async (payload: ExamQuestionUpsertPayload, questionId?: string) => {
      try {
        if (questionId) {
          await updateExamQuestion(contestId, questionId, payload);
          showToast({ kind: "success", title: "題目已更新" });
        }
        await loadQuestions();
      } catch (error) {
        console.error("Failed to save exam question", error);
        const message = error instanceof Error ? error.message : "儲存失敗";
        showToast({ kind: "error", title: "儲存失敗", subtitle: message });
      }
    },
    [contestId, loadQuestions, showToast],
  );

  // --- Duplicate ---
  const handleDuplicate = useCallback(
    async (questionId: string) => {
      if (frozen) return;
      const source = questions.find((q) => q.id === questionId);
      if (!source) return;
      try {
        const payload: ExamQuestionUpsertPayload = {
          question_type: source.questionType,
          prompt: source.prompt,
          score: source.score,
          order: source.order + 1,
        };
        if (source.options && source.options.length > 0) {
          payload.options = [...source.options];
        }
        if (source.correctAnswer != null) {
          payload.correct_answer = Array.isArray(source.correctAnswer)
            ? [...source.correctAnswer]
            : source.correctAnswer;
        }
        const created = await createExamQuestion(contestId, payload);
        showToast({ kind: "success", title: "題目已複製" });
        await loadQuestions();
        if (created?.id) {
          setSelectedId(created.id);
          requestAnimationFrame(() => {
            const el = cardRefs.current.get(created.id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
      } catch (error) {
        console.error("Failed to duplicate exam question", error);
        const message = error instanceof Error ? error.message : "複製失敗";
        showToast({ kind: "error", title: "複製失敗", subtitle: message });
      }
    },
    [contestId, frozen, questions, loadQuestions, showToast],
  );

  // --- Delete ---
  const handleDelete = useCallback(
    async (questionId: string) => {
      const q = questions.find((q) => q.id === questionId);
      const accepted = await confirm({
        title: `確定刪除題目 #${(q?.order ?? 0) + 1}？`,
        danger: true,
        confirmLabel: "刪除",
        cancelLabel: "取消",
      });
      if (!accepted) return;
      try {
        await deleteExamQuestion(contestId, questionId);
        showToast({ kind: "success", title: "題目已刪除" });
        if (selectedId === questionId) {
          setSelectedId(null);
        }
        await loadQuestions();
      } catch (error) {
        console.error("Failed to delete exam question", error);
        showToast({ kind: "error", title: "刪除失敗" });
      }
    },
    [contestId, questions, selectedId, confirm, loadQuestions, showToast],
  );

  return (
    <>
      <div className={styles.editorLayout}>
        {/* Left: WorkTree */}
        <div className={styles.workTreePane}>
          <WorkTree
            questions={questions}
            selectedId={selectedId}
            frozen={frozen}
            loading={loading && questions.length === 0}
            onSelect={handleSelect}
            onAdd={() => openTypePicker()}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        </div>

        {/* Right: card list with drag-to-reorder */}
        <Reorder.Group
          axis="y"
          values={questions}
          onReorder={handleReorder}
          as="div"
          className={styles.editorPane}
          ref={editorPaneRef}
        >
          {questions.map((q, i) => (
            <CardReorderItem
              key={q.id}
              question={q}
              index={i}
              frozen={frozen}
              onSave={handleSave}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onInsertBefore={i > 0 ? () => openTypePicker(i) : undefined}
              cardRefCallback={(el) => {
                if (el) cardRefs.current.set(q.id, el);
                else cardRefs.current.delete(q.id);
              }}
            />
          ))}
          {!frozen && (
            <div className={styles.addQuestionRow}>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={Add}
                onClick={() => openTypePicker()}
              >
                新增題目
              </Button>
            </div>
          )}
        </Reorder.Group>
      </div>

      {/* Type picker dialog */}
      <Modal
        open={typePickerOpen}
        onRequestClose={() => setTypePickerOpen(false)}
        modalHeading="選擇題目類型"
        passiveModal
        size="sm"
      >
        <div className={styles.typePickerGrid}>
          {QUESTION_TYPES.map(({ type, label, description, icon: Icon }) => (
            <button
              key={type}
              type="button"
              className={styles.typePickerCard}
              onClick={() => handleCreateQuestion(type)}
            >
              <Icon size={24} />
              <div className={styles.typePickerInfo}>
                <span className={styles.typePickerLabel}>{label}</span>
                <span className={styles.typePickerDesc}>{description}</span>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmModal {...modalProps} />
    </>
  );
};

// --- Draggable card wrapper for right pane ---

const CardReorderItem: React.FC<{
  question: ExamQuestion;
  index: number;
  frozen: boolean;
  onSave: (payload: ExamQuestionUpsertPayload, questionId?: string) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onDuplicate: (questionId: string) => Promise<void>;
  onInsertBefore?: () => void;
  cardRefCallback: (el: HTMLDivElement | null) => void;
}> = ({ question, index, frozen, onSave, onDelete, onDuplicate, onInsertBefore, cardRefCallback }) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={dragControls}
      drag={!frozen}
      as="div"
      className={styles.cardItem}
    >
      {onInsertBefore && (
        <InsertDivider frozen={frozen} onClick={onInsertBefore} />
      )}
      <div ref={cardRefCallback}>
        <ExamQuestionEditCard
          question={question}
          index={index}
          frozen={frozen}
          onSave={onSave}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onPointerDownDrag={!frozen ? (e) => dragControls.start(e) : undefined}
        />
      </div>
    </Reorder.Item>
  );
};

// --- Insert divider between cards ---

const InsertDivider: React.FC<{ frozen?: boolean; onClick: () => void }> = ({
  frozen,
  onClick,
}) => {
  if (frozen) {
    return <div className={styles.divider} />;
  }
  return (
    <div className={styles.dividerHover}>
      <div className={styles.dividerLine} />
      <button
        type="button"
        className={styles.dividerBtn}
        onClick={onClick}
        aria-label="在此插入題目"
      >
        <Add size={14} />
      </button>
      <div className={styles.dividerLine} />
    </div>
  );
};

export default ExamEditorLayout;
