import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Button, ComboBox, Modal, TextInput } from "@carbon/react";
import { Add, Close, Menu } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
  ContestProblemSummary,
} from "@/core/entities/contest.entity";
import {
  addContestProblem,
  getContest,
  removeContestProblem,
  reorderContestProblems,
  updateContestProblemScore,
} from "@/infrastructure/api/repositories";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import ProblemWorkTree from "./ProblemWorkTree";
import EmbeddedProblemEditor from "./EmbeddedProblemEditor";
import QuestionSourcePanel from "./QuestionSourcePanel";
import type { QuestionSourceDragItem } from "./questionSource.types";
import useToolbarSaveStatus, { type ToolbarSaveStatus } from "./hooks/useToolbarSaveStatus";
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

  return copy.map((problem, order) => ({ ...problem, order }));
};

const resolveInsertedContestProblemId = (
  beforeIds: Set<string>,
  afterList: ContestProblemSummary[],
): string | null => {
  const inserted = afterList.find((problem) => !beforeIds.has(problem.id));
  return inserted?.id ?? null;
};

const mergeSaveStatus = (
  listStatus: ToolbarSaveStatus,
  editorStatus: ToolbarSaveStatus
): ToolbarSaveStatus => {
  if (listStatus === "error" || editorStatus === "error") return "error";
  if (listStatus === "saving" || editorStatus === "saving") return "saving";
  if (listStatus === "saved" || editorStatus === "saved") return "saved";
  return "idle";
};

