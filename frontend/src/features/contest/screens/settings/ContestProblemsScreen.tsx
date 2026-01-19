import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Loading,
  InlineNotification,
  Modal,
  TextInput,
  ComboBox,
} from "@carbon/react";
import { Add, Upload } from "@carbon/icons-react";
import { addContestProblem, removeContestProblem } from "@/infrastructure/api/repositories";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { ContestProblemTable } from "@/features/problems/components/list";
import ContainerCard from "@/shared/layout/ContainerCard";
import { PageHeader } from "@/shared/layout/PageHeader";
import { ProblemImportModal } from "@/features/problems/components/modals";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

const ContestAdminProblemsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const { contest, loading: contestLoading, refreshContest } = useContest();

  const [problems, setProblems] = useState<ContestProblemSummary[]>([]);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Add Problem State
  const [addProblemModalOpen, setAddProblemModalOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [publicProblems, setPublicProblems] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const { confirm, modalProps } = useConfirmModal();

  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Sync problems from context
  useEffect(() => {
    if (contest?.problems) {
      setProblems(contest.problems);
    }
  }, [contest?.problems]);

  const loadPublicProblems = async () => {
    try {
      setLoadingProblems(true);
      console.log("Fetching public problems...");
      const problems = await getProblems({ scope: "public" });
      console.log("Fetched public problems:", problems);
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
      await refreshContest();
      setNotification({ kind: "success", message: "題目已新增" });
    } catch (error) {
      console.error("Failed to add problem", error);
      setNotification({
        kind: "error",
        message: "新增題目失敗，請確認 ID 或標題正確",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveProblem = async (problemId: string) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: "確定要從競賽中移除此題目嗎？",
      confirmLabel: "移除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeContestProblem(contestId, problemId);
      await refreshContest();
      setNotification({ kind: "success", message: "題目已移除" });
    } catch (error) {
      console.error("Failed to remove problem", error);
      setNotification({ kind: "error", message: "移除題目失敗" });
    }
  };

  if (contestLoading && problems.length === 0) return <Loading />;

  return (
    <div className="contest-admin-problems">
      <PageHeader
        title="題目管理"
        subtitle="管理競賽題目，您可以從現有題庫新增或建立新題目"
        maxWidth="1056px"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              size="md"
              kind="secondary"
              renderIcon={Upload}
              onClick={() => setImportModalOpen(true)}
            >
              匯入 YAML
            </Button>
            <Button
              size="md"
              renderIcon={Add}
              onClick={() => setAddProblemModalOpen(true)}
            >
              新增題目
            </Button>
          </div>
        }
      />

      <div
        style={{
          padding: "1rem",
          maxWidth: "1056px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <ContainerCard noPadding>
          <ContestProblemTable
            problems={problems}
            onRemove={(problemId) => handleRemoveProblem(problemId)}
            onRowClick={(problem) => {
              navigate(`/contests/${contestId}/solve/${problem.problemId}`);
            }}
          />
        </ContainerCard>

        <Modal
          open={addProblemModalOpen}
          modalHeading="新增競賽題目"
          primaryButtonText={adding ? "新增中..." : "新增"}
          secondaryButtonText="取消"
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
              請輸入題目 ID (從題庫加入) 或 題目標題 (建立新題目)。
            </p>
            {/* Problem Selection Area */}
            <div style={{ marginBottom: "1.5rem" }}>
              <ComboBox
                id="problem-select"
                titleText="從題庫與範本選擇 (Clone)"
                placeholder="搜尋題目 ID 或標題..."
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
                    .includes(inputValue.toLowerCase());
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
                labelText="或者建立空白新題目"
                placeholder="輸入新題目名稱"
                value={newProblemTitle}
                onChange={(e) => setNewProblemTitle(e.target.value)}
                disabled={!!newProblemId} // Disable if existing problem selected
              />
            </div>
          </div>
        </Modal>

        <ProblemImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImport={async (problemData) => {
            // Use createContestProblem to create problem ONLY in contest (not in public practice)
            const { createContestProblem } = await import("@/infrastructure/api/repositories");
            const created = await createContestProblem(contestId!, problemData);
            await refreshContest();
            return { id: created.id, contest_id: contestId };
          }}
        />
        <ConfirmModal {...modalProps} />
      </div>
    </div>
  );
};

export default ContestAdminProblemsPage;
