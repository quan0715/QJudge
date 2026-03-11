import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
} from "react";
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
  batchImportExamQuestions,
  type ExamQuestionUpsertPayload,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import WorkTree from "./WorkTree";
import ExamQuestionEditCard from "./ExamQuestionEditCard";
import { useTranslation } from "react-i18next";
import ExamQuestionJsonImportModal from "./ExamQuestionJsonImportModal";
import { type ExamQuestionJsonNormalizedQuestion } from "./examQuestionJson";
import styles from "./ExamEditorLayout.module.scss";

// --- Question type picker config ---

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice", "multiple_choice", "true_false", "short_answer", "essay",
];

const QUESTION_TYPE_ICONS: Record<ExamQuestionType, React.ComponentType<{ size?: number }>> = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: Boolean,
  short_answer: Pen,
  essay: Document,
};

const DEFAULT_PAYLOADS: Record<ExamQuestionType, Omit<ExamQuestionUpsertPayload, "order">> = {
  single_choice: { question_type: "single_choice", prompt: "New question", score: 5, options: ["Option A", "Option B"], correct_answer: 0 },
  multiple_choice: { question_type: "multiple_choice", prompt: "New question", score: 5, options: ["Option A", "Option B"], correct_answer: [0] },
  true_false: { question_type: "true_false", prompt: "New question", score: 5, options: ["True", "False"], correct_answer: true },
  short_answer: { question_type: "short_answer", prompt: "New question", score: 5 },
  essay: { question_type: "essay", prompt: "New question", score: 5 },
};

interface ExamEditorLayoutProps {
  contestId: string;
  contest: ContestDetail;
}

export interface ExamEditorLayoutHandle {
  openJsonImportModal: () => void;
}

