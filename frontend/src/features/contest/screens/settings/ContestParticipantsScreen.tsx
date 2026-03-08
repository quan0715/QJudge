import { useState, useMemo } from "react";
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
  Search,
} from "@carbon/react";
import {
  Add,
  Edit,
  TrashCan,
  Unlocked,
  Renew,
  Restart,
  Download,
  View,
  ArrowUp,
  ArrowDown,
} from "@carbon/icons-react";
import { AddParticipantModal } from "../../components/modals/AddParticipantModal";
import ExamVideoReviewModal from "@/features/contest/components/admin/ExamVideoReviewModal";
import {
  addContestParticipant,
  approveTakeover,
  unlockParticipant,
  updateParticipant,
  removeParticipant,
  reopenExam,
  downloadParticipantReport,
} from "@/infrastructure/api/repositories";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContestAdmin } from "@/features/contest/contexts";
import { useContest } from "@/features/contest/contexts/ContestContext";
import type {
  ContestParticipant,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

const EXAM_STATUS_KEYS: string[] = [
  "not_started",
  "in_progress",
  "paused",
  "locked",
  "locked_takeover",
  "submitted",
];

const ContestParticipantsScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { t } = useTranslation("contest");
  const { participants, isRefreshing, refreshAdminData } = useContestAdmin();
  const { contest } = useContest();
  const { user } = useAuth();

  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const { confirm, modalProps } = useConfirmModal();

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
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoTargetUserId, setVideoTargetUserId] = useState<string | undefined>(undefined);

  const examStatusOptions = EXAM_STATUS_KEYS.map((id) => ({
    id,
    label: t(`examStatus.${id}`, id),
  }));

  const statusFilterOptions = [
    { id: "all", label: t("participantsAdmin.allStatus", "全部狀態") },
    ...examStatusOptions,
  ];

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Sort state
  type SortKey = "username" | "score" | "joinedAt";
  type SortDirection = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const canDeleteExamVideos = useMemo(() => {
    if (!contest || !user) return false;
    if (contest.permissions?.canDeleteContest) return true;
    return Boolean(contest.ownerUsername && user.username === contest.ownerUsername);
  }, [contest, user]);

  const handleAddParticipant = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestParticipant(contestId, username);
      await refreshAdminData();
      setNotification({ kind: "success", message: t("participants.added", "參賽者已新增") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.addFailed", "新增參賽者失敗");
      setNotification({ kind: "error", message });
      throw error;
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, userId);
      await refreshAdminData();
      setNotification({ kind: "success", message: t("participants.unlocked", "已解除鎖定") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.unlockFailed", "解除鎖定失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleTakeoverApprove = async (userId: number) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: "確定要核可此學生的裝置接管嗎？",
      confirmLabel: "核可",
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await approveTakeover(contestId, userId);
      await refreshAdminData();
      setNotification({ kind: "success", message: "已核可裝置接管，可繼續作答" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "核可接管失敗";
      setNotification({ kind: "error", message });
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
      await refreshAdminData();
      setNotification({ kind: "success", message: t("participants.statusUpdated", "參賽者狀態已更新") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.updateFailed", "更新失敗");
      setNotification({ kind: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const handleReopenExam = async (userId: number) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("participants.confirmReopen", "確定要重新開放此學生考試嗎？"),
      confirmLabel: t("participants.reopen", "重新開放"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, userId);
      await refreshAdminData();
      setNotification({ kind: "success", message: t("participants.reopened", "已重新開放考試") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.reopenFailed", "重新開放失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleRemoveParticipant = async (userId: number, username: string) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("participants.confirmRemove", { name: username }),
      confirmLabel: t("participants.remove", "移除"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, userId);
      await refreshAdminData();
      setNotification({ kind: "success", message: t("participants.removed", "參賽者已移除") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.removeFailed", "移除參賽者失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleDownloadReport = async (
    userId: number,
    username: string,
  ) => {
    if (!contestId) return;
    try {
      setNotification({
        kind: "success",
        message: t("participants.generatingReport", { name: username }),
      });

      await downloadParticipantReport(contestId, userId);

      setNotification({ kind: "success", message: t("participants.reportDownloaded", { name: username }) });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.downloadFailed", "下載報告失敗");
      setNotification({ kind: "error", message });
    }
  };

  // Prepare table rows
  const headers = [
    { key: "username", header: t("participants.headers.username", "使用者"), sortable: true },
    { key: "score", header: t("participants.headers.score", "分數"), sortable: true },
    { key: "joinedAt", header: t("participants.headers.joinedAt", "加入時間"), sortable: true },
    { key: "status", header: t("participants.headers.status", "狀態") },
    { key: "lockReason", header: t("participants.headers.lockReason", "鎖定原因") },
    { key: "actions", header: t("participants.headers.actions", "操作") },
  ];

  // Handle sort toggle
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "score" ? "desc" : "asc");
    }
    setPage(1); // Reset to first page when sorting changes
  };

  // Apply search, status filter, and sorting
  const processedParticipants = useMemo(() => {
    let result = [...participants];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.username.toLowerCase().includes(query) ||
          p.userId.toString().includes(query) ||
          (p.displayName && p.displayName.toLowerCase().includes(query)) ||
          (p.nickname && p.nickname.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter(
        (p) => (p.examStatus || "not_started") === statusFilter
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "username":
          comparison = a.username.localeCompare(b.username);
          break;
        case "score":
          comparison = (a.score || 0) - (b.score || 0);
          break;
        case "joinedAt":
          comparison =
            new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [participants, searchQuery, statusFilter, sortKey, sortDirection]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedParticipants = processedParticipants.slice(
    startIndex,
    endIndex
  );

  // Removed full-page loading guard - show empty table instead

  return (
    <SurfaceSection maxWidth="1056px" style={{ height: "100%", overflowY: "auto" }}>
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
            title={notification.kind === "success" ? t("common.success", "成功") : t("common.error", "錯誤")}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <ContainerCard
          title={t("participants.title", "參賽者列表")}
          noPadding
          action={
            <div style={{ display: "flex", gap: 0 }}>
              <Button
                kind="ghost"
                renderIcon={Renew}
                onClick={refreshAdminData}
                hasIconOnly
                iconDescription={t("common.refresh", "重新整理")}
                disabled={isRefreshing}
              />
              <Button
                renderIcon={Add}
                onClick={() => setAddModalOpen(true)}
              >
                {t("participants.add", "新增")}
              </Button>
            </div>
          }
        >
          {/* Search and Filter Bar */}
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--cds-border-subtle)",
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "flex-end",
            }}
          >
            <Search
              id="participant-search"
              labelText={t("participants.searchLabel", "搜尋參賽者")}
              placeholder={t("participants.searchPlaceholder", "搜尋姓名或使用者 ID...")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // Reset to first page when search changes
              }}
              size="sm"
              style={{ minWidth: "240px", maxWidth: "320px" }}
            />
            <Dropdown
              id="status-filter"
              titleText={t("participants.filterStatus", "篩選狀態")}
              label={t("participants.selectStatus", "選擇狀態")}
              items={statusFilterOptions}
              itemToString={(item) => item?.label || ""}
              selectedItem={statusFilterOptions.find(
                (opt) => opt.id === statusFilter
              )}
              onChange={({ selectedItem }) => {
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
                marginLeft: "auto",
              }}
            >
              {t("participants.displayCount", { shown: processedParticipants.length, total: participants.length })}
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
                        const isSortable = header.sortable;
                        const isCurrentSort = sortKey === header.key;
                        return (
                          <TableHeader
                            key={key}
                            {...headerProps}
                            onClick={
                              isSortable
                                ? () => handleSort(header.key as SortKey)
                                : undefined
                            }
                            style={{
                              cursor: isSortable ? "pointer" : "default",
                              userSelect: isSortable ? "none" : undefined,
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              {header.header}
                              {isSortable &&
                                isCurrentSort &&
                                (sortDirection === "asc" ? (
                                  <ArrowUp size={14} />
                                ) : (
                                  <ArrowDown size={14} />
                                ))}
                            </span>
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
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: "1rem",
                                color:
                                  p.score > 0
                                    ? "var(--cds-support-success)"
                                    : "var(--cds-text-secondary)",
                              }}
                            >
                              {p.score}
                            </span>
                          </TableCell>
                          <TableCell>
                            {new Date(p.joinedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {p.examStatus === "locked" && (
                                <Tag type="red" size="sm">
                                  {t("examStatus.locked", "已鎖定")}
                                </Tag>
                              )}
                              {p.examStatus === "locked_takeover" && (
                                <Tag type="red" size="sm">
                                  {t("examStatus.locked_takeover", "接管鎖定")}
                                </Tag>
                              )}
                              {p.examStatus === "submitted" && (
                                <Tag type="green" size="sm">
                                  {t("examStatus.submitted", "已交卷")}
                                </Tag>
                              )}
                              {p.examStatus === "in_progress" && (
                                <Tag type="blue" size="sm">
                                  {t("examStatus.in_progress", "進行中")}
                                </Tag>
                              )}
                              {p.examStatus === "paused" && (
                                <Tag type="warm-gray" size="sm">
                                  {t("examStatus.paused", "已暫停")}
                                </Tag>
                              )}
                              {(p.examStatus === "not_started" ||
                                !p.examStatus) && (
                                <Tag type="cool-gray" size="sm">
                                  {t("examStatus.not_started", "未開始")}
                                </Tag>
                              )}
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
                                  iconDescription={t("participants.actions.unlock", "解除鎖定")}
                                  hasIconOnly
                                  onClick={() => handleUnlock(Number(p.userId))}
                                />
                              )}
                              {p.examStatus === "locked_takeover" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Unlocked}
                                  iconDescription="核可接管"
                                  hasIconOnly
                                  onClick={() => handleTakeoverApprove(Number(p.userId))}
                                />
                              )}
                              {p.examStatus === "submitted" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Restart}
                                  iconDescription={t("participants.actions.reopen", "重新開放考試")}
                                  hasIconOnly
                                  onClick={() =>
                                    handleReopenExam(Number(p.userId))
                                  }
                                />
                              )}
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={View}
                                iconDescription="檢視監控影片"
                                hasIconOnly
                                onClick={() => {
                                  setVideoTargetUserId(String(p.userId));
                                  setVideoModalOpen(true);
                                }}
                              />
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Download}
                                iconDescription={t("participants.actions.download", "下載報告")}
                                hasIconOnly
                                onClick={() =>
                                  handleDownloadReport(
                                    Number(p.userId),
                                    p.username,
                                  )
                                }
                              />
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                iconDescription={t("participants.actions.edit", "編輯狀態")}
                                hasIconOnly
                                onClick={() => openEditModal(p)}
                              />
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                iconDescription={t("participants.actions.remove", "移除參賽者")}
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
            totalItems={processedParticipants.length}
            backwardText={t("common.prevPage", "上一頁")}
            forwardText={t("common.nextPage", "下一頁")}
            itemsPerPageText={t("common.itemsPerPage", "每頁顯示")}
            page={page}
            pageSize={pageSize}
            pageSizes={[10, 20, 50, 100]}
            onChange={({ page: newPage, pageSize: newPageSize }: { page: number; pageSize: number }) => {
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
          modalHeading={t("participants.editModal.heading", { name: editingParticipant?.username })}
          primaryButtonText={saving ? t("common.saving", "儲存中...") : t("participants.editModal.save", "儲存變更")}
          secondaryButtonText={t("common.cancel", "取消")}
          onRequestSubmit={handleUpdateParticipant}
          onRequestClose={() => setEditModalOpen(false)}
          primaryButtonDisabled={saving}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <Dropdown
              id="exam-status"
              titleText={t("participants.editModal.examStatus", "考試狀態")}
              label={t("participants.editModal.selectStatus", "選擇狀態")}
              items={examStatusOptions}
              itemToString={(item) => item?.label || ""}
              selectedItem={examStatusOptions.find(
                (opt) => opt.id === editExamStatus
              )}
              onChange={({ selectedItem }) =>
                setEditExamStatus(
                  ((selectedItem?.id as ExamStatusType | undefined) ??
                    "not_started") as ExamStatusType
                )
              }
            />

            {editExamStatus === "locked" && (
              <TextArea
                id="lock-reason"
                labelText={t("participants.editModal.lockReason", "鎖定原因")}
                value={editLockReason}
                onChange={(e) => setEditLockReason(e.target.value)}
              />
            )}
          </div>
        </Modal>
        <ExamVideoReviewModal
          contestId={contestId}
          open={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          userIdFilter={videoTargetUserId}
          canDelete={canDeleteExamVideos}
        />
      </div>
      <ConfirmModal {...modalProps} />
    </SurfaceSection>
  );
};

export default ContestParticipantsScreen;
