import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Modal,
  TextInput,
  ComboBox,
} from "@carbon/react";
import type {
  ContestDetail,
  ContestProblemSummary,
} from "@/core/entities/contest.entity";
import {
  addContestProblem,
  removeContestProblem,
  reorderContestProblems,
  updateContestProblemScore,
} from "@/infrastructure/api/repositories";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import ProblemWorkTree from "./ProblemWorkTree";
import EmbeddedProblemEditor from "./EmbeddedProblemEditor";
import QuestionBankImportModal, { type BankImportSelectionItem } from "./QuestionBankImportModal";
import styles from "./ExamEditorLayout.module.scss";

interface CodingTestEditorLayoutProps {
  contestId: string;
  contest: ContestDetail;
}

const CodingTestEditorLayout: React.FC<CodingTestEditorLayoutProps> = ({
  contestId,
  contest,
}) => {
  const { showToast } = useToast();
  const { refreshContest, loading: contestLoading } = useContest();
  const { confirm, modalProps } = useConfirmModal();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [availableProblems, setAvailableProblems] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingAvailableProblems, setLoadingAvailableProblems] = useState(false);
  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionEditLocked = !!contest.questionEditLocked;
  const lockedReason = "已有學生正式作答，競賽題目已鎖定";

  const problems = useMemo(() => contest.problems ?? [], [contest.problems]);

  // Pre-select first problem when data loads
  useEffect(() => {
    if (problems.length > 0 && selectedId === null) {
      setSelectedId(problems[0].id);
    }
  }, [problems, selectedId]);

  // Find the selected problem's actual problemId for the editor
  const selectedProblem = selectedId
    ? problems.find((p) => p.id === selectedId)
    : null;

  // --- Load management problems for ComboBox ---
  const loadAvailableProblems = useCallback(async () => {
    try {
      setLoadingAvailableProblems(true);
      const list = await getProblems({ scope: "manage" });
      setAvailableProblems(
        list.map((p) => ({
          id: p.id.toString(),
          label: `${p.id} - ${p.title}`,
        })),
      );
    } catch {
      console.error("Failed to load management problems");
    } finally {
      setLoadingAvailableProblems(false);
    }
  }, []);

  const handleOpenAdd = useCallback(() => {
    if (questionEditLocked) {
      showToast({ kind: "warning", title: lockedReason });
      return;
    }
    setAddModalOpen(true);
    loadAvailableProblems();
  }, [loadAvailableProblems, questionEditLocked, showToast]);

  const handleAdd = useCallback(async () => {
    if (!contestId) return;
    if (questionEditLocked) {
      showToast({ kind: "warning", title: lockedReason });
      return;
    }
    try {
      setAdding(true);
      if (newProblemId) {
        await addContestProblem(contestId, { problem_id: newProblemId });
      } else if (newProblemTitle) {
        await addContestProblem(contestId, { title: newProblemTitle });
      }
      setAddModalOpen(false);
      setNewProblemId("");
      setNewProblemTitle("");
      await refreshContest();
      showToast({ kind: "success", title: "Problem added" });
    } catch {
      showToast({ kind: "error", title: "Failed to add problem" });
    } finally {
      setAdding(false);
    }
  }, [contestId, lockedReason, newProblemId, newProblemTitle, questionEditLocked, refreshContest, showToast]);

  const handleImportFromBank = useCallback(
    async (items: BankImportSelectionItem[]) => {
      if (!contestId || items.length === 0) return;
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      for (const item of items) {
        await addContestProblem(contestId, {
          question_bank_id: item.questionBankId,
          question_id: item.questionId,
        });
      }
      await refreshContest();
      showToast({
        kind: "success",
        title: "Imported from question bank",
        subtitle: `${items.length} question(s) imported`,
      });
    },
    [contestId, lockedReason, questionEditLocked, refreshContest, showToast]
  );

  const handleUpdateScore = useCallback(
    async (contestProblemId: string, maxScore: number) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      try {
        await updateContestProblemScore(contestId, contestProblemId, maxScore);
        await refreshContest();
      } catch {
        showToast({ kind: "error", title: "Failed to update score" });
        await refreshContest();
      }
    },
    [contestId, lockedReason, questionEditLocked, refreshContest, showToast]
  );

  // --- Remove ---
  const handleRemove = useCallback(
    async (problemId: string) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      const accepted = await confirm({
        title: "Remove this problem from the contest?",
        danger: true,
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
      });
      if (!accepted) return;
      try {
        await removeContestProblem(contestId, problemId);
        showToast({ kind: "success", title: "Problem removed" });
        if (selectedId === problemId) setSelectedId(null);
        await refreshContest();
      } catch {
        showToast({ kind: "error", title: "Failed to remove problem" });
      }
    },
    [contestId, selectedId, confirm, questionEditLocked, lockedReason, refreshContest, showToast],
  );

  // --- Reorder (debounced) ---
  const handleReorder = useCallback(
    (newOrder: ContestProblemSummary[]) => {
      if (questionEditLocked) {
        showToast({ kind: "warning", title: lockedReason });
        return;
      }
      // Optimistic update happens in ProblemWorkTree via motion/react
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
      reorderTimeoutRef.current = setTimeout(async () => {
        const orders = newOrder.map((p, i) => ({ id: p.id, order: i }));
        try {
          await reorderContestProblems(contestId, orders);
          await refreshContest();
        } catch {
          showToast({ kind: "error", title: "Failed to reorder" });
          await refreshContest();
        }
      }, 600);
    },
    [contestId, lockedReason, questionEditLocked, refreshContest, showToast],
  );

  // Cleanup timeout
  React.useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    };
  }, []);

  // When a problem is deleted from within the editor
  const handleProblemRemoved = useCallback(() => {
    setSelectedId(null);
    refreshContest();
  }, [refreshContest]);

  return (
    <>
      <div className={styles.editorLayout}>
        <div className={styles.workTreePane}>
          <ProblemWorkTree
            problems={problems}
            selectedId={selectedId}
            questionEditLocked={questionEditLocked}
            lockedReason={lockedReason}
            loading={contestLoading && problems.length === 0}
            onSelect={setSelectedId}
            onAdd={handleOpenAdd}
            onImportFromBank={() => setBankImportOpen(true)}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onUpdateScore={handleUpdateScore}
          />
        </div>
        <div className={styles.editorPane}>
          {selectedProblem && !questionEditLocked ? (
            <EmbeddedProblemEditor
              key={selectedProblem.id}
              contestProblemId={selectedProblem.id}
              contestId={contestId}
              onRemoved={handleProblemRemoved}
            />
          ) : selectedProblem ? (
            <div className={styles.editorEmptyState}>
              <p>{lockedReason}</p>
            </div>
          ) : (
            <div className={styles.editorEmptyState}>
              <p>Select a problem to edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Problem Modal */}
      <Modal
        open={addModalOpen}
        modalHeading="Add Contest Problem"
        primaryButtonText={adding ? "Adding..." : "Add"}
        secondaryButtonText="Cancel"
        onRequestSubmit={handleAdd}
        onRequestClose={() => setAddModalOpen(false)}
        primaryButtonDisabled={questionEditLocked || adding || (!newProblemId && !newProblemTitle)}
      >
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--cds-text-secondary)" }}>
            Select from existing problems or create a new blank problem.
          </p>
          <div style={{ marginBottom: "1.5rem" }}>
            <ComboBox
              id="problem-select"
              titleText="Select from Problem Bank (Clone)"
              placeholder="Search by ID or title..."
              items={availableProblems}
              itemToString={(item: { id: string; label: string } | null) =>
                item ? item.label : ""
              }
              onChange={(e: { selectedItem?: { id: string; label: string } | null }) => {
                setNewProblemId(e.selectedItem ? e.selectedItem.id : "");
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
              labelText="Or create blank problem"
              placeholder="Enter problem title"
              value={newProblemTitle}
              onChange={(e) => setNewProblemTitle(e.target.value)}
              disabled={!!newProblemId}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal {...modalProps} />

      <QuestionBankImportModal
        open={bankImportOpen}
        category="coding"
        onClose={() => setBankImportOpen(false)}
        onConfirm={handleImportFromBank}
      />
    </>
  );
};

export default CodingTestEditorLayout;