const CodingTestEditorLayout: React.FC<CodingTestEditorLayoutProps> = ({
  contestId,
  contest,
}) => {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const { refreshContest, loading: contestLoading } = useContest();
  const { confirm, modalProps } = useConfirmModal();
  const listSave = useToolbarSaveStatus();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderedProblems, setOrderedProblems] = useState<ContestProblemSummary[]>(() =>
    sortProblems(contest.problems ?? [])
  );
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [editorSaveStatus, setEditorSaveStatus] = useState<ToolbarSaveStatus>("idle");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [availableProblems, setAvailableProblems] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingAvailableProblems, setLoadingAvailableProblems] = useState(false);

  const [sourceDragItem, setSourceDragItem] = useState<QuestionSourceDragItem | null>(null);
  const [sourceHoverIndex, setSourceHoverIndex] = useState<number | null>(null);
  const [sourcePanelExpanded, setSourcePanelExpanded] = useState(true);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompactScreen = useCompactScreen();

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
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    if (!selectedId || !orderedProblems.some((problem) => problem.id === selectedId)) {
      setSelectedId(orderedProblems[0].id);
    }
  }, [orderedProblems, selectedId]);

  useEffect(() => {
    setEditorSaveStatus("idle");
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  const selectedProblem = selectedId
    ? orderedProblems.find((problem) => problem.id === selectedId) ?? null
    : null;

  const toolbarStatus = useMemo(
    () => mergeSaveStatus(listSave.status, editorSaveStatus),
    [editorSaveStatus, listSave.status]
  );

  const fetchLatestProblems = useCallback(async (): Promise<ContestProblemSummary[]> => {
    const latest = await getContest(contestId);
    return sortProblems(latest?.problems ?? []);
  }, [contestId]);

  const loadAvailableProblems = useCallback(async () => {
    try {
      setLoadingAvailableProblems(true);
      const list = await getProblems({ scope: "manage" });
      setAvailableProblems(
        list.map((problem) => ({
          id: problem.id.toString(),
          label: `${problem.id} - ${problem.title}`,
        })),
      );
    } catch (error) {
      console.error("Failed to load management problems", error);
      showToast({
        kind: "error",
        title: t("examEditor.loadFailed", "載入失敗"),
      });
    } finally {
      setLoadingAvailableProblems(false);
    }
  }, [showToast, t]);

  const handleOpenAdd = useCallback(() => {
    if (questionEditLocked) {
      showToast({ kind: "warning", title: lockedReason });
      return;
    }
    setAddModalOpen(true);
    void loadAvailableProblems();
  }, [loadAvailableProblems, lockedReason, questionEditLocked, showToast]);

  const refreshAfterListMutation = useCallback(async () => {
    await refreshContest();
    const latest = await fetchLatestProblems();
    setOrderedProblems(latest);
  }, [fetchLatestProblems, refreshContest]);

  const handleAdd = useCallback(async () => {
    if (!contestId) return;
    if (questionEditLocked) {
      showToast({ kind: "warning", title: lockedReason });
      return;
    }

    try {
      setAdding(true);
      await listSave.track(async () => {
        if (newProblemId) {
          await addContestProblem(contestId, { problem_id: newProblemId });
          return;
        }
        if (newProblemTitle) {
          await addContestProblem(contestId, { title: newProblemTitle });
        }
      });

      setAddModalOpen(false);
      setNewProblemId("");
      setNewProblemTitle("");
      await refreshAfterListMutation();
      showToast({ kind: "success", title: t("examEditor.questionAdded", "題目已新增") });
    } catch (error) {
      console.error("Failed to add contest problem", error);
      showToast({ kind: "error", title: t("examEditor.addFailed", "新增失敗") });
    } finally {
      setAdding(false);
    }
  }, [
    contestId,
    listSave,
    lockedReason,
    newProblemId,
    newProblemTitle,
    questionEditLocked,
    refreshAfterListMutation,
    showToast,
    t,
  ]);

  const handleUpdateScore = useCallback(
    async (contestProblemId: string, maxScore: number) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      try {
        await listSave.track(() => updateContestProblemScore(contestId, contestProblemId, maxScore));
        await refreshAfterListMutation();
      } catch (error) {
        console.error("Failed to update score", error);
        showToast({ kind: "error", title: t("examEditor.saveFailed", "儲存失敗") });
      }
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

  const handleRemove = useCallback(
    async (problemId: string) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const accepted = await confirm({
        title: t("examEditor.confirmRemoveProblem", "確定要從競賽移除此題？"),
        danger: true,
        confirmLabel: t("button.delete", "刪除"),
        cancelLabel: t("button.cancel", "取消"),
      });

      if (!accepted) return;

      try {
        await listSave.track(() => removeContestProblem(contestId, problemId));
        setOrderedProblems((prev) => prev.filter((problem) => problem.id !== problemId));
        if (selectedId === problemId) {
          setSelectedId(null);
        }
        await refreshAfterListMutation();
        showToast({ kind: "success", title: t("examEditor.questionDeleted", "題目已刪除") });
      } catch (error) {
        console.error("Failed to remove contest problem", error);
        showToast({ kind: "error", title: t("examEditor.deleteFailed", "刪除失敗") });
      }
    },
    [
      confirm,
      contestId,
      listSave,
      lockedReason,
      questionEditLocked,
      refreshAfterListMutation,
      selectedId,
      showToast,
      t,
    ]
  );

  const handleReorder = useCallback(
    (newOrder: ContestProblemSummary[]) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }

      const normalized = newOrder.map((problem, order) => ({ ...problem, order }));
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
          await refreshAfterListMutation();
        } catch (error) {
          console.error("Failed to reorder contest problems", error);
          showToast({ kind: "error", title: t("examEditor.sortUpdateFailed", "排序更新失敗") });
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
      if (sourceItem.kind !== "bank_question") return;

      await insertImportedProblemAt(targetIndex, async () => {
        await listSave.track(() =>
          addContestProblem(contestId, {
            question_bank_id: sourceItem.questionBankId,
            question_id: sourceItem.questionId,
          })
        );
      });
    },
    [contestId, insertImportedProblemAt, listSave]
  );

  const sourcePanelContent = (
    <QuestionSourcePanel
      mode="coding"
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
            title={t("adminLayout.nav.problemManagement", "題目管理")}
            status={(
              <div className={styles.toolbarStatusGroup}>
                <GlobalSaveStatus status={toolbarStatus} />
                {questionEditLocked ? <span className={styles.lockedHint}>{lockedReason}</span> : null}
              </div>
            )}
            actions={
              <>
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
        sidebar={(
          <ProblemWorkTree
            problems={orderedProblems}
            selectedId={selectedId}
            questionEditLocked={questionEditLocked}
            lockedReason={lockedReason}
            loading={contestLoading && orderedProblems.length === 0}
            onSelect={setSelectedId}
            onAdd={handleOpenAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onUpdateScore={handleUpdateScore}
            externalCanDrop={!!sourceDragItem && !questionEditLocked}
            externalHoverIndex={sourceHoverIndex}
            onExternalHoverIndexChange={setSourceHoverIndex}
            onExternalDropAt={async (index) => {
              if (!sourceDragItem || questionEditLocked) return;
              const droppedItem = sourceDragItem;
              setSourceHoverIndex(null);
              setSourceDragItem(null);
              await handleInsertFromSource(index, droppedItem);
            }}
          />
        )}
        sidebarHidden={!sidebarExpanded}
        rightPane={!isCompactScreen && sourcePanelExpanded ? sourcePanelContent : undefined}
        rightPaneWidth={320}
        contentMaxWidth={960}
        contentClassName={styles.editorPane}
      >
        {selectedProblem && !questionEditLocked ? (
          <EmbeddedProblemEditor
            key={selectedProblem.id}
            contestProblemId={selectedProblem.id}
            contestId={contestId}
            onRemoved={async () => {
              setSelectedId(null);
              await refreshAfterListMutation();
            }}
            showGlobalSaveStatus={false}
            onGlobalSaveStatusChange={setEditorSaveStatus}
          />
        ) : selectedProblem ? (
          <div className={styles.editorEmptyState}>
            <p>{lockedReason}</p>
          </div>
        ) : (
          <div className={styles.editorEmptyState}>
            <p>{t("examEditor.noQuestions", "尚無題目")}</p>
          </div>
        )}
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
        open={addModalOpen}
        modalHeading={t("examEditor.addQuestion", "新增題目")}
        primaryButtonText={adding ? t("common.saving", "儲存中") : t("examEditor.addQuestion", "新增題目")}
        secondaryButtonText={t("button.cancel", "取消")}
        onRequestSubmit={handleAdd}
        onRequestClose={() => setAddModalOpen(false)}
        primaryButtonDisabled={questionEditLocked || adding || (!newProblemId && !newProblemTitle)}
      >
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)" }}>
            {t(
              "examEditor.codingSourceHint",
              "可從題庫選題，或直接建立新的程式題。"
            )}
          </p>
          <div style={{ marginBottom: "1.5rem" }}>
            <ComboBox
              id="problem-select"
              titleText={t("examEditor.importFromBank", "從題庫匯入")}
              placeholder={t("examEditor.sourceSearchPlaceholder", "搜尋題目")}
              items={availableProblems}
              itemToString={(item: { id: string; label: string } | null) =>
                item ? item.label : ""
              }
              onChange={(event: { selectedItem?: { id: string; label: string } | null }) => {
                setNewProblemId(event.selectedItem ? event.selectedItem.id : "");
              }}
              shouldFilterItem={({
                item,
                inputValue,
              }: {
                item: { id: string; label: string };
                inputValue: string | null;
              }) => {
                if (!inputValue) return true;
                return item.label.toLowerCase().includes(inputValue.toLowerCase());
              }}
              disabled={loadingAvailableProblems}
            />
          </div>
          <div
            style={{
              borderTop: "1px solid var(--cds-ui-03)",
              margin: "1rem 0",
              paddingTop: "1rem",
            }}
          >
            <TextInput
              id="problem-title"
              labelText={t("examEditor.createQuestion", "直接建立新題目")}
              placeholder={t("examEditor.promptPlaceholder", "輸入題目敘述（支援 Markdown / LaTeX）")}
              value={newProblemTitle}
              onChange={(event) => setNewProblemTitle(event.target.value)}
              disabled={!!newProblemId}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal {...modalProps} />
    </>
  );
};

export default CodingTestEditorLayout;
