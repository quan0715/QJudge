import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import {
  createQuestion,
  deleteQuestion,
  updateQuestion,
} from "@/infrastructure/api/repositories/questionBank.repository";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories/examQuestions.repository";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import WorkTree from "@/features/contest/components/admin/examEditor/WorkTree";
import ExamQuestionEditCard from "@/features/contest/components/admin/examEditor/ExamQuestionEditCard";
import { useTranslation } from "react-i18next";
import { EXAM_QUESTION_TYPE_ICON as QUESTION_TYPE_ICONS } from "@/shared/ui/examQuestionTypeVisual";
import styles from "./QuestionBankExamEditor.module.scss";

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

const DEFAULT_PAYLOADS: Record<
  ExamQuestionType,
  Omit<ExamQuestionUpsertPayload, "order">
> = {
  single_choice: {
    question_type: "single_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: 0,
  },
  multiple_choice: {
    question_type: "multiple_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: [0],
  },
  true_false: {
    question_type: "true_false",
    prompt: "New question",
    score: 5,
    options: ["True", "False"],
    correct_answer: true,
  },
  short_answer: { question_type: "short_answer", prompt: "New question", score: 5 },
  essay: { question_type: "essay", prompt: "New question", score: 5 },
};

const TRUE_FALSE_OPTIONS = ["True", "False"];
const GENERATED_TITLE_PATTERN = /^(test|exam|question)\s*[-_ ]\s*q?\d+$/i;

const sanitizeTitleFromPrompt = (prompt: string, order: number): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return `Question ${order + 1}`;
  return normalized.slice(0, 64);
};

const resolveStoredTitle = (title: string | undefined, prompt: string, order: number): string => {
  const rawTitle = (title || "").trim();
  if (!rawTitle) return sanitizeTitleFromPrompt(prompt, order);
  if (GENERATED_TITLE_PATTERN.test(rawTitle)) {
    return sanitizeTitleFromPrompt(prompt, order);
  }
  return rawTitle;
};

const resolveExamQuestionType = (question: BankQuestion): ExamQuestionType => {
  const meta =
    question.metadata && typeof question.metadata === "object"
      ? (question.metadata as Record<string, unknown>)
      : {};

  const direct = meta.exam_question_type;
  if (typeof direct === "string" && QUESTION_TYPE_ORDER.includes(direct as ExamQuestionType)) {
    return direct as ExamQuestionType;
  }

  const legacy = meta.legacy_question_type;
  if (typeof legacy === "string" && QUESTION_TYPE_ORDER.includes(legacy as ExamQuestionType)) {
    return legacy as ExamQuestionType;
  }

  if (Array.isArray(question.correctAnswer)) return "multiple_choice";
  if (typeof question.correctAnswer === "string" && question.options.length === 0) {
    return "short_answer";
  }
  return "single_choice";
};

const toExamQuestion = (bankId: string, question: BankQuestion): ExamQuestion => ({
  id: question.id,
  contestId: bankId,
  questionType: resolveExamQuestionType(question),
  prompt: question.prompt || "",
  options: Array.isArray(question.options) ? question.options.map((item) => String(item)) : [],
  correctAnswer: question.correctAnswer,
  score: Number(question.score || 0),
  order: Number(question.order || 0),
  createdAt: question.createdAt || "",
  updatedAt: question.updatedAt || "",
});

interface QuestionBankExamEditorProps {
  bankId: string;
  questions: BankQuestion[];
  loading?: boolean;
  onReload: () => Promise<void>;
}

