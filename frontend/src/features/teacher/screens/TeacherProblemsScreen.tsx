import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Modal,
  InlineNotification,
  Grid,
  Column,
  Loading,
  Pagination,
} from "@carbon/react";
import { Add, Edit, TrashCan, Code } from "@carbon/icons-react";
import { useTeacherProblems } from "../hooks/useTeacherProblems";
import CreateProblemModal from "@/features/problems/components/modals/CreateProblemModal";

interface TeacherProblemsScreenProps {
  embedded?: boolean;
}

const TeacherProblemsScreen = ({
  embedded = false,
}: TeacherProblemsScreenProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { t: tp } = useTranslation("problem");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { problems, totalCount, isLoading, refetch, deleteProblem, isDeleting } =
    useTeacherProblems({ page, pageSize });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [problemToDelete, setProblemToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState("");

  const handleCreateProblem = (problemId?: string) => {
    refetch();
    if (problemId) {
      navigate(`/problems/${problemId}/edit`);
    }
  };

  const handleEdit = (problemId: string) => {
    navigate(`/problems/${problemId}/edit`);
  };

  const handleDeleteClick = (problem: { id: string; title: string }) => {
    setProblemToDelete(problem);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!problemToDelete) return;

    deleteProblem(problemToDelete.id, {
      onSuccess: () => {
        setDeleteModalOpen(false);
        setProblemToDelete(null);
        setError("");
      },
      onError: (err: Error) => {
        setError(err.message || t("message.deleteFailed"));
      },
    });
  };

  const getDifficultyColor = (
    difficulty: string
  ): "green" | "teal" | "red" | "gray" => {
    switch (difficulty) {
      case "easy":
        return "green";
      case "medium":
        return "teal";
      case "hard":
        return "red";
      default:
        return "gray";
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <Loading description={t("message.loading")} withOverlay={false} />
      </div>
    );
  }

  const tableContent = (
    <>
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind="error"
            title={t("message.error")}
            subtitle={error}
            lowContrast
            onCloseButtonClick={() => setError("")}
          />
        </div>
      )}

      <div
        className="carbon-panel"
        style={{
          padding: "1.5rem",
          backgroundColor: "var(--cds-layer-01)",
          border: "1px solid var(--cds-border-subtle)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--cds-heading-03, 1.25rem)",
            fontWeight: 400,
            marginBottom: "1rem",
            color: "var(--cds-text-primary)",
          }}
        >
          {tp("management.problemCount", {
            count: totalCount,
            defaultValue: `共 ${totalCount} 道題目`,
          })}
        </h2>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t("form.title")}</TableHeader>
                <TableHeader>{t("difficulty.easy")}</TableHeader>
                <TableHeader>{t("table.visibility")}</TableHeader>
                <TableHeader>{t("form.createdAt")}</TableHeader>
                <TableHeader>{t("table.actions")}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {problems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        color: "var(--cds-text-secondary)",
                      }}
                    >
                      {t("message.noData")}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                problems.map((problem) => (
                  <TableRow key={problem.id}>
                    <TableCell>
                      <span
                        style={{
                          cursor: "pointer",
                          color: "var(--cds-link-primary)",
                        }}
                        onClick={() => handleEdit(problem.id)}
                      >
                        {problem.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tag type={getDifficultyColor(problem.difficulty)}>
                        {t(`difficulty.${problem.difficulty}`)}
                      </Tag>
                    </TableCell>
                    <TableCell>
                      <Tag type={
                        problem.visibility === 'public' ? 'green' :
                        problem.visibility === 'hidden' ? 'gray' :
                        'blue'  // private
                      }>
                        {t(`status.${problem.visibility}`)}
                      </Tag>
                    </TableCell>
                    <TableCell>
                      {problem.createdAt
                        ? new Date(problem.createdAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Edit}
                          onClick={() => handleEdit(problem.id)}
                          hasIconOnly
                          iconDescription={t("button.edit")}
                        />
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          renderIcon={TrashCan}
                          onClick={() =>
                            handleDeleteClick({
                              id: problem.id,
                              title: problem.title,
                            })
                          }
                          hasIconOnly
                          iconDescription={t("button.delete")}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalCount > pageSize && (
          <div style={{ marginTop: "1rem" }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={[10, 20, 50, 100]}
              totalItems={totalCount}
              onChange={({ page: newPage, pageSize: newPageSize }) => {
                if (newPage !== page) setPage(newPage);
                if (newPageSize !== pageSize) {
                  setPageSize(newPageSize);
                  setPage(1); // Reset to first page when page size changes
                }
              }}
            />
          </div>
        )}
      </div>

      <CreateProblemModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreateProblem}
      />

      <Modal
        open={deleteModalOpen}
        modalHeading={tp("modal.confirmDelete", "確認刪除")}
        primaryButtonText={t("button.delete")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => {
          setDeleteModalOpen(false);
          setProblemToDelete(null);
        }}
        onRequestSubmit={handleDeleteConfirm}
        primaryButtonDisabled={isDeleting}
        danger
      >
        <p>
          {tp("modal.deleteConfirmMessage", {
            title: problemToDelete?.title,
            defaultValue: `確定要刪除題目「${problemToDelete?.title}」嗎？此操作無法復原。`,
          })}
        </p>
      </Modal>
    </>
  );

  // 嵌入模式：只顯示表格內容
  if (embedded) {
    return (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <p
            style={{
              fontSize: "var(--cds-body-long-01, 0.875rem)",
              color: "var(--cds-text-secondary)",
            }}
          >
            {tp("management.description", "管理您建立的題目")}
          </p>
          <Button
            kind="primary"
            renderIcon={Add}
            onClick={() => setIsCreateModalOpen(true)}
          >
            {tp("button.createProblem")}
          </Button>
        </div>
        {tableContent}
      </>
    );
  }

  // 獨立頁面模式：顯示完整頁面
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        backgroundColor: "var(--cds-background)",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <div style={{ marginTop: "3rem", marginBottom: "2rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: "var(--cds-productive-heading-05, 2rem)",
                      fontWeight: 400,
                      marginBottom: "0.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    <Code size={32} />
                    {t("page.problemManagement")}
                  </h1>
                  <p
                    style={{
                      fontSize: "var(--cds-body-long-01, 0.875rem)",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {tp("management.description", "管理您建立的題目")}
                  </p>
                </div>
                <Button
                  kind="primary"
                  renderIcon={Add}
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  {tp("button.createProblem")}
                </Button>
              </div>
            </div>

            {tableContent}
          </Column>
        </Grid>
      </div>
    </div>
  );
};

export default TeacherProblemsScreen;
