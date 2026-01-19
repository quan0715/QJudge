import { useState, useEffect, useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
} from "@carbon/icons-react";
import { AddParticipantModal } from "../../components/modals/AddParticipantModal";
import {
  getContestParticipants,
  addContestParticipant,
  unlockParticipant,
  updateParticipant,
  removeParticipant,
  reopenExam,
  downloadParticipantReport,
} from "@/infrastructure/api/repositories";
import type {
  ContestParticipant,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

const ContestAdminParticipantsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();

  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
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

  // Exam status options for dropdown
  const examStatusOptions = [
    { id: "not_started", label: "未開始" },
    { id: "in_progress", label: "進行中" },
    { id: "paused", label: "已暫停" },
    { id: "locked", label: "已鎖定" },
    { id: "submitted", label: "已交卷" },
  ];

  // Status filter options (includes "all")
  const statusFilterOptions = [
    { id: "all", label: "全部狀態" },
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
      setNotification({ kind: "error", message: "無法載入參賽者列表" });
    }
  };

  const handleAddParticipant = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestParticipant(contestId, username);
      await loadParticipants();
      setNotification({ kind: "success", message: "參賽者已新增" });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || "新增參賽者失敗",
      });
      throw error; // Propagate to modal
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: "確定要解除此學生的鎖定嗎？",
      confirmLabel: "解除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: "已解除鎖定" });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || "解除鎖定失敗",
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
      setNotification({ kind: "success", message: "參賽者狀態已更新" });
    } catch (error: any) {
      setNotification({ kind: "error", message: error.message || "更新失敗" });
    } finally {
      setSaving(false);
    }
  };

  const handleReopenExam = async (userId: number) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: "確定要重新開放此學生考試嗎？",
      confirmLabel: "重新開放",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: "已重新開放考試" });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || "重新開放失敗",
      });
    }
  };

  const handleRemoveParticipant = async (userId: number, username: string) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: `確定要移除參賽者 ${username} 嗎？`,
      confirmLabel: "移除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, userId);
      await loadParticipants();
      setNotification({ kind: "success", message: "參賽者已移除" });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || "移除參賽者失敗",
      });
    }
  };

  const handleDownloadReport = async (userId: number, username: string) => {
    if (!contestId) return;
    try {
      setNotification({
        kind: "success",
        message: `正在產生 ${username} 的報告...`,
      });
      await downloadParticipantReport(contestId, userId);
      setNotification({ kind: "success", message: `${username} 的報告已下載` });
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error.message || "下載報告失敗",
      });
    }
  };

  // Prepare table rows
  const headers = [
    { key: "username", header: "使用者", sortable: true },
    { key: "score", header: "分數", sortable: true },
    { key: "joinedAt", header: "加入時間", sortable: true },
    { key: "status", header: "狀態" },
    { key: "lockReason", header: "鎖定原因" },
    { key: "actions", header: "操作" },
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
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <ContainerCard
          title="參賽者列表"
          noPadding
          action={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Renew}
                onClick={loadParticipants}
                hasIconOnly
                iconDescription="重新整理"
              />
              <Button
                size="sm"
                renderIcon={Add}
                onClick={() => setAddModalOpen(true)}
              >
                新增
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
              labelText="搜尋參賽者"
              placeholder="搜尋姓名或使用者 ID..."
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
              titleText="篩選狀態"
              label="選擇狀態"
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
                marginLeft: "auto",
              }}
            >
              顯示 {processedParticipants.length} / {participants.length}{" "}
              位參賽者
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
                                  已鎖定
                                </Tag>
                              )}
                              {p.examStatus === "submitted" && (
                                <Tag type="green" size="sm">
                                  已交卷
                                </Tag>
                              )}
                              {p.examStatus === "in_progress" && (
                                <Tag type="blue" size="sm">
                                  進行中
                                </Tag>
                              )}
                              {p.examStatus === "paused" && (
                                <Tag type="warm-gray" size="sm">
                                  已暫停
                                </Tag>
                              )}
                              {(p.examStatus === "not_started" ||
                                !p.examStatus) && (
                                <Tag type="cool-gray" size="sm">
                                  未開始
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
                                  iconDescription="解除鎖定"
                                  hasIconOnly
                                  onClick={() => handleUnlock(Number(p.userId))}
                                />
                              )}
                              {p.examStatus === "submitted" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Restart}
                                  iconDescription="重新開放考試"
                                  hasIconOnly
                                  onClick={() =>
                                    handleReopenExam(Number(p.userId))
                                  }
                                />
                              )}
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Download}
                                iconDescription="下載報告"
                                hasIconOnly
                                onClick={() =>
                                  handleDownloadReport(
                                    Number(p.userId),
                                    p.username
                                  )
                                }
                              />
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                iconDescription="編輯狀態"
                                hasIconOnly
                                onClick={() => openEditModal(p)}
                              />
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                iconDescription="移除參賽者"
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
            backwardText="上一頁"
            forwardText="下一頁"
            itemsPerPageText="每頁顯示"
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
          modalHeading={`編輯參賽者: ${editingParticipant?.username}`}
          primaryButtonText={saving ? "儲存中..." : "儲存變更"}
          secondaryButtonText="取消"
          onRequestSubmit={handleUpdateParticipant}
          onRequestClose={() => setEditModalOpen(false)}
          primaryButtonDisabled={saving}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <Dropdown
              id="exam-status"
              titleText="考試狀態"
              label="選擇狀態"
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
                labelText="鎖定原因"
                value={editLockReason}
                onChange={(e) => setEditLockReason(e.target.value)}
              />
            )}
          </div>
        </Modal>
      </div>
      <ConfirmModal {...modalProps} />
    </SurfaceSection>
  );
};

export default ContestAdminParticipantsPage;