const ExamEditorLayout = React.forwardRef<ExamEditorLayoutHandle, ExamEditorLayoutProps>(({
  contestId,
  contest,
}, ref) => {
  const { showToast } = useToast();
  const { t } = useTranslation("contest");
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
  const [jsonImportOpen, setJsonImportOpen] = useState(false);

  const frozen = !!contest.isExamQuestionsFrozen;

  const toUpsertPayload = useCallback(
    (
      question: ExamQuestionJsonNormalizedQuestion,
      order: number,
    ): ExamQuestionUpsertPayload => {
      const payload: ExamQuestionUpsertPayload = {
        question_type: question.question_type,
        prompt: question.prompt,
        score: question.score,
        order,
      };

      if (
        question.question_type === "single_choice" ||
        question.question_type === "multiple_choice"
      ) {
        payload.options = question.options ?? [];
      }

      if (question.question_type === "true_false") {
        payload.options = ["True", "False"];
      }

      if (question.correct_answer !== undefined) {
        payload.correct_answer = question.correct_answer;
      }

      return payload;
    },
    [],
  );

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
      showToast({ kind: "error", title: t("examEditor.loadFailed", "載入失敗"), subtitle: t("examEditor.loadFailedDetail", "載入 Exam 題目失敗") });
    } finally {
      setLoading(false);
    }
  }, [contestId, showToast]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleJsonImport = useCallback(
    async (normalizedQuestions: ExamQuestionJsonNormalizedQuestion[]) => {
      if (frozen) {
        throw new Error("目前題目已凍結，無法匯入。");
      }

      const payloads = normalizedQuestions.map((q, index) =>
        toUpsertPayload(q, index),
      );

      await batchImportExamQuestions(contestId, payloads);
      await loadQuestions();
      setSelectedId(null);
      showToast({
        kind: "success",
        title: t("examEditor.importSuccess", "匯入成功"),
        subtitle: t("examEditor.importSuccessDetail", { count: normalizedQuestions.length }),
      });
    },
    [contestId, frozen, loadQuestions, showToast, toUpsertPayload],
  );

  useImperativeHandle(
    ref,
    () => ({
      openJsonImportModal: () => setJsonImportOpen(true),
    }),
    [],
  );

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
        showToast({ kind: "success", title: t("examEditor.questionAdded", "題目已新增") });
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
        const message = error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗"), subtitle: message });
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
          showToast({ kind: "error", title: t("examEditor.sortUpdateFailed", "排序更新失敗") });
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
          showToast({ kind: "success", title: t("examEditor.questionUpdated", "題目已更新") });
        }
        await loadQuestions();
      } catch (error) {
        console.error("Failed to save exam question", error);
        const message = error instanceof Error ? error.message : t("examEditor.saveFailed", "儲存失敗");
        showToast({ kind: "error", title: t("examEditor.saveFailed", "儲存失敗"), subtitle: message });
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
        showToast({ kind: "success", title: t("examEditor.questionCopied", "題目已複製") });
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
        const message = error instanceof Error ? error.message : t("examEditor.copyFailed", "複製失敗");
        showToast({ kind: "error", title: t("examEditor.copyFailed", "複製失敗"), subtitle: message });
      }
    },
    [contestId, frozen, questions, loadQuestions, showToast],
  );

  // --- Delete ---
  const handleDelete = useCallback(
    async (questionId: string) => {
      const q = questions.find((q) => q.id === questionId);
      const accepted = await confirm({
        title: t("examEditor.confirmDelete", { num: (q?.order ?? 0) + 1 }),
        danger: true,
        confirmLabel: t("common.delete", "刪除"),
        cancelLabel: t("common.cancel", "取消"),
      });
      if (!accepted) return;
      try {
        await deleteExamQuestion(contestId, questionId);
        showToast({ kind: "success", title: t("examEditor.questionDeleted", "題目已刪除") });
        if (selectedId === questionId) {
          setSelectedId(null);
        }
        await loadQuestions();
      } catch (error) {
        console.error("Failed to delete exam question", error);
        showToast({ kind: "error", title: t("examEditor.deleteFailed", "刪除失敗") });
      }
    },
    [contestId, questions, selectedId, confirm, loadQuestions, showToast],
  );

  const sidebarContent = (
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
  );

  return (
    <>
      <AdminSplitLayout
        sidebar={sidebarContent}
        contentMaxWidth={720}
        contentClassName={styles.editorPane}
        ref={editorPaneRef}
      >
        <Reorder.Group
          axis="y"
          values={questions}
          onReorder={handleReorder}
          as="div"
          className={styles.reorderGroup}
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
                {t("examEditor.addQuestion", "新增題目")}
              </Button>
            </div>
          )}
        </Reorder.Group>
      </AdminSplitLayout>

      {/* Type picker dialog */}
      <Modal
        open={typePickerOpen}
        onRequestClose={() => setTypePickerOpen(false)}
        modalHeading={t("examEditor.selectQuestionType", "選擇題目類型")}
        passiveModal
        size="sm"
      >
        <div className={styles.typePickerGrid}>
          {QUESTION_TYPE_ORDER.map((type) => {
            const Icon = QUESTION_TYPE_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                className={styles.typePickerCard}
                onClick={() => handleCreateQuestion(type)}
              >
                <Icon size={24} />
                <div className={styles.typePickerInfo}>
                  <span className={styles.typePickerLabel}>
                    {t(`common:questionType.label.${type}`, type)}
                  </span>
                  <span className={styles.typePickerDesc}>
                    {t(`common:questionType.description.${type}`, "")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      <ExamQuestionJsonImportModal
        open={jsonImportOpen}
        onClose={() => setJsonImportOpen(false)}
        onConfirmImport={handleJsonImport}
      />

      <ConfirmModal {...modalProps} />
    </>
  );
});

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
  const { t } = useTranslation("contest");
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
        aria-label={t("examEditor.insertHere", "在此插入題目")}
      >
        <Add size={14} />
      </button>
      <div className={styles.dividerLine} />
    </div>
  );
};

ExamEditorLayout.displayName = "ExamEditorLayout";

export default ExamEditorLayout;
