import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal, TextInput, InlineNotification, ComboBox } from "@carbon/react";
import { useTranslation } from "react-i18next";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import type {
  ContestDetail,
  ContestProblemSummary,
  ScoreboardRow,
} from "@/core/entities/contest.entity";
import { ProblemTable, type ProblemRowData } from "@/features/problems/components/list";
import ContainerCard from "@/shared/layout/ContainerCard";
import { ProblemImportModal } from "@/features/problems/components/modals";
import {
  addContestProblem,
  removeContestProblem,
  reorderContestProblems,
} from "@/infrastructure/api/repositories";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

interface ContestProblemListProps {
  contest: ContestDetail;
  problems: ContestProblemSummary[];
  myRank: ScoreboardRow | null;
  currentUser: any;
  maxWidth?: string;
  onReload?: () => void;
}

export const ContestProblemList: React.FC<ContestProblemListProps> = ({
  contest,
  problems: initialProblems,
  myRank,
  currentUser,
  maxWidth,
  onReload,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  // Local problems state for admin operations
  const [problems, setProblems] = useState(initialProblems);

  // Sync local state when initial problems change
  useEffect(() => {
    setProblems(initialProblems);
  }, [initialProblems]);

  // Admin state
  const [addProblemModalOpen, setAddProblemModalOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [publicProblems, setPublicProblems] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const { confirm, modalProps } = useConfirmModal();

  // Load public problems for ComboBox
  const loadPublicProblems = async () => {
    try {
      setLoadingProblems(true);
      const problems = await getProblems({ scope: "public" });
      setPublicProblems(
        problems.map((p) => ({
          id: p.id.toString(),
          label: `${p.displayId || p.id} - ${p.title}`,
        }))
      );
    } catch (error) {
      console.error("Failed to load public problems", error);
    } finally {
      setLoadingProblems(false);
    }
  };

  useEffect(() => {
    if (addProblemModalOpen) {
      loadPublicProblems();
    }
  }, [addProblemModalOpen]);

  // Permission checks
  // Global role check
  const isGlobalAdminOrTeacher =
    currentUser?.role === "admin" || currentUser?.role === "teacher";
  // Contest-specific role check (owner is usually admin/teacher in contest context)
  const isContestManager =
    contest.currentUserRole === "admin" ||
    contest.currentUserRole === "teacher";

  // Students can view problems if they have started the exam (even before it's active on their end)
  // OR if they are admin/teacher
  const canView =
    isGlobalAdminOrTeacher || isContestManager || contest.hasStarted;
  // Expand canManage to strictly include contest managers
  const canManage =
    contest.permissions?.canEditContest ||
    isGlobalAdminOrTeacher ||
    isContestManager;

  // Reload problems - delegate to parent via onReload which uses context refreshContest
  const reloadProblems = async () => {
    if (onReload) {
      await onReload();
    }
  };

  // Row click handler for participants (navigate to solve page)
  const handleRowClick = (problem: ProblemRowData) => {
    if (canView) {
      const targetId = problem.problemId || problem.id;
      navigate(`/contests/${contestId}/solve/${targetId}`);
    }
  };

  // Action handler for admin/teacher (edit/delete)
  const handleAction = async (action: string, problem: ProblemRowData) => {
    if (!contestId) return;
    if (action === "edit") {
      navigate(`/teacher/contests/${contestId}/problems/${problem.id}/edit`);
    } else if (action === "delete") {
      const confirmed = await confirm({
        title: t("problemManage.confirmRemove"),
        confirmLabel: tc("button.delete"),
        cancelLabel: tc("button.cancel"),
        danger: true,
      });
      if (!confirmed) return;
      try {
        await removeContestProblem(contestId, problem.id.toString());
        await reloadProblems();
        setNotification({
          kind: "success",
          message: t("problemManage.removed"),
        });
      } catch (error) {
        console.error("Failed to remove problem", error);
        setNotification({
          kind: "error",
          message: t("problemManage.removeFailed"),
        });
      }
    } else if (action === "move_up" || action === "move_down") {
      // Reorder logic
      const currentIndex = problems.findIndex(
        (p) => p.id.toString() === problem.id.toString()
      );
      if (currentIndex === -1) return;
      if (action === "move_up" && currentIndex === 0) return;
      if (action === "move_down" && currentIndex === problems.length - 1)
        return;

      const targetIndex =
        action === "move_up" ? currentIndex - 1 : currentIndex + 1;

      const newProblems = [...problems];
      [newProblems[currentIndex], newProblems[targetIndex]] = [
        newProblems[targetIndex],
        newProblems[currentIndex],
      ];

      const orders = newProblems.map((p, index) => ({
        id: p.id,
        order: index,
      }));

      try {
        setProblems(newProblems); // Optimistic update
        await reorderContestProblems(contestId, orders);
        await reloadProblems();
      } catch (error) {
        console.error("Failed to reorder", error);
        setNotification({
          kind: "error",
          message: t("problemManage.reorderFailed"),
        });
        await reloadProblems();
      }
    }
  };

  const handleAddProblem = async () => {
    if (!contestId) return;
    try {
      setAdding(true);
      if (newProblemId) {
        await addContestProblem(contestId, { problem_id: newProblemId });
      } else if (newProblemTitle) {
        await addContestProblem(contestId, { title: newProblemTitle });
      }
      setAddProblemModalOpen(false);
      setNewProblemId("");
      setNewProblemTitle("");
      await reloadProblems();
      setNotification({ kind: "success", message: t("problemManage.added") });
    } catch (error) {
      console.error("Failed to add problem", error);
      setNotification({ kind: "error", message: t("problemManage.addFailed") });
    } finally {
      setAdding(false);
    }
  };

  // Map problems for table display
  const tableProblems: ProblemRowData[] = problems.map((p) => ({
    ...p,
    id: p.id,
    problemId: (p as any).problemId || p.id,
    title: p.title,
    label: p.label || "-",
    score: p.score || 0,
    order: p.order || 0,
    difficulty: (p as any).difficulty,
    isSolved: myRank?.problems?.[p.id]?.status === "AC",
    submissionCount: (p as any).submissionCount,
    acceptedCount: (p as any).acceptedCount,
  }));

  // ============================================
  // ADMIN/TEACHER VIEW - Full management interface
  // ============================================
  if (canManage) {
    return (
      <SurfaceSection
        maxWidth={maxWidth}
        style={{ minHeight: "100%", flex: 1 }}
      >
        <div className="cds--row">
          <div className="cds--col-lg-16">
            {notification && (
              <InlineNotification
                kind={notification.kind}
                title={
                  notification.kind === "success"
                    ? tc("message.success")
                    : tc("message.error")
                }
                subtitle={notification.message}
                onClose={() => setNotification(null)}
                style={{ marginBottom: "1rem", maxWidth: "100%" }}
              />
            )}
            <ContainerCard title={t("problemManage.title")} noPadding>
              <ProblemTable
                problems={tableProblems}
                mode="contest"
                onAction={handleAction}
                onRowClick={handleRowClick}
                onAdd={() => setAddProblemModalOpen(true)}
                onImport={() => setImportModalOpen(true)}
              />
            </ContainerCard>
          </div>
        </div>

        {/* Add Problem Modal */}
        <Modal
          open={addProblemModalOpen}
          modalHeading={t("problemManage.addProblem")}
          primaryButtonText={
            adding ? t("problemManage.adding") : t("problemManage.add")
          }
          secondaryButtonText={tc("button.cancel")}
          onRequestSubmit={handleAddProblem}
          onRequestClose={() => setAddProblemModalOpen(false)}
          primaryButtonDisabled={adding || (!newProblemId && !newProblemTitle)}
        >
          <div style={{ marginBottom: "1rem" }}>
            <p
              style={{
                marginBottom: "1rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              {t("problemManage.addHint")}
            </p>
            {/* Problem Selection Area */}
            <div style={{ marginBottom: "1.5rem" }}>
              <ComboBox
                id="problem-select"
                titleText={t("problemManage.selectFromLibrary")}
                placeholder={t("problemManage.searchPlaceholder")}
                items={publicProblems}
                itemToString={(item: any) => (item ? item.label : "")}
                onChange={(e: { selectedItem: any }) => {
                  setNewProblemId(e.selectedItem ? e.selectedItem.id : "");
                }}
                shouldFilterItem={({
                  item,
                  inputValue,
                }: {
                  item: any;
                  inputValue: string | null;
                }) => {
                  if (!inputValue) return true;
                  return item.label
                    .toLowerCase()
                    .includes(inputValue?.toLowerCase() || "");
                }}
                disabled={loadingProblems}
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
                labelText={t("problemManage.orCreateNew")}
                placeholder={t("problemManage.newProblemPlaceholder")}
                value={newProblemTitle}
                onChange={(e) => setNewProblemTitle(e.target.value)}
                disabled={!!newProblemId} // Disable if existing problem selected
              />
            </div>
          </div>
        </Modal>

        {/* Import Modal */}
        <ProblemImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImport={async (problemData) => {
            // Use createContestProblem to create problem directly in contest
            // This avoids creating a public problem first and then cloning it
            const { createContestProblem } = await import("@/infrastructure/api/repositories");
            const created = await createContestProblem(contestId!, problemData);
            await reloadProblems();
            return { id: created.id, contest_id: contestId };
          }}
        />
        <ConfirmModal {...modalProps} />
      </SurfaceSection>
    );
  }

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <ContainerCard title={t("problemList")} noPadding>
            <ProblemTable
              problems={tableProblems}
              mode="contest"
              onRowClick={handleRowClick}
            />
          </ContainerCard>
        </div>
      </div>
    </SurfaceSection>
  );
};