const QuestionBankExamEditor: React.FC<QuestionBankExamEditorProps> = ({
  bankId,
  questions,
  loading = false,
  onReload,
}) => {
  const { showToast } = useToast();
  const { t } = useTranslation("contest");
  const { confirm, modalProps } = useConfirmModal();

  const examBankQuestions = useMemo(
    () => questions.filter((question) => question.questionType === "exam"),
    [questions]
  );

  const bankQuestionById = useMemo(() => {
    const pairs = examBankQuestions.map((question) => [question.id, question] as const);
    return new Map<string, BankQuestion>(pairs);
  }, [examBankQuestions]);

  const [editorQuestions, setEditorQuestions] = useState<ExamQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState<number | null>(null);
  const [savingReorder, setSavingReorder] = useState(false);

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    const mapped = examBankQuestions
      .map((question) => toExamQuestion(bankId, question))
      .sort((a, b) => a.order - b.order);
    setEditorQuestions(mapped);
  }, [bankId, examBankQuestions]);

  useEffect(() => {
    if (editorQuestions.length > 0 && selectedId === null) {
      setSelectedId(editorQuestions[0].id);
    }
  }, [editorQuestions, selectedId]);

  useEffect(
    () => () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane || editorQuestions.length === 0) return;

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
  }, [editorQuestions, selectedId]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const el = cardRefs.current.get(id);
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);
  }, []);

  const toBankPayload = useCallback(
    (
      payload: ExamQuestionUpsertPayload,
      existing?: BankQuestion,
      forcedOrder?: number
    ): UpsertBankQuestionPayload => {
      const order = forcedOrder ?? payload.order ?? existing?.order ?? 0;
      const prompt = payload.prompt?.trim() || existing?.prompt || "New question";
      const existingMetadata =
        existing?.metadata && typeof existing.metadata === "object"
          ? existing.metadata
          : {};

      return {
        questionType: "exam",
        title: resolveStoredTitle(existing?.title, prompt, order),
        prompt,
        options:
          payload.question_type === "true_false"
            ? [...TRUE_FALSE_OPTIONS]
            : payload.options || [],
        correctAnswer: payload.correct_answer ?? null,
        score: Number(payload.score || existing?.score || 0),
        order,
        metadata: {
          ...existingMetadata,
          exam_question_type: payload.question_type,
        },
      };
    },
    []
  );

  const shiftOrdersFrom = useCallback(
    async (startOrder: number) => {
      const targets = [...editorQuestions]
        .filter((question) => question.order >= startOrder)
        .sort((a, b) => b.order - a.order);

      for (const question of targets) {
        const source = bankQuestionById.get(question.id);
        if (!source) continue;
        const payload = toBankPayload(
          {
            question_type: question.questionType,
            prompt: question.prompt,
            options: question.options,
            correct_answer: question.correctAnswer,
            score: question.score,
          },
          source,
          question.order + 1
        );
        await updateQuestion(question.id, payload);
      }
    },
    [bankQuestionById, editorQuestions, toBankPayload]
  );

  const persistReorder = useCallback(
    async (nextQuestions: ExamQuestion[]) => {
      if (savingReorder) return;
      setSavingReorder(true);
      try {
        const updates = nextQuestions
          .map((question, index) => ({ question, nextOrder: index }))
          .filter(({ question, nextOrder }) => question.order !== nextOrder);

        for (const item of updates) {
          const source = bankQuestionById.get(item.question.id);
          if (!source) continue;
          const payload = toBankPayload(
            {
              question_type: item.question.questionType,
              prompt: item.question.prompt,
              options: item.question.options,
              correct_answer: item.question.correctAnswer,
              score: item.question.score,
            },
            source,
            item.nextOrder
          );
          await updateQuestion(item.question.id, payload);
        }
        await onReload();
      } catch (error) {
        console.error("Failed to reorder exam bank questions", error);
        showToast({
          kind: "error",
          title: t("examEditor.sortUpdateFailed", "排序更新失敗"),
        });
        await onReload();
      } finally {
        setSavingReorder(false);
      }
    },
    [bankQuestionById, onReload, savingReorder, showToast, t, toBankPayload]
  );

  const openTypePicker = useCallback((order?: number) => {
    setInsertAtOrder(order ?? null);
    setTypePickerOpen(true);
  }, []);

  const handleCreateQuestion = useCallback(
    async (type: ExamQuestionType) => {
      setTypePickerOpen(false);
      const targetOrder = insertAtOrder ?? editorQuestions.length;

      try {
        if (insertAtOrder !== null) {
          await shiftOrdersFrom(targetOrder);
        }
        const base = DEFAULT_PAYLOADS[type];
        const created = await createQuestion(
          bankId,
          toBankPayload({ ...base, order: targetOrder })
        );
        showToast({
          kind: "success",
          title: t("examEditor.questionAdded", "題目已新增"),
        });
        await onReload();
        if (created?.id) {
          setSelectedId(created.id);
        }
      } catch (error) {
        console.error("Failed to create bank exam question", error);
        const message =
          error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({
          kind: "error",
          title: t("examEditor.addFailed", "新增失敗"),
          subtitle: message,
        });
      } finally {
        setInsertAtOrder(null);
      }
    },
    [
      bankId,
      editorQuestions.length,
      insertAtOrder,
      onReload,
      shiftOrdersFrom,
      showToast,
      t,
      toBankPayload,
    ]
  );

  const handleSave = useCallback(
    async (payload: ExamQuestionUpsertPayload, questionId?: string) => {
      if (!questionId) return;
      try {
        const source = bankQuestionById.get(questionId);
        await updateQuestion(questionId, toBankPayload(payload, source));
        showToast({
          kind: "success",
          title: t("examEditor.questionUpdated", "題目已更新"),
        });
        await onReload();
      } catch (error) {
        console.error("Failed to save bank exam question", error);
        const message =
          error instanceof Error ? error.message : t("examEditor.saveFailed", "儲存失敗");
        showToast({
          kind: "error",
          title: t("examEditor.saveFailed", "儲存失敗"),
          subtitle: message,
        });
      }
    },
    [bankQuestionById, onReload, showToast, t, toBankPayload]
  );

  const handleDuplicate = useCallback(
    async (questionId: string) => {
      const source = bankQuestionById.get(questionId);
      if (!source) return;

      try {
        const targetOrder = Number(source.order || 0) + 1;
        await shiftOrdersFrom(targetOrder);
        const created = await createQuestion(
          bankId,
          {
            ...toBankPayload(
              {
                question_type: resolveExamQuestionType(source),
                prompt: source.prompt || "",
                options: source.options as string[],
                correct_answer: source.correctAnswer,
                score: source.score,
                order: targetOrder,
              },
              source,
              targetOrder
            ),
            title: `${source.title} (copy)`,
          }
        );
        showToast({
          kind: "success",
          title: t("examEditor.questionCopied", "題目已複製"),
        });
        await onReload();
        if (created?.id) setSelectedId(created.id);
      } catch (error) {
        console.error("Failed to duplicate bank exam question", error);
        const message =
          error instanceof Error ? error.message : t("examEditor.copyFailed", "複製失敗");
        showToast({
          kind: "error",
          title: t("examEditor.copyFailed", "複製失敗"),
          subtitle: message,
        });
      }
    },
    [bankId, bankQuestionById, onReload, shiftOrdersFrom, showToast, t, toBankPayload]
  );

  const handleDelete = useCallback(
    async (questionId: string) => {
      const source = bankQuestionById.get(questionId);
      const accepted = await confirm({
        title: t("examEditor.confirmDelete", {
          num: Number(source?.order || 0) + 1,
        }),
        danger: true,
        confirmLabel: t("button.delete", "刪除"),
        cancelLabel: t("button.cancel", "取消"),
      });
      if (!accepted) return;

      try {
        await deleteQuestion(questionId);
        showToast({
          kind: "success",
          title: t("examEditor.questionDeleted", "題目已刪除"),
        });
        if (selectedId === questionId) setSelectedId(null);
        await onReload();
      } catch (error) {
        console.error("Failed to delete bank exam question", error);
        showToast({
          kind: "error",
          title: t("examEditor.deleteFailed", "刪除失敗"),
        });
      }
    },
    [bankQuestionById, confirm, onReload, selectedId, showToast, t]
  );

  const handleReorder = useCallback(
    (reordered: ExamQuestion[]) => {
      setEditorQuestions(reordered.map((question, index) => ({ ...question, order: index })));
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = setTimeout(() => {
        void persistReorder(reordered);
      }, 600);
    },
    [persistReorder]
  );

  const sidebarContent = (
    <WorkTree
      questions={editorQuestions}
      selectedId={selectedId}
      loading={loading && editorQuestions.length === 0}
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
          values={editorQuestions}
          onReorder={handleReorder}
          as="div"
          className={styles.reorderGroup}
        >
          {editorQuestions.map((question, index) => (
            <CardReorderItem
              key={question.id}
              question={question}
              index={index}
              onSave={handleSave}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onInsertBefore={index > 0 ? () => openTypePicker(index) : undefined}
              cardRefCallback={(el) => {
                if (el) cardRefs.current.set(question.id, el);
                else cardRefs.current.delete(question.id);
              }}
            />
          ))}
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
        </Reorder.Group>
      </AdminSplitLayout>

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
                onClick={() => {
                  void handleCreateQuestion(type);
                }}
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

      <ConfirmModal {...modalProps} />
    </>
  );
};

const CardReorderItem: React.FC<{
  question: ExamQuestion;
  index: number;
  onSave: (payload: ExamQuestionUpsertPayload, questionId?: string) => Promise<void>;
  onDelete: (questionId: string) => Promise<void>;
  onDuplicate: (questionId: string) => Promise<void>;
  onInsertBefore?: () => void;
  cardRefCallback: (el: HTMLDivElement | null) => void;
}> = ({
  question,
  index,
  onSave,
  onDelete,
  onDuplicate,
  onInsertBefore,
  cardRefCallback,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={dragControls}
      as="div"
      className={styles.cardItem}
    >
      {onInsertBefore ? (
        <InsertDivider
          onClick={onInsertBefore}
        />
      ) : null}
      <div ref={cardRefCallback}>
        <ExamQuestionEditCard
          question={question}
          index={index}
          onSave={onSave}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onPointerDownDrag={(e) => dragControls.start(e)}
        />
      </div>
    </Reorder.Item>
  );
};

const InsertDivider: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation("contest");
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

export default QuestionBankExamEditor;
