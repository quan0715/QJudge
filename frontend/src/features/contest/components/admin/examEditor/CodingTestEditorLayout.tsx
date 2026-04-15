import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Button } from "@carbon/react";
import { Add, Close, Menu, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
  ContestProblemSummary,
} from "@/core/entities/contest.entity";
import {
  createContestProblem,
  duplicateContestProblem,
  importContestProblemsFromBank,
  getContest,
  removeContestProblem,
  reorderContestProblems,
} from "@/infrastructure/api/repositories";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useToast } from "@/shared/contexts";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import CodingProblemListPanel from "./CodingProblemListPanel";
import { CardListEditor } from "@/shared/ui/cardListEditor";
import EmbeddedProblemEditor from "./EmbeddedProblemEditor";
import QuestionSourcePanel from "./QuestionSourcePanel";
import type { QuestionSourceDragItem } from "./questionSource.types";
import useToolbarSaveStatus from "./hooks/useToolbarSaveStatus";
import { useEditorPaneScrollSelection } from "./hooks/useEditorPaneScrollSelection";
import { labelForContestProblemOrder } from "@/features/contest/domain/contestProblemOrderLabel";
import styles from "./ExamEditorLayout.module.scss";

interface CodingTestEditorLayoutProps {
  contestId: string;
  contest: ContestDetail;
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

const sortProblems = (rows: ContestProblemSummary[]): ContestProblemSummary[] =>
  [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const moveProblem = (
  list: ContestProblemSummary[],
  fromIndex: number,
  toIndex: number
): ContestProblemSummary[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return list;
  }

  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  if (!item) return list;
  copy.splice(toIndex, 0, item);

  return copy.map((problem, order) => ({
    ...problem,
    order,
    label: labelForContestProblemOrder(order),
  }));
};

const resolveInsertedContestProblemId = (
  beforeIds: Set<string>,
  afterList: ContestProblemSummary[],
): string | null => {
  const inserted = afterList.find((problem) => !beforeIds.has(problem.id));
  return inserted?.id ?? null;
};

const CodingTestEditorLayout: React.FC<CodingTestEditorLayoutProps> = ({
  contestId,
  contest,
}) => {
  const { t } = useTranslation("contest");
  const { classroomId } = useParams<{ classroomId?: string }>();
  const { showToast } = useToast();
  const { refreshContest, loading: contestLoading } = useContest();
  const listSave = useToolbarSaveStatus();
  const effectiveClassroomId = classroomId || contest.boundClassroomId || undefined;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderedProblems, setOrderedProblems] = useState<ContestProblemSummary[]>(() =>
    sortProblems(contest.problems ?? [])
  );
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const [sourceDragItem, setSourceDragItem] = useState<QuestionSourceDragItem | null>(null);
  const [sourceHoverIndex, setSourceHoverIndex] = useState<number | null>(null);
  const [sourcePanelExpanded, setSourcePanelExpanded] = useState(true);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [viewReorderPointerDepth, setViewReorderPointerDepth] = useState(0);

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompactScreen = useCompactScreen();

  const codingScrollItemsKey = useMemo(
    () => orderedProblems.map((problem) => problem.id).join(","),
    [orderedProblems],
  );

  const {
    editorPaneRef,
    onReorderPointerSessionChange: bumpReorderPointerDepth,
    handleSelect,
    onCardRoot,
  } = useEditorPaneScrollSelection(selectedId, setSelectedId, codingScrollItemsKey);

  const onReorderPointerSessionChange = useCallback(
    (delta: 1 | -1) => {
      bumpReorderPointerDepth(delta);
      setViewReorderPointerDepth((d) => Math.max(0, d + delta));
    },
    [bumpReorderPointerDepth],
  );

  const questionEditLocked = !!contest.questionEditLocked;
  const lockedReason = t(
    "examEditor.questionLockedReason",
    "已有學生正式作答，競賽題目已鎖定"
  );

  useEffect(() => {
    setOrderedProblems(sortProblems(contest.problems ?? []));
  }, [contest.problems]);

  useEffect(() => {
    if (orderedProblems.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !orderedProblems.some((p) => p.id === selectedId)) {
      setSelectedId(orderedProblems[0].id);
    }
  }, [orderedProblems, selectedId]);

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  const selectedProblem = selectedId
    ? orderedProblems.find((problem) => problem.id === selectedId) ?? null
    : null;

  const fetchLatestProblems = useCallback(async (): Promise<ContestProblemSummary[]> => {
    const latest = await getContest(contestId);
    return sortProblems(latest?.problems ?? []);
  }, [contestId]);

