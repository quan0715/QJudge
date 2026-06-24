import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Modal } from "@carbon/react";
import {
  Add,
  Close,
  DocumentDownload,
  Menu,
  View,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
  ExamPaperBlock,
  ExamQuestion,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import {
  createExamPaperBlock,
  deleteExamPaperBlock,
  getExamPaper,
  importExamQuestionsFromBank,
  reorderExamPaperBlocks,
  updateExamPaperBlock,
  type ExamPaperQuestionPayload,
  type ExamQuestionUpsertPayload,
} from "@/infrastructure/api/repositories";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import { useToast } from "@/shared/contexts";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { CardListEditor } from "@/shared/ui/cardListEditor";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import ExamGroupEditCard from "./ExamGroupEditCard";
import ExamQuestionEditCard from "./ExamQuestionEditCard";
import QuestionBankImportModal, { type BankImportSelectionItem } from "./QuestionBankImportModal";
import QuestionSourcePanel from "./QuestionSourcePanel";
import WorkTree from "./WorkTree";
import { useEditorPaneScrollSelection } from "./hooks/useEditorPaneScrollSelection";
import { useEditorImpactData } from "./hooks/useEditorImpactData";
import useToolbarSaveStatus from "./hooks/useToolbarSaveStatus";
import type { QuestionSourceDragItem } from "./questionSource.types";
import styles from "./ExamEditorLayout.module.scss";

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

const DEFAULT_PAYLOADS: Record<
  ExamQuestionType,
  ExamPaperQuestionPayload & {
    question_type: ExamQuestionType;
    prompt: string;
    score: number;
  }
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
  short_answer: {
    question_type: "short_answer",
    prompt: "New question",
    score: 5,
  },
  essay: {
    question_type: "essay",
    prompt: "New question",
    score: 5,
  },
};

