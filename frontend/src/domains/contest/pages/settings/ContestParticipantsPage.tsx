import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Button,
  InlineNotification,
  Pagination,
  TextArea,
  Dropdown,
  Modal,
  Tag,
} from "@carbon/react";
import {
  Add,
  Edit,
  TrashCan,
  Unlocked,
  Renew,
  Restart,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { AddParticipantModal } from "../../components/modals/AddParticipantModal";
import {
  getContestParticipants,
  addContestParticipant,
  unlockParticipant,
  updateParticipant,
  removeParticipant,
  reopenExam,
} from "@/services/contest";
import type {
  ContestParticipant,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";

const ContestAdminParticipantsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Add Participant State
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Edit Participant State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] =
    useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] =
    useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Exam status options for dropdown
  const examStatusOptions = [
    { id: "not_started", label: t("participants.statusFilter.not_started") },
    { id: "in_progress", label: t("participants.statusFilter.in_progress") },
    { id: "paused", label: t("participants.statusFilter.paused") },
    { id: "locked", label: t("participants.statusFilter.locked") },
    { id: "submitted", label: t("participants.statusFilter.submitted") },
  ];

  // Status filter options (includes "all")
  const statusFilterOptions = [
    { id: "all", label: t("participants.statusFilter.all") },
    ...examStatusOptions,
  ];

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (contestId) {
      loadParticipants();
    }
  }, [contestId]);

  const loadParticipants = async () => {
    try {
      const data = await getContestParticipants(contestId!);
      setParticipants(data);
    } catch (error) {
      console.error("Failed to load participants", error);
      setNotification({ kind: "error", message: t("participants.messages.loadError") });
    }
  };

  const handleAddParticipant = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestParticipant(contestId, username);
      await loadParticipants();
      setNotification({ kind: "success", message: t("participants.messages.addSuccess") });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || t("participants.messages.addError"),
      });
      throw error; // Propagate to modal
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!contestId || !confirm(t("participants.messages.unlockConfirm"))) return;
    try {
      await unlockParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: t("participants.messages.unlockSuccess") });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || t("participants.messages.unlockError"),
      });
    }
  };

  const openEditModal = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditExamStatus(p.examStatus || "not_started");
    setEditLockReason(p.lockReason || "");
    setEditModalOpen(true);
  };

  const handleUpdateParticipant = async () => {
    if (!contestId || !editingParticipant) return;
    try {
      setSaving(true);
      await updateParticipant(contestId, Number(editingParticipant.userId), {
        exam_status: editExamStatus,
        lock_reason: editExamStatus === "locked" ? editLockReason : "",
      });
      setEditModalOpen(false);
      await loadParticipants();
      setNotification({ kind: "success", message: t("participants.messages.updateSuccess") });
    } catch (error: any) {
      setNotification({ kind: "error", message: error.message || t("participants.messages.updateError") });
    } finally {
      setSaving(false);
    }
  };

  const handleReopenExam = async (userId: number) => {
    if (!contestId || !confirm(t("participants.messages.reopenConfirm"))) return;
    try {
      await reopenExam(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: t("participants.messages.reopenSuccess") });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || t("participants.messages.reopenError"),
      });
    }
  };

  const handleRemoveParticipant = async (userId: number, username: string) => {
    if (!contestId || !confirm(t("participants.messages.removeConfirm", { username }))) return;
    try {
      await removeParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: t("participants.messages.removeSuccess") });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || t("participants.messages.removeError"),
      });
    }
  };

  // Prepare table rows
  const headers = [
    { key: "username", header: t("participants.table.headers.username") },
    { key: "joinedAt", header: t("participants.table.headers.joinedAt") },
    { key: "status", header: t("participants.table.headers.status") },
    { key: "lockReason", header: t("participants.table.headers.lockReason") },
    { key: "actions", header: t("participants.table.headers.actions") },
  ];

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Apply status filter
  const filteredParticipants =
    statusFilter === "all"
      ? participants
      : participants.filter(
          (p) => (p.examStatus || "not_started") === statusFilter
        );

  const paginatedParticipants = filteredParticipants.slice(
    startIndex,
    endIndex
  );

  // Helper function to get status tag
  const getStatusTag = (status: ExamStatusType | undefined) => {
    if (status === "locked") {
      return <Tag type="red" size="sm">{t("participants.statusFilter.locked")}</Tag>;
    }
    if (status === "submitted") {
      return <Tag type="green" size="sm">{t("participants.statusFilter.submitted")}</Tag>;
    }
    if (status === "in_progress") {
      return <Tag type="blue" size="sm">{t("participants.statusFilter.in_progress")}</Tag>;
    }
    if (status === "paused") {
      return <Tag type="warm-gray" size="sm">{t("participants.statusFilter.paused")}</Tag>;
    }
    return <Tag type="cool-gray" size="sm">{t("participants.statusFilter.not_started")}</Tag>;
  };

  // Removed full-page loading guard - show empty table instead

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div
        style={{
          padding: "0",
          maxWidth: "100%",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={t(`logs.notification.${notification.kind}`)}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <ContainerCard
          title={t("participants.title")}
          noPadding
          action={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Renew}
                onClick={loadParticipants}
                hasIconOnly
                iconDescription={tc("action.refresh")}
              />
              <Button
                size="sm"
                renderIcon={Add}
                onClick={() => setAddModalOpen(true)}
              >
                {t("participants.addParticipant")}
              </Button>
            </div>
          }
        >
          {/* Status Filter */}
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--cds-border-subtle)",
              display: "flex",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <Dropdown
              id="status-filter"
              titleText={t("participants.statusFilter.all")}
              label={t("participants.statusFilter.all")}
              items={statusFilterOptions}
              itemToString={(item: any) => item?.label || ""}
              selectedItem={statusFilterOptions.find(
                (opt) => opt.id === statusFilter
              )}
              onChange={({ selectedItem }: any) => {
                setStatusFilter(selectedItem?.id || "all");
                setPage(1); // Reset to first page when filter changes
              }}
              size="sm"
              style={{ minWidth: "150px" }}
            />
            <span
              style={{
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              {t("common.pagination.showing")} {filteredParticipants.length} / {participants.length}{" "}
              {t("participants.title")}
            </span>
          </div>
          <DataTable
            rows={paginatedParticipants.map((p) => ({
              ...p,
              id: p.userId.toString(),
            }))}
            headers={headers}
          >
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getTableProps,
            }: any) => (
              <TableContainer>
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      {headers.map((header: any) => {
                        const { key, ...headerProps } = getHeaderProps({
                          header,
                        });
                        return (
                          <TableHeader key={key} {...headerProps}>
                            {header.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row: any) => {
                      const p = participants.find(
                        (item) => item.userId.toString() === row.id
                      );
                      if (!p) return null;
                      const { key: rowKey, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow key={rowKey} {...rowProps}>
                          <TableCell>
                            <div style={{ fontWeight: 600 }}>{p.username}</div>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--cds-text-secondary)",
                              }}
                            >
                              ID: {p.userId}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(p.joinedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {getStatusTag(p.examStatus)}
                            </div>
                          </TableCell>
                          <TableCell>{p.lockReason || "-"}</TableCell>
                          <TableCell>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {p.examStatus === "locked" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Unlocked}
                                  iconDescription={t("participants.actions.unlock")}
                                  hasIconOnly
                                  onClick={() => handleUnlock(Number(p.userId))}
                                />
                              )}
                              {p.examStatus === "submitted" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Restart}
                                  iconDescription={t("participants.actions.reopen")}
                                  hasIconOnly
                                  onClick={() =>
                                    handleReopenExam(Number(p.userId))
                                  }
                                />
                              )}
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                iconDescription={t("participants.actions.edit")}
                                hasIconOnly
                                onClick={() => openEditModal(p)}
                              />
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                iconDescription={t("participants.actions.remove")}
                                hasIconOnly
                                onClick={() =>
                                  handleRemoveParticipant(
                                    Number(p.userId),
                                    p.username
                                  )
                                }
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
          <Pagination
            totalItems={filteredParticipants.length}
            backwardText={tc("pagination.backwardText")}
            forwardText={tc("pagination.forwardText")}
            itemsPerPageText={tc("pagination.itemsPerPageText")}
            page={page}
            pageSize={pageSize}
            pageSizes={[10, 20, 50, 100]}
            onChange={({ page: newPage, pageSize: newPageSize }: any) => {
              setPage(newPage);
              setPageSize(newPageSize);
            }}
          />
        </ContainerCard>

        {/* Add Participant Modal */}
        <AddParticipantModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddParticipant}
        />

        {/* Edit Participant Modal */}
        <Modal
          open={editModalOpen}
          modalHeading={t("participants.editModal.title") + `: ${editingParticipant?.username}`}
          primaryButtonText={saving ? t("participants.editModal.saving") : t("participants.editModal.save")}
          secondaryButtonText={t("participants.editModal.cancel")}
          onRequestSubmit={handleUpdateParticipant}
          onRequestClose={() => setEditModalOpen(false)}
          primaryButtonDisabled={saving}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <Dropdown
              id="exam-status"
              titleText={t("participants.editModal.statusLabel")}
              label={t("participants.editModal.statusHelp")}
              items={examStatusOptions}
              itemToString={(item: any) => item?.label || ""}
              selectedItem={examStatusOptions.find(
                (opt) => opt.id === editExamStatus
              )}
              onChange={({ selectedItem }: any) =>
                setEditExamStatus(selectedItem?.id as ExamStatusType)
              }
            />

            {editExamStatus === "locked" && (
              <TextArea
                id="lock-reason"
                labelText={t("participants.editModal.lockReasonLabel")}
                placeholder={t("participants.editModal.lockReasonPlaceholder")}
                value={editLockReason}
                onChange={(e) => setEditLockReason(e.target.value)}
              />
            )}
          </div>
        </Modal>
      </div>
    </SurfaceSection>
  );
};

export default ContestAdminParticipantsPage;