  const refreshAfterListMutation = useCallback(async () => {
    await refreshContest();
    const latest = await fetchLatestProblems();
    setOrderedProblems(latest);
  }, [fetchLatestProblems, refreshContest]);

  const handleReorder = useCallback(
    (newOrder: ContestProblemSummary[]) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const normalized = newOrder.map((problem, order) => ({
        ...problem,
        order,
        label: labelForContestProblemOrder(order),
      }));
      setOrderedProblems(normalized);

      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = setTimeout(async () => {
        try {
          await listSave.track(() =>
            reorderContestProblems(
              contestId,
              normalized.map((problem, order) => ({ id: problem.id, order }))
            )
          );
          // Success: optimistic state is already correct, no need to re-fetch
        } catch (error) {
          console.error("Failed to reorder contest problems", error);
          showToast({ kind: "error", title: t("examEditor.sortUpdateFailed", "排序更新失敗") });
          // On failure, fetch the actual order from server
          await refreshAfterListMutation();
        }
      }, 600);
    },
    [
      contestId,
      listSave,
      lockedReason,
      questionEditLocked,
      refreshAfterListMutation,
      showToast,
      t,
    ]
  );

  const insertImportedProblemAt = useCallback(
    async (
      targetIndex: number,
      importer: () => Promise<void>
    ) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const beforeIds = new Set(orderedProblems.map((problem) => problem.id));
      try {
        await importer();
        await refreshContest();
        const latest = await fetchLatestProblems();
        setOrderedProblems(latest);

        const insertedId = resolveInsertedContestProblemId(beforeIds, latest);
        if (!insertedId) {
          showToast({
            kind: "warning",
            title: t("examEditor.sourceInsertFallback", "題目已新增至尾端"),
            subtitle: t(
              "examEditor.sourceInsertFallbackDetail",
              "無法精準識別新題目，已改為尾端插入"
            ),
          });
          return;
        }

        const currentIndex = latest.findIndex((problem) => problem.id === insertedId);
        if (currentIndex < 0) return;

        const boundedIndex = Math.max(0, Math.min(targetIndex, latest.length - 1));
        if (boundedIndex !== currentIndex) {
          const moved = moveProblem(latest, currentIndex, boundedIndex);
          setOrderedProblems(moved);
          await listSave.track(() =>
            reorderContestProblems(
              contestId,
              moved.map((problem, order) => ({ id: problem.id, order }))
            )
          );
          await refreshAfterListMutation();
        }

        setSelectedId(insertedId);
      } catch (error) {
        console.error("Failed to insert imported coding problem", error);
        showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗") });
        await refreshAfterListMutation();
      }
    },
    [
      contestId,
      fetchLatestProblems,
      listSave,
      lockedReason,
      orderedProblems,
      questionEditLocked,
      refreshAfterListMutation,
      refreshContest,
      showToast,
      t,
    ]
  );

  const handleInsertFromSource = useCallback(
    async (targetIndex: number, sourceItem: QuestionSourceDragItem) => {
      if (sourceItem.kind === "bank_question") {
        await insertImportedProblemAt(targetIndex, async () => {
          await listSave.track(() =>
            importContestProblemsFromBank(contestId, [{
              question_bank_id: sourceItem.questionBankId,
              question_id: sourceItem.questionId,
            }])
          );
        });
      } else if (sourceItem.kind === "coding_template") {
        await insertImportedProblemAt(targetIndex, async () => {
          await listSave.track(() =>
            createContestProblem(contestId, { title: sourceItem.title })
          );
        });
      }
    },
    [contestId, insertImportedProblemAt, listSave]
  );

  const handleAddTemplate = useCallback(() => {
    void handleInsertFromSource(orderedProblems.length, {
      kind: "coding_template",
      title: "Hello World",
    });
  }, [handleInsertFromSource, orderedProblems.length]);

  const handleDuplicateCodingProblemExcerpt = useCallback(
    async (problemId: string) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      const beforeIds = new Set(orderedProblems.map((p) => p.id));
      try {
        await listSave.track(() =>
          duplicateContestProblem(contestId, { problem_id: problemId })
        );
        await refreshContest();
        const latest = await fetchLatestProblems();
        setOrderedProblems(latest);
        const inserted = latest.find((p) => !beforeIds.has(p.id));
        if (inserted) {
          setSelectedId(inserted.id);
        }
        showToast({
          kind: "success",
          title: t("examEditor.questionCopied", "題目已複製"),
        });
      } catch (err) {
        console.error("Failed to duplicate contest problem", err);
        showToast({
          kind: "error",
          title: t("examEditor.copyFailed", "複製失敗"),
          subtitle: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [
      contestId,
      fetchLatestProblems,
      listSave,
      lockedReason,
      orderedProblems,
      questionEditLocked,
      refreshContest,
      showToast,
      t,
    ],
  );

  // aiPanelContent removed — ChatbotWidget renders as float widget below

  const sourcePanelContent = (
    <QuestionSourcePanel
      mode="coding"
      onAddTemplate={handleAddTemplate}
      onDragStart={(item) => setSourceDragItem(item)}
      onDragEnd={() => {
        setSourceDragItem(null);
        setSourceHoverIndex(null);
      }}
      onAddBankQuestion={(item) => {
        void handleInsertFromSource(orderedProblems.length, {
          kind: "bank_question",
          category: "coding",
          questionBankId: item.questionBankId,
          questionId: item.questionId,
          title: item.title,
        });
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

  const contentPaneClassName = [
    styles.editorPane,
    viewReorderPointerDepth > 0 ? styles.reorderPointerScrollLock : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sidebarScrollLockClass =
    viewReorderPointerDepth > 0 ? styles.reorderPointerScrollLock : undefined;

  return (
    <>
      <AdminSplitLayout
        ref={editorPaneRef}
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
            title={t("adminLayout.nav.problemManagement", "題目管理")}
            status={(
              <div className={styles.toolbarStatusGroup}>
                <GlobalSaveStatus status={listSave.status} />
                {questionEditLocked ? <span className={styles.lockedHint}>{lockedReason}</span> : null}
              </div>
            )}
            actions={
              <>
                {effectiveClassroomId && (
                  <Button
                    kind="ghost"
                    size="md"
                    hasIconOnly
                    renderIcon={View}
                    iconDescription={t("examEditor.preview", "預覽")}
                    onClick={() =>
                      window.open(
                        `/classrooms/${effectiveClassroomId}/contest/${contestId}/practice`,
                        "_blank",
                      )
                    }
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
                    sourcePanelOpen ? "收起題目來源" : "開啟題目來源"
                  )}
                  onClick={toggleSourcePanel}
                />
              </>
            }
          />
        }
        sidebar={(
          <CodingProblemListPanel
            problems={orderedProblems}
            selectedId={selectedId}
            locked={questionEditLocked}
            loading={contestLoading && orderedProblems.length === 0}
            onSelect={handleSelect}
            onReorder={handleReorder}
            onReorderPointerSessionChange={onReorderPointerSessionChange}
          />
        )}
        sidebarClassName={sidebarScrollLockClass}
        sidebarHidden={!sidebarExpanded}
        rightPane={
          !isCompactScreen && sourcePanelExpanded
            ? (
              <motion.div
                key="source"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                {sourcePanelContent}
              </motion.div>
            )
            : undefined
        }
        rightPaneWidth={320}
        contentMaxWidth={720}
        contentClassName={contentPaneClassName}
      >
        <CardListEditor
          items={orderedProblems}
          onReorder={handleReorder}
          onReorderPointerSessionChange={onReorderPointerSessionChange}
          onCardRoot={onCardRoot}
          frozen={questionEditLocked}
          canDrop={!!sourceDragItem && !questionEditLocked}
          hoverIndex={sourceHoverIndex}
          onHoverIndexChange={setSourceHoverIndex}
          onDropAt={(index) => {
            if (!sourceDragItem || questionEditLocked) return;
            const droppedItem = sourceDragItem;
            setSourceDragItem(null);
            void handleInsertFromSource(index, droppedItem);
          }}
          renderCard={(cp, _index, dragHandleProps) => (
            <EmbeddedProblemEditor
              contestProblemId={cp.id}
              contestId={contestId}
              orderLabel={cp.label}
              contestBinding={{
                sourceBank: cp.sourceBank ?? null,
                sourceMode: cp.sourceMode,
              }}
              score={cp.maxScore ?? cp.score}
              frozen={questionEditLocked}
              onDuplicate={
                questionEditLocked
                  ? undefined
                  : () => handleDuplicateCodingProblemExcerpt(cp.problemId)
              }
              onDelete={async () => {
                await removeContestProblem(contestId, cp.id);
                await refreshAfterListMutation();
              }}
              onPointerDownDrag={dragHandleProps?.onPointerDown}
              onSaveToBankSuccess={refreshAfterListMutation}
            />
          )}
          emptyState={
            <div className={styles.editorEmptyState}>
              <p>{t("examEditor.noQuestions", "尚無題目")}</p>
            </div>
          }
        />
      </AdminSplitLayout>

      {isCompactScreen && (
        <div style={{ display: sourceModalOpen ? "block" : "none" }}>
          {sourcePanelContent}
        </div>
      )}

    </>
  );
};

export default CodingTestEditorLayout;
