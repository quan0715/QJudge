import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
} from "react";
import { Button, Modal } from "@carbon/react";
import {
  Add,
  Close,
  Menu,
  DocumentDownload,
  Upload,
  View,
} from "@carbon/icons-react";
import { CardListEditor } from "@/shared/ui/cardListEditor";
import type { ContestDetail, ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import {
  getExamQuestions,
  createExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
  reorderExamQuestions,
  previewExamQuestionsImport,
  applyExamQuestionsImport,
  importExamQuestionsFromBank,
  type ExamQuestionUpsertPayload,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import WorkTree from "./WorkTree";
import ExamQuestionEditCard from "./ExamQuestionEditCard";
import { useTranslation } from "react-i18next";
import ExamQuestionJsonImportModal from "./ExamQuestionJsonImportModal";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import QuestionBankImportModal, { type BankImportSelectionItem } from "./QuestionBankImportModal";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import QuestionSourcePanel from "./QuestionSourcePanel";
import type { QuestionSourceDragItem } from "./questionSource.types";
import useToolbarSaveStatus from "./hooks/useToolbarSaveStatus";
import { useEditorPaneScrollSelection } from "./hooks/useEditorPaneScrollSelection";
import styles from "./ExamEditorLayout.module.scss";

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice", "multiple_choice", "true_false", "short_answer", "essay",
];

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
  onExport?: () => void;
  onPreview?: () => void;
}

export interface ExamEditorLayoutHandle {
  openJsonImportModal: () => void;
}

const useCompactScreen = (query = "(max-width: 900px)") => {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return isCompact;
};

const moveQuestion = (list: ExamQuestion[], fromIndex: number, toIndex: number): ExamQuestion[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  if (!item) return list;
  copy.splice(toIndex, 0, item);
  return copy.map((question, order) => ({ ...question, order }));
};

const resolveInsertedQuestionId = (
  beforeIds: Set<string>,
  afterList: ExamQuestion[],
  preferredId?: string | null,
): string | null => {
  if (preferredId && afterList.some((question) => question.id === preferredId)) {
    return preferredId;
  }
  const inserted = afterList.find((question) => !beforeIds.has(question.id));
  return inserted?.id ?? null;
};