interface ExamEditorLayoutProps {
  contestId: string;
  contest: ContestDetail;
  onExport?: () => void;
  onPreview?: () => void;
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

const moveBlock = (
  list: ExamPaperBlock[],
  fromIndex: number,
  toIndex: number,
): ExamPaperBlock[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  if (!item) return list;
  copy.splice(Math.min(toIndex, copy.length), 0, item);
  return copy;
};

const flattenQuestions = (blocks: ExamPaperBlock[]): ExamQuestion[] =>
  blocks.flatMap((block) =>
    block.kind === "question" ? [block.question] : block.children,
  );

const getQuestionDisplayIndex = (question: ExamQuestion): number => question.order;

const getGroupQuestionRangeLabel = (
  block: Extract<ExamPaperBlock, { kind: "group" }>,
): string | undefined => {
  if (block.children.length === 0) return undefined;
  const sortedIndexes = block.children
    .map((child) => getQuestionDisplayIndex(child) + 1)
    .sort((a, b) => a - b);
  const first = sortedIndexes[0];
  const last = sortedIndexes[sortedIndexes.length - 1];
  if (first == null || last == null) return undefined;
  return first === last ? String(first) : `${first}-${last}`;
};

const replaceQuestionInBlocks = (
  blocks: ExamPaperBlock[],
  updated: ExamQuestion,
): ExamPaperBlock[] =>
  blocks.map((block) => {
    if (block.kind === "question") {
      return block.question.id === updated.id
        ? { ...block, question: updated }
        : block;
    }
    return {
      ...block,
      children: block.children.map((child) =>
        child.id === updated.id ? updated : child,
      ),
    };
  });

const findBlockIndexForQuestion = (
  blocks: ExamPaperBlock[],
  questionId: string,
): number =>
  blocks.findIndex((block) =>
    block.kind === "question"
      ? block.question.id === questionId
      : block.children.some((child) => child.id === questionId),
  );

const ExamEditorLayout: React.FC<ExamEditorLayoutProps> = ({
  contestId,
  contest,
  onExport,
  onPreview,
}) => {
  const { showToast } = useToast();
  const { t } = useTranslation("contest");
  const { confirm, modalProps } = useConfirmModal();
  const toolbarSave = useToolbarSaveStatus();
  const { right } = useWorkspace();
  const defaultSidePanelsExpanded = !right.isOpen;

  const [blocks, setBlocks] = useState<ExamPaperBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(defaultSidePanelsExpanded);
  const [sourceDragItem, setSourceDragItem] = useState<QuestionSourceDragItem | null>(null);
  const [sourceHoverIndex, setSourceHoverIndex] = useState<number | null>(null);
  const [sourcePanelExpanded, setSourcePanelExpanded] = useState(defaultSidePanelsExpanded);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [insertAtOrder, setInsertAtOrder] = useState<number | null>(null);
  const [insertGroupId, setInsertGroupId] = useState<string | null>(null);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [saveToBankQuestion, setSaveToBankQuestion] = useState<ExamQuestion | null>(null);

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frozen = !!contest.questionEditLocked;
  const lockedReason = "已有學生正式作答，競賽題目已鎖定";
  const isCompactScreen = useCompactScreen();

  const questions = useMemo(() => flattenQuestions(blocks), [blocks]);
  const allQuestionsForPolicy = useMemo(
    () => questions.map((q) => ({
      id: q.id,
      order: q.order,
      prompt: q.prompt,
      score: q.score,
      questionType: q.questionType,
      scorePolicy: q.scorePolicy,
      scorePolicyConfig: q.scorePolicyConfig,
    })),
    [questions],
  );
  const blocksKey = useMemo(() => blocks.map((block) => block.id).join(","), [blocks]);

  const { impactContext: editorImpactContext, ensureLoaded: ensureImpactLoaded } =
    useEditorImpactData(contestId, allQuestionsForPolicy);

  // Pre-fetch grading data for impact preview once blocks are loaded.
  useEffect(() => {
    if (blocks.length > 0) ensureImpactLoaded();
  }, [blocks.length, ensureImpactLoaded]);

  const {
    editorPaneRef,
    cardRefs,
    onReorderPointerSessionChange,
    handleSelect,
    onCardRoot,
  } = useEditorPaneScrollSelection(selectedId, setSelectedId, blocksKey);

  useEffect(() => {
    if (isCompactScreen) setSidebarExpanded(false);
  }, [isCompactScreen]);

  const loadPaper = useCallback(async (): Promise<ExamPaperBlock[]> => {
    if (!contestId) return [];
    try {
      setLoading(true);
      const paper = await getExamPaper(contestId);
      setBlocks(paper.blocks);
      return paper.blocks;
    } catch (error) {
      console.error("Failed to load exam paper", error);
      showToast({
        kind: "error",
        title: t("examEditor.loadFailed", "載入失敗"),
        subtitle: t("examEditor.loadFailedDetail", "載入 Exam 題目失敗"),
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [contestId, showToast, t]);

  useEffect(() => {
    void loadPaper();
  }, [loadPaper]);

  useEffect(() => {
    if (blocks.length > 0 && selectedId === null) {
      setSelectedId(blocks[0].id);
    }
  }, [blocks, selectedId]);

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  const persistBlockOrder = useCallback(
    async (orderedBlocks: ExamPaperBlock[]) => {
      const paper = await toolbarSave.track(() =>
        reorderExamPaperBlocks(
          contestId,
          orderedBlocks.map((block) => ({ kind: block.kind, id: block.id })),
        ),
      );
      setBlocks(paper.blocks);
      return paper.blocks;
    },
    [contestId, toolbarSave],
  );

  const scrollEditorToBottom = useCallback(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    requestAnimationFrame(() => {
      pane.scrollTo({ top: pane.scrollHeight, behavior: "smooth" });
    });
  }, [editorPaneRef]);

  const openTypePicker = useCallback((order?: number, groupId?: string | null) => {
    setInsertAtOrder(order ?? null);
    setInsertGroupId(groupId ?? null);
    setTypePickerOpen(true);
  }, []);

  const handleCreateGroup = useCallback(
    async (order = blocks.length) => {
      if (frozen) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      try {
        const created = await toolbarSave.track(() =>
          createExamPaperBlock(contestId, {
            kind: "group",
            group: {
              title: t("examEditor.defaultGroupTitle", "新題組"),
              shared_stem_markdown: "",
              order,
            },
            children: [],
          }),
        );
        await loadPaper();
        setSelectedId(created.id);
      } catch (error) {
        console.error("Failed to create exam group block", error);
        const message = error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗"), subtitle: message });
      }
    },
    [blocks.length, contestId, frozen, loadPaper, lockedReason, showToast, t, toolbarSave],
  );

  const handleCreateQuestion = useCallback(
    async (type: ExamQuestionType) => {
      setTypePickerOpen(false);
      if (frozen) return;
      const base = DEFAULT_PAYLOADS[type];
      try {
        if (insertGroupId) {
          const updated = await toolbarSave.track(() =>
            updateExamPaperBlock(contestId, insertGroupId, {
              kind: "group",
              children: [base],
            }),
          );
          setBlocks((prev) =>
            prev.map((block) => (block.id === updated.id ? updated : block)),
          );
          setSelectedId(updated.id);
          return;
        }

        const order = insertAtOrder ?? blocks.length;
        const created = await toolbarSave.track(() =>
          createExamPaperBlock(contestId, {
            kind: "question",
            question: { ...base, order },
          }),
        );
        await loadPaper();
        setSelectedId(created.id);
        requestAnimationFrame(() => {
          const el = cardRefs.current.get(created.id);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } catch (error) {
        console.error("Failed to create exam question", error);
        const message = error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗"), subtitle: message });
      } finally {
        setInsertGroupId(null);
      }
    },
    [
      blocks.length,
      cardRefs,
      contestId,
      frozen,
      insertAtOrder,
      insertGroupId,
      loadPaper,
      showToast,
      t,
      toolbarSave,
    ],
  );

  const handleReorder = useCallback(
    (newOrder: ExamPaperBlock[]) => {
      setBlocks(newOrder);
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = setTimeout(async () => {
        try {
          await persistBlockOrder(newOrder);
        } catch (error) {
          console.error("Failed to reorder paper blocks", error);
          showToast({ kind: "error", title: t("examEditor.sortUpdateFailed", "排序更新失敗") });
          await loadPaper();
        }
      }, 600);
    },
    [loadPaper, persistBlockOrder, showToast, t],
  );

  const handleQuestionAutoSave = useCallback(
    async (payload: ExamQuestionUpsertPayload, questionId?: string) => {
      if (!questionId) return;
      try {
        const updated = await toolbarSave.track(() =>
          updateExamPaperBlock(contestId, questionId, {
            kind: "question",
            question: payload,
          }),
        );
        if (updated.kind === "question") {
          setBlocks((prev) => replaceQuestionInBlocks(prev, updated.question));
        }
      } catch (error) {
        console.error("Failed to save exam question", error);
        throw error;
      }
    },
    [contestId, toolbarSave],
  );

  const handleGroupAutoSave = useCallback(
    async (
      blockId: string,
      payload: { title?: string; shared_stem_markdown?: string },
    ) => {
      try {
        const updated = await toolbarSave.track(() =>
          updateExamPaperBlock(contestId, blockId, {
            kind: "group",
            group: payload,
          }),
        );
        setBlocks((prev) =>
          prev.map((block) => (block.id === updated.id ? updated : block)),
        );
      } catch (error) {
        console.error("Failed to save exam group", error);
        const message = error instanceof Error ? error.message : t("examEditor.saveFailed", "儲存失敗");
        showToast({ kind: "error", title: t("examEditor.saveFailed", "儲存失敗"), subtitle: message });
      }
    },
    [contestId, showToast, t, toolbarSave],
  );

  const handleDuplicate = useCallback(
    async (questionId: string) => {
      if (frozen) return;
      const source = questions.find((q) => q.id === questionId);
      if (!source) return;
      try {
        const payload: ExamPaperQuestionPayload & {
          question_type: ExamQuestionType;
          prompt: string;
          score: number;
        } = {
          question_type: source.questionType,
          prompt: source.prompt,
          explanation: source.explanation,
          score: source.score,
          order: source.order + 1,
          answer_format: source.answerFormat,
        };
        if (source.options.length > 0) payload.options = [...source.options];
        if (source.correctAnswer != null) {
          payload.correct_answer = Array.isArray(source.correctAnswer)
            ? [...source.correctAnswer]
            : source.correctAnswer;
        }
        const created = await toolbarSave.track(() =>
          createExamPaperBlock(contestId, { kind: "question", question: payload }),
        );
        showToast({ kind: "success", title: t("examEditor.questionCopied", "題目已複製") });
        await loadPaper();
        setSelectedId(created.id);
      } catch (error) {
        console.error("Failed to duplicate exam question", error);
        const message = error instanceof Error ? error.message : t("examEditor.copyFailed", "複製失敗");
        showToast({ kind: "error", title: t("examEditor.copyFailed", "複製失敗"), subtitle: message });
      }
    },
    [contestId, frozen, loadPaper, questions, showToast, t, toolbarSave],
  );

  const handleDelete = useCallback(
    async (blockId: string) => {
      const block = blocks.find((item) => item.id === blockId);
      const questionIndex = questions.findIndex((question) => question.id === blockId);
      const accepted = await confirm({
        title:
          block?.kind === "group"
            ? t("examEditor.confirmDeleteGroup", "刪除這個題組與所有子題？")
            : t("examEditor.confirmDelete", { num: questionIndex >= 0 ? questionIndex + 1 : 1 }),
        danger: true,
        confirmLabel: t("button.delete", "刪除"),
        cancelLabel: t("button.cancel", "取消"),
      });
      if (!accepted) return;
      try {
        await toolbarSave.track(() => deleteExamPaperBlock(contestId, blockId));
        showToast({ kind: "success", title: t("examEditor.questionDeleted", "題目已刪除") });
        if (selectedId === blockId) setSelectedId(null);
        await loadPaper();
      } catch (error) {
        console.error("Failed to delete exam paper block", error);
        showToast({ kind: "error", title: t("examEditor.deleteFailed", "刪除失敗") });
      }
    },
    [blocks, confirm, contestId, loadPaper, questions, selectedId, showToast, t, toolbarSave],
  );

  const insertImportedQuestionAt = useCallback(
    async (targetIndex: number, importer: () => Promise<string | null>) => {
      if (frozen) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const beforeIds = new Set(questions.map((question) => question.id));
      let preferredId: string | null = null;

      try {
        preferredId = await importer();
        const reloadedBlocks = await loadPaper();
        const insertedId =
          preferredId ||
          flattenQuestions(reloadedBlocks).find((question) => !beforeIds.has(question.id))?.id ||
          null;
        if (!insertedId) {
          showToast({
            kind: "warning",
            title: t("examEditor.sourceInsertFallback", "題目已新增至尾端"),
            subtitle: t("examEditor.sourceInsertFallbackDetail", "無法精準識別新題目，已改為尾端插入"),
          });
          return;
        }

        const currentIndex = findBlockIndexForQuestion(reloadedBlocks, insertedId);
        if (currentIndex < 0) return;
        const boundedIndex = Math.max(0, Math.min(targetIndex, reloadedBlocks.length - 1));
        if (boundedIndex !== currentIndex) {
          await persistBlockOrder(moveBlock(reloadedBlocks, currentIndex, boundedIndex));
        }
        const selectedBlock = reloadedBlocks[boundedIndex];
        setSelectedId(selectedBlock?.id ?? null);
      } catch (error) {
        console.error("Failed to insert imported question", error);
        const message = error instanceof Error ? error.message : t("examEditor.addFailed", "新增失敗");
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗"), subtitle: message });
        await loadPaper();
      }
    },
    [frozen, loadPaper, lockedReason, persistBlockOrder, questions, showToast, t],
  );

  const handleImportFromBank = useCallback(
    async (items: BankImportSelectionItem[]) => {
      if (items.length === 0) return;
      if (frozen) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      await toolbarSave.track(() =>
        importExamQuestionsFromBank(contestId, {
          items: items.map((item) => ({
            question_bank_id: item.questionBankId,
            question_id: item.questionId,
          })),
        }),
      );
      await loadPaper();
      showToast({
        kind: "success",
        title: t("examEditor.importSuccess", "匯入成功"),
        subtitle: t("examEditor.importSuccessDetail", { count: items.length }),
      });
    },
    [contestId, frozen, loadPaper, lockedReason, showToast, t, toolbarSave],
  );

  const handleInsertFromSource = useCallback(
    async (targetIndex: number, sourceItem: QuestionSourceDragItem) => {
      if (sourceItem.kind === "exam_group") {
        await handleCreateGroup(targetIndex);
        return;
      }

      if (sourceItem.kind === "exam_type") {
        const created = await toolbarSave.track(() =>
          createExamPaperBlock(contestId, {
            kind: "question",
            question: {
              ...DEFAULT_PAYLOADS[sourceItem.questionType],
              order: targetIndex,
            },
          }),
        );
        await loadPaper();
        setSelectedId(created.id);
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
            }),
          );
          return null;
        });
      }
    },
    [contestId, handleCreateGroup, insertImportedQuestionAt, loadPaper, toolbarSave],
  );

  const sidebarContent = (
    <WorkTree
      blocks={blocks}
      selectedId={selectedId}
      frozen={frozen}
      loading={loading && blocks.length === 0}
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
      onAddGroup={() => void handleCreateGroup(blocks.length).then(scrollEditorToBottom)}
      onAddType={(questionType) => {
        void handleInsertFromSource(blocks.length, {
          kind: "exam_type",
          questionType,
        }).then(scrollEditorToBottom);
      }}
      onAddBankQuestion={(item) => {
        void handleInsertFromSource(blocks.length, {
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
                  sidebarExpanded ? "隱藏題目列表" : "顯示題目列表",
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
                  data-testid="contest-editor-open-source"
                  renderIcon={sourcePanelOpen ? Close : Add}
                  iconDescription={t(
                    sourcePanelOpen
                      ? "examEditor.collapseSourcePanel"
                      : "examEditor.openSourcePanel",
                    sourcePanelOpen ? "收起題目來源" : "開啟題目來源",
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
        mobileSidebarOpen={sidebarExpanded}
        mobileDetailOpen={Boolean(!isCompactScreen && sourcePanelExpanded)}
        ref={editorPaneRef}
      >
        <CardListEditor
          items={blocks}
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
          renderCard={(block, i, dragHandleProps) => {
            if (block.kind === "question") {
              return (
                <ExamQuestionEditCard
                  question={block.question}
                  index={getQuestionDisplayIndex(block.question)}
                  frozen={frozen}
                  allQuestions={allQuestionsForPolicy}
                  editorImpactContext={editorImpactContext}
                  onMenuOpen={ensureImpactLoaded}
                  onAutoSave={handleQuestionAutoSave}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onSaveToBank={(question) => setSaveToBankQuestion(question)}
                  onPointerDownDrag={dragHandleProps?.onPointerDown}
                  onScorePolicyChanged={loadPaper}
                />
              );
            }

            return (
              <div className={styles.groupBlock}>
                <ExamGroupEditCard
                  block={block}
                  index={i}
                  questionRangeLabel={getGroupQuestionRangeLabel(block)}
                  frozen={frozen}
                  onAutoSave={handleGroupAutoSave}
                  onDelete={handleDelete}
                  onAddChild={(groupId) => openTypePicker(undefined, groupId)}
                  onPointerDownDrag={dragHandleProps?.onPointerDown}
                />
                <div className={styles.groupChildren}>
                  {block.children.map((child) => (
                    <div key={child.id} className={styles.groupChild}>
                      <ExamQuestionEditCard
                        question={child}
                        index={getQuestionDisplayIndex(child)}
                        showScoreField
                        frozen={frozen}
                        allQuestions={allQuestionsForPolicy}
                        editorImpactContext={editorImpactContext}
                        onMenuOpen={ensureImpactLoaded}
                        onAutoSave={handleQuestionAutoSave}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                        onSaveToBank={(question) => setSaveToBankQuestion(question)}
                        onScorePolicyChanged={loadPaper}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
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
        onRequestClose={() => {
          setTypePickerOpen(false);
          setInsertGroupId(null);
        }}
        modalHeading={t("examEditor.selectQuestionType", "選擇題目類型")}
        passiveModal
        size="sm"
      >
        <div className={styles.typePickerGrid}>
          {!insertGroupId ? (
            <button
              type="button"
              className={styles.typePickerCard}
              onClick={() => {
                setTypePickerOpen(false);
                void handleCreateGroup(insertAtOrder ?? blocks.length);
              }}
            >
              <Add size={24} />
              <div className={styles.typePickerInfo}>
                <span className={styles.typePickerLabel}>
                  {t("examEditor.groupBlock", "題組")}
                </span>
                <span className={styles.typePickerDesc}>
                  {t("examEditor.groupBlockDesc", "共同題幹加多個子題")}
                </span>
              </div>
            </button>
          ) : null}
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
};

export default ExamEditorLayout;
