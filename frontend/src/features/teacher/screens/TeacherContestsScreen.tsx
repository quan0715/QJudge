import { useState, useMemo } from "react";
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
  Dropdown,
} from "@carbon/react";
import { Add, Edit, TrashCan, Trophy } from "@carbon/icons-react";
import { useTeacherContests } from "../hooks/useTeacherContests";
import { CreateContestModal } from "../components/modals";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
  type ContestStatus,
} from "@/core/entities/contest.entity";
import { formatDateTime } from "@/i18n/dateUtils";

type FilterStatus = "all" | ContestStatus;

interface TeacherContestsScreenProps {
  embedded?: boolean;
}

const TeacherContestsScreen = ({
  embedded = false,
}: TeacherContestsScreenProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("common");
  const { t: tc } = useTranslation("contest");

  const { contests, isLoading, refetch, deleteContest, isDeleting } =
    useTeacherContests();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [contestToDelete, setContestToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const statusFilterOptions = [
    { id: "all", text: t("filter.all") },
    { id: "draft", text: t("status.draft") },
    { id: "published", text: t("status.published") },
    { id: "archived", text: t("status.archived") },
  ];

  const dateTimeCellOptions = {
    year: "numeric" as const,
    month: "2-digit" as const,
    day: "2-digit" as const,
    hour: "2-digit" as const,
    minute: "2-digit" as const,
    locale: i18n.language,
  };

  const filteredContests = useMemo(() => {
    if (statusFilter === "all") return contests;
    return contests.filter((contest) => contest.status === statusFilter);
  }, [contests, statusFilter]);

  const handleCreateContest = (contestId?: string) => {
    refetch();
    if (contestId) {
      navigate(`/contests/${contestId}/admin?panel=settings`);
    }
  };

  const handleEdit = (contestId: string) => {
    navigate(`/contests/${contestId}/admin?panel=settings`);
  };

  const handleDeleteClick = (contest: { id: string; name: string }) => {
    setContestToDelete(contest);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!contestToDelete) return;

    deleteContest(contestToDelete.id, {
      onSuccess: () => {
        setDeleteModalOpen(false);
        setContestToDelete(null);
        setError("");
      },
      onError: (err: Error) => {
        setError(err.message || t("message.deleteFailed"));
      },
    });
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2
            style={{
              fontSize: "var(--cds-heading-03, 1.25rem)",
              fontWeight: 400,
              color: "var(--cds-text-primary)",
            }}
          >
            {tc("management.contestCount", {
              count: filteredContests.length,
            })}
          </h2>
          <Dropdown
            id="status-filter"
            titleText=""
            label={t("filter.allStatus")}
            items={statusFilterOptions}
            itemToString={(item) => item?.text || ""}
            selectedItem={statusFilterOptions.find(
              (opt) => opt.id === statusFilter
            )}
            onChange={({ selectedItem }) =>
              setStatusFilter((selectedItem?.id as FilterStatus) || "all")
            }
            size="sm"
            style={{ minWidth: "150px" }}
          />
        </div>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t("form.name")}</TableHeader>
                <TableHeader>{t("table.status")}</TableHeader>
                <TableHeader>{t("form.startTime")}</TableHeader>
                <TableHeader>{t("form.endTime")}</TableHeader>
                <TableHeader>{t("table.visibility")}</TableHeader>
                <TableHeader>{t("table.actions")}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
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
                filteredContests.map((contest) => {
                  const state = getContestState(contest);
                  return (
                    <TableRow key={contest.id}>
                      <TableCell>
                        <span
                          style={{
                            cursor: "pointer",
                            color: "var(--cds-link-primary)",
                          }}
                          onClick={() => handleEdit(contest.id)}
                        >
                          {contest.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Tag type={getContestStateColor(state)}>
                          {getContestStateLabel(state)}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(contest.startTime, dateTimeCellOptions)}
                      </TableCell>
                      <TableCell>
                        {formatDateTime(contest.endTime, dateTimeCellOptions)}
                      </TableCell>
                      <TableCell>
                        <Tag
                          type={
                            contest.visibility === "public" ? "green" : "purple"
                          }
                        >
                          {contest.visibility === "public"
                            ? t("table.public")
                            : t("table.private")}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Edit}
                            onClick={() => handleEdit(contest.id)}
                            hasIconOnly
                            iconDescription={t("button.edit")}
                          />
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            onClick={() =>
                              handleDeleteClick({
                                id: contest.id,
                                name: contest.name,
                              })
                            }
                            hasIconOnly
                            iconDescription={t("button.delete")}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <CreateContestModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreateContest}
      />

      <Modal
        open={deleteModalOpen}
        modalHeading={tc("modal.confirmDelete")}
        primaryButtonText={t("button.delete")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => {
          setDeleteModalOpen(false);
          setContestToDelete(null);
        }}
        onRequestSubmit={handleDeleteConfirm}
        primaryButtonDisabled={isDeleting}
        danger
      >
        <p>
          {tc("modal.deleteConfirmMessage", {
            name: contestToDelete?.name,
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
            {tc("management.description")}
          </p>
          <Button
            kind="primary"
            renderIcon={Add}
            onClick={() => setIsCreateModalOpen(true)}
          >
            {tc("button.createContest")}
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
                    <Trophy size={32} />
                    {t("page.contestManagement")}
                  </h1>
                  <p
                    style={{
                      fontSize: "var(--cds-body-long-01, 0.875rem)",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {tc("management.description")}
                  </p>
                </div>
                <Button
                  kind="primary"
                  renderIcon={Add}
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  {tc("button.createContest")}
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

export default TeacherContestsScreen;