const ExamEditorLayout = React.forwardRef<ExamEditorLayoutHandle, ExamEditorLayoutProps>(({
  contestId,
  contest,
  onExport,
  onPreview,
}, ref) => {
  const { showToast } = useToast();
  const { t } = useTranslation("contest");
  const { confirm, modalProps } = useConfirmModal();
  const toolbarSave = useToolbarSaveStatus();

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sourceDragItem, setSourceDragItem] = useState<QuestionSourceDragItem | null>(null);
  const [sourceHoverIndex, setSourceHoverIndex] = useState<number | null>(null);
  const [sourcePanelExpanded, setSourcePanelExpanded] = useState(true);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState<number | null>(null);
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [saveToBankQuestion, setSaveToBankQuestion] = useState<ExamQuestion | null>(null);

  const frozen = !!contest.questionEditLocked;
  const lockedReason = "已有學生正式作答，競賽題目已鎖定";
  const isCompactScreen = useCompactScreen();

  const examScrollItemsKey = useMemo(
    () => questions.map((question) => question.id).join(","),
    [questions],
  );

  const {
    editorPaneRef,
    onReorderPointerSessionChange,
    handleSelect,
    onCardRoot,
  } = useEditorPaneScrollSelection(selectedId, setSelectedId, examScrollItemsKey);

  const loadQuestions = useCallback(async (): Promise<ExamQuestion[]> => {
    if (!contestId) return [];
    try {
      setLoading(true);
      const list = await getExamQuestions(contestId);
      const sorted = list.sort((a, b) => a.order - b.order);
      setQuestions(sorted);
      return sorted;
    } catch (error) {
      console.error("Failed to load exam questions", error);
      showToast({ kind: "error", title: t("examEditor.loadFailed", "載入失敗"), subtitle: t("examEditor.loadFailedDetail", "載入 Exam 題目失敗") });
      return [];
    } finally {
      setLoading(false);
    }
  }, [contestId, showToast, t]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const persistOrder = useCallback(
    async (orderedQuestions: ExamQuestion[]) => {
      const payload = orderedQuestions.map((question, order) => ({ id: question.id, order }));
      const result = await toolbarSave.track(() => reorderExamQuestions(contestId, payload));
      setQuestions(result.sort((a, b) => a.order - b.order));
    },
    [contestId, toolbarSave]
  );

  const insertImportedQuestionAt = useCallback(
    async (
      targetIndex: number,
      importer: () => Promise<string | null>
    ) => {
      if (frozen) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const beforeIds = new Set(questions.map((question) => question.id));
      let preferredId: string | null = null;

      try {
        preferredId = await importer();
        const reloaded = await loadQuestions();
        const insertedId = resolveInsertedQuestionId(beforeIds, reloaded, preferredId);
        if (!insertedId) {
          showToast({
            kind: "warning",
            title: t("examEditor.sourceInsertFallback", "題目已新增至尾端"),
            subtitle: t("examEditor.sourceInsertFallbackDetail", "無法精準識別新題目，已改為尾端插入"),
          });
          return;
        }

        const currentIndex = reloaded.findIndex((question) => question.id === insertedId);
        if (currentIndex < 0) return;

        const boundedIndex = Math.max(0, Math.min(targetIndex, reloaded.length - 1));
        if (boundedIndex !== currentIndex) {
          const moved = moveQuestion(reloaded, currentIndex, boundedIndex);
          await persistOrder(moved);
        }

        setSelectedId(insertedId);
      } catch (error) {
        console.error("Failed to insert imported question", error);
        const message = error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗"), subtitle: message });
        await loadQuestions();
      }
    },
    [frozen, loadQuestions, lockedReason, persistOrder, questions, showToast, t]
  );

  const handleJsonImportPreview = useCallback(
    async (payload: { payloadJson: string; importMode: "append" | "replace_all" | "replace_manual_only" }) => {
      if (frozen) {
        throw new Error(lockedReason);
      }
      return previewExamQuestionsImport(contestId, {
        payload_json: payload.payloadJson,
        import_mode: payload.importMode,
      });
    },
    [contestId, frozen, lockedReason],
  );

  const handleJsonImportApply = useCallback(
    async (payload: {
      payloadJson: string;
      importMode: "append" | "replace_all" | "replace_manual_only";
      fingerprint?: string;
    }) => {
      if (frozen) {
        throw new Error(lockedReason);
      }

      const result = await toolbarSave.track(() =>
        applyExamQuestionsImport(contestId, {
          payload_json: payload.payloadJson,
          import_mode: payload.importMode,
          fingerprint: payload.fingerprint,
        }),
      );
      await loadQuestions();
      setSelectedId(null);
      showToast({
        kind: "success",
        title: t("examEditor.importSuccess", "匯入成功"),
        subtitle: t("examEditor.importSuccessDetail", { count: result.applied_summary.will_add }),
      });
    },
    [contestId, frozen, loadQuestions, lockedReason, showToast, t, toolbarSave],
  );

  useImperativeHandle(
    ref,
    () => ({
      openJsonImportModal: () => setJsonImportOpen(true),
    }),
    [],
  );

  const handleImportFromBank = useCallback(
    async (items: BankImportSelectionItem[]) => {
      if (items.length === 0) return;
      if (frozen) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      await toolbarSave.track(() => importExamQuestionsFromBank(contestId, {
        items: items.map((item) => ({
          question_bank_id: item.questionBankId,
          question_id: item.questionId,
        })),
      }));
      await loadQuestions();
      showToast({
        kind: "success",
        title: t("examEditor.importSuccess", "匯入成功"),
        subtitle: t("examEditor.importSuccessDetail", { count: items.length }),
      });
    },
    [contestId, frozen, loadQuestions, lockedReason, showToast, t, toolbarSave],
  );

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

  const scrollEditorToBottom = useCallback(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    requestAnimationFrame(() => {
      pane.scrollTo({ top: pane.scrollHeight, behavior: "smooth" });
    });
  }, [editorPaneRef]);

  const openTypePicker = useCallback((order?: number) => {
    setInsertAtOrder(order ?? null);
    setTypePickerOpen(true);
  }, []);

  const handleCreateQuestion = useCallback(
    async (type: ExamQuestionType) => {
      setTypePickerOpen(false);
      if (frozen) return;
      try {
        const base = DEFAULT_PAYLOADS[type];
        const order = insertAtOrder ?? questions.length;
        const created = await toolbarSave.track(() =>
          createExamQuestion(contestId, { ...base, order })
        );
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
    [contestId, frozen, insertAtOrder, loadQuestions, questions.length, showToast, t, toolbarSave],
  );

  const handleReorder = useCallback(
    (newOrder: ExamQuestion[]) => {
      setQuestions(newOrder.map((question, order) => ({ ...question, order })));
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = setTimeout(async () => {
        try {
          await persistOrder(newOrder.map((question, order) => ({ ...question, order })));
        } catch (error) {
          console.error("Failed to reorder", error);
          showToast({ kind: "error", title: t("examEditor.sortUpdateFailed", "排序更新失敗") });
          await loadQuestions();
        }
      }, 600);
    },
    [loadQuestions, persistOrder, showToast, t],
  );

  const handleAutoSave = useCallback(
    async (payload: ExamQuestionUpsertPayload, questionId?: string) => {
      if (!questionId) return;
      try {
        const updated = await toolbarSave.track(() =>
          updateExamQuestion(contestId, questionId, payload)
        );
        setQuestions((prev) =>
          prev.map((question) =>
            question.id === questionId
              ? { ...question, ...updated }
              : question
          )
        );
      } catch (error) {
        console.error("Failed to save exam question", error);
        throw error;
      }
    },
    [contestId, toolbarSave],
  );

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
        const created = await toolbarSave.track(() =>
          createExamQuestion(contestId, payload)
        );
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
    [contestId, frozen, loadQuestions, questions, showToast, t, toolbarSave],
  );

  const handleDelete = useCallback(
    async (questionId: string) => {
      const q = questions.find((question) => question.id === questionId);
      const accepted = await confirm({
        title: t("examEditor.confirmDelete", { num: (q?.order ?? 0) + 1 }),
        danger: true,
        confirmLabel: t("button.delete", "刪除"),
        cancelLabel: t("button.cancel", "取消"),
      });
      if (!accepted) return;
      try {
        await toolbarSave.track(() => deleteExamQuestion(contestId, questionId));
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
    [confirm, contestId, loadQuestions, questions, selectedId, showToast, t, toolbarSave],
  );

  const handleInsertFromSource = useCallback(
    async (targetIndex: number, sourceItem: QuestionSourceDragItem) => {
      if (sourceItem.kind === "exam_type") {
        await insertImportedQuestionAt(targetIndex, async () => {
          const created = await toolbarSave.track(() =>
            createExamQuestion(contestId, {
              ...DEFAULT_PAYLOADS[sourceItem.questionType],
              order: questions.length,
            })
          );
          return created?.id ?? null;
        });
        return;
      }

      if (sourceItem.kind === "bank_question") {
        await insertImportedQuestionAt(targetIndex, async () => {
          await toolbarSave.track(() =>
            importExamQuestionsFromBank(contestId, {
              items: [
                {
                  question_bank_id: sourceItem.questionBankId,
                  question_id: sourceItem.questionId,
                },
              ],
            })
          );
          return null;
        });
      }
    },
    [contestId, insertImportedQuestionAt, questions.length, toolbarSave]
  );

  const sidebarContent = (
    <WorkTree
      questions={questions}
      selectedId={selectedId}
      frozen={frozen}
      loading={loading && questions.length === 0}
      onSelect={handleSelect}
      onAdd={() => openTypePicker()}
      onReorder={handleReorder}
      onReorderPointerSessionChange={onReorderPointerSessionChange}
    />
  );

  const sourcePanelContent = (
    <QuestionSourcePanel
      mode="paper"
      onDragStart={(item) => setSourceDragItem(item)}
      onDragEnd={() => {
        setSourceDragItem(null);
        setSourceHoverIndex(null);
      }}
      onAddType={(questionType) => {
        void handleInsertFromSource(questions.length, {
          kind: "exam_type",
          questionType,
        }).then(scrollEditorToBottom);
      }}
      onAddBankQuestion={(item) => {
        void handleInsertFromSource(questions.length, {
          kind: "bank_question",
          category: "exam",
          questionBankId: item.questionBankId,
          questionId: item.questionId,
          title: item.title,
        }).then(scrollEditorToBottom);
      }}
    />
  );

  const sourcePanelOpen = isCompactScreen ? sourceModalOpen : sourcePanelExpanded;
  const toggleSourcePanel = () => {
    if (isCompactScreen) {
      setSourceModalOpen((prev) => !prev);
      return;
    }
    setSourcePanelExpanded((prev) => !prev);
  };

  return (
    <>
      <AdminSplitLayout
        toolbar={
          <PanelToolbar
            leftActions={(
              <Button
                kind="ghost"
                size="md"
                hasIconOnly
                renderIcon={sidebarExpanded ? Close : Menu}
                iconDescription={t(
                  sidebarExpanded
                    ? "examEditor.hideQuestionList"
                    : "examEditor.showQuestionList",
                  sidebarExpanded ? "隱藏題目列表" : "顯示題目列表"
                )}
                onClick={() => setSidebarExpanded((prev) => !prev)}
              />
            )}
            title={t("examEditor.questionManagement", "題目管理")}
            status={(
              <div className={styles.toolbarStatusGroup}>
                <GlobalSaveStatus status={toolbarSave.status} />
                {frozen ? <span className={styles.lockedHint}>{lockedReason}</span> : null}
              </div>
            )}
            actions={
              <>
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Upload}
                  iconDescription={t("examJson.importAction", "匯入 JSON")}
                  onClick={() => setJsonImportOpen(true)}
                />
                {onExport && (
                  <Button
                    kind="ghost"
                    size="md"
                    hasIconOnly
                    renderIcon={DocumentDownload}
                    iconDescription={t("adminLayout.header.exportFiles", "匯出")}
                    onClick={onExport}
                  />
                )}
                {onPreview && (
                  <Button
                    kind="ghost"
                    size="md"
                    hasIconOnly
                    renderIcon={View}
                    iconDescription={t("adminLayout.header.previewAnswer", "預覽")}
                    onClick={onPreview}
                  />
                )}
                <Button
                  kind="primary"
                  size="md"
                  hasIconOnly
                  renderIcon={sourcePanelOpen ? Close : Add}
                  iconDescription={t(
                    sourcePanelOpen
                      ? "examEditor.collapseSourcePanel"
                      : "examEditor.openSourcePanel",
                    sourcePanelOpen ? "收起題目來源" : "開啟題目來源"
                  )}
                  onClick={toggleSourcePanel}
                />
              </>
            }
          />
        }
        sidebar={sidebarContent}
        sidebarHidden={!sidebarExpanded}
        rightPane={!isCompactScreen && sourcePanelExpanded ? sourcePanelContent : undefined}
        rightPaneWidth={320}
        contentMaxWidth={720}
        contentClassName={styles.editorPane}
        ref={editorPaneRef}
      >
        <CardListEditor
          items={questions}
          onReorder={handleReorder}
          onReorderPointerSessionChange={onReorderPointerSessionChange}
          onCardRoot={onCardRoot}
          frozen={frozen}
          canDrop={!!sourceDragItem && !frozen}
          hoverIndex={sourceHoverIndex}
          onHoverIndexChange={setSourceHoverIndex}
          onDropAt={(index) => {
            if (!sourceDragItem || frozen) return;
            const droppedItem = sourceDragItem;
            setSourceDragItem(null);
            void handleInsertFromSource(index, droppedItem);
          }}
          renderCard={(q, i, dragHandleProps) => (
            <ExamQuestionEditCard
              question={q}
              index={i}
              frozen={frozen}
              onAutoSave={handleAutoSave}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onSaveToBank={(question) => setSaveToBankQuestion(question)}
              onPointerDownDrag={dragHandleProps?.onPointerDown}
            />
          )}
        />
      </AdminSplitLayout>

      <Modal
        open={sourceModalOpen}
        onRequestClose={() => setSourceModalOpen(false)}
        modalHeading={t("examEditor.sourcePanelTitle", "題目來源")}
        passiveModal
        size="md"
      >
        <div className={styles.sourceModalBody}>{sourcePanelContent}</div>
      </Modal>

      <Modal
        open={typePickerOpen}
        onRequestClose={() => setTypePickerOpen(false)}
        modalHeading={t("examEditor.selectQuestionType", "選擇題目類型")}
        passiveModal
        size="sm"
      >
        <div className={styles.typePickerGrid}>
          {QUESTION_TYPE_ORDER.map((type) => {
            const Icon = EXAM_QUESTION_TYPE_ICON[type];
            return (
              <button
                key={type}
                type="button"
                className={styles.typePickerCard}
                onClick={() => void handleCreateQuestion(type)}
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
        contestName={contest.name}
        onClose={() => setJsonImportOpen(false)}
        onPreviewImport={handleJsonImportPreview}
        onApplyImport={handleJsonImportApply}
      />

      <QuestionBankImportModal
        open={bankImportOpen}
        category="exam"
        onClose={() => setBankImportOpen(false)}
        onConfirm={async (items) => {
          await handleImportFromBank(items);
        }}
      />

      <ConfirmModal {...modalProps} />

      <SaveToBankModal
        open={saveToBankQuestion !== null}
        onClose={() => setSaveToBankQuestion(null)}
        sourceType="exam_question"
        sourceId={saveToBankQuestion?.id || ""}
        sourceTitle={saveToBankQuestion?.prompt?.slice(0, 60) || ""}
      />
    </>
  );
});

ExamEditorLayout.displayName = "ExamEditorLayout";

export default ExamEditorLayout;
