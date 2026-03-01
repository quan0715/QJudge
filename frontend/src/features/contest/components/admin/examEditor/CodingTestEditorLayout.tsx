import React, { useState, useCallback, useRef, useEffect } from "react";
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
} from "@/infrastructure/api/repositories";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import ProblemWorkTree from "./ProblemWorkTree";
import EmbeddedProblemEditor from "./EmbeddedProblemEditor";
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
  const [newProblemTitle, setNewProblemTitle] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [publicProblems, setPublicProblems] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const problems = contest.problems ?? [];

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

  // --- Load public problems for ComboBox ---
  const loadPublicProblems = useCallback(async () => {
    try {
      setLoadingPublic(true);
      const list = await getProblems({ scope: "public" });
      setPublicProblems(
        list.map((p) => ({
          id: p.id.toString(),
          label: `${p.displayId || p.id} - ${p.title}`,
        })),
      );
    } catch {
      console.error("Failed to load public problems");
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  const handleOpenAdd = useCallback(() => {
    setAddModalOpen(true);
    loadPublicProblems();
  }, [loadPublicProblems]);

  const handleAdd = useCallback(async () => {
    if (!contestId) return;
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
  }, [contestId, newProblemId, newProblemTitle, refreshContest, showToast]);

  // --- Remove ---
  const handleRemove = useCallback(
    async (problemId: string) => {
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
    [contestId, selectedId, confirm, refreshContest, showToast],
  );

  // --- Reorder (debounced) ---
  const handleReorder = useCallback(
    (newOrder: ContestProblemSummary[]) => {
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
    [contestId, refreshContest, showToast],
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
            loading={contestLoading && problems.length === 0}
            onSelect={setSelectedId}
            onAdd={handleOpenAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        </div>
        <div className={styles.editorPane}>
          {selectedProblem ? (
            <EmbeddedProblemEditor
              key={selectedProblem.problemId}
              problemId={selectedProblem.problemId}
              contestId={contestId}
              onRemoved={handleProblemRemoved}
            />
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
        primaryButtonDisabled={adding || (!newProblemId && !newProblemTitle)}
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
              items={publicProblems}
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
              disabled={loadingPublic}
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
    </>
  );
};

export default CodingTestEditorLayout;
