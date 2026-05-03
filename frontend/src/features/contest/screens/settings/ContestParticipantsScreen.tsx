import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button, FluidDropdown, TableToolbarSearch } from "@carbon/react";
import {
  Add,
  Close,
  DocumentExport,
  Search,
  UserMultiple,
} from "@carbon/icons-react";
import { FilterPopover } from "@/shared/ui/filter/FilterPopover";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import { useTranslation } from "react-i18next";

import type {
  ContestParticipant,
  ExamStatusType,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import {
  useAdminPanelRefresh,
  useContestAdmin,
} from "@/features/contest/contexts";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { AddParticipantModal } from "@/features/contest/components/modals/AddParticipantModal";
import {
  addContestParticipant,
  downloadParticipantReport,
  exportContestResults,
  removeParticipant,
  reopenExam,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts/ToastContext";
import { useMediaQuery } from "@/shared/hooks";

import ParticipantDashboardPane from "@/features/contest/components/participants/ParticipantDashboardPane";
import ParticipantOperationsPane from "@/features/contest/components/participants/ParticipantOperationsPane";
import ParticipantsListPane from "@/features/contest/components/participants/ParticipantsListPane";
import ParticipantStatusEditModal from "@/features/contest/components/participants/ParticipantStatusEditModal";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import useParticipantDashboard from "./participants/useParticipantDashboard";
import {
  DETAIL_OPTIONS_BY_TYPE,
  EXAM_STATUS_KEYS,
  type SortKey,
} from "./participants/participantsScreen.config";
import styles from "@/features/contest/components/participants/ContestParticipantsDashboard.module.scss";

const PARTICIPANT_STATUS_REFRESH_MS = 10000;

const ContestParticipantsScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { t } = useTranslation("contest");
  const { participants, isRefreshing, refreshAdminData, refreshParticipants } =
    useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const { contest } = useContest();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, modalProps } = useConfirmModal();
  const { showToast } = useToast();
  const isCompactLayout = useMediaQuery("(max-width: 900px)");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] =
    useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] =
    useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // filterOpen state removed — FilterPopover manages its own open/close
  const refreshInFlightRef = useRef(false);

  const searchQuery = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "all";
  const sortKey = (searchParams.get("sort") as SortKey) || "score_desc";
  const selectedUserId = searchParams.get("user");
  const detailParam = searchParams.get("detail");
  const detail =
    detailParam && detailParam !== "overview"
      ? (detailParam as ParticipantDashboardDetail)
      : null;
  const activeDetail = detail ?? "report";

  useEffect(() => {
    setRosterOpen(!isCompactLayout);
  }, [isCompactLayout]);

  const {
    data: dashboard,
    loading: dashboardLoading,
    error: dashboardError,
    refresh: refreshDashboard,
  } = useParticipantDashboard(contestId, selectedUserId);

  const rosterManagedByClassroom = Boolean(contest?.isClassroomBound);

  const statusOptions = useMemo(
    () => [
      { id: "all", label: t("participantsAdmin.allStatus", "全部狀態") },
      ...EXAM_STATUS_KEYS.map((id) => ({
        id,
        label: t(`examStatus.${id}`, id),
      })),
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { id: "score_desc", label: t("dashboard.sort.scoreDesc", "分數高到低") },
      {
        id: "joined_desc",
        label: t("dashboard.sort.joinedDesc", "加入時間新到舊"),
      },
      {
        id: "violations_desc",
        label: t("dashboard.sort.violationsDesc", "違規次數高到低"),
      },
      { id: "name_asc", label: t("dashboard.sort.nameAsc", "姓名 A-Z") },
    ],
    [t],
  );
  type Option = { id: string; label: string };
  const hasActiveFilters = useMemo(
    () =>
      searchQuery.trim().length > 0 ||
      statusFilter !== "all" ||
      sortKey !== "score_desc",
    [searchQuery, statusFilter, sortKey],
  );

  const processedParticipants = useMemo(() => {
    let rows = [...participants];
    if (statusFilter !== "all") {
      rows = rows.filter(
        (participant) => participant.examStatus === statusFilter,
      );
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      rows = rows.filter((participant) => {
        const haystacks = [
          participant.username,
          participant.userDisplayName,
          participant.nickname,
          participant.displayName,
          participant.email,
          participant.lockReason,
          participant.submitReason,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return haystacks.some((value) => value.includes(normalizedQuery));
      });
    }

    rows.sort((left, right) => {
      switch (sortKey) {
        case "joined_desc":
          return (
            new Date(right.joinedAt).getTime() -
            new Date(left.joinedAt).getTime()
          );
        case "violations_desc":
          return right.violationCount - left.violationCount;
        case "name_asc":
          return (
            left.userDisplayName ||
            left.displayName ||
            left.nickname ||
            left.username
          ).localeCompare(
            right.userDisplayName ||
              right.displayName ||
              right.nickname ||
              right.username,
          );
        case "score_desc":
        default:
          return right.score - left.score;
      }
    });

    return rows;
  }, [participants, searchQuery, statusFilter, sortKey]);

  const selectedParticipant = useMemo(
    () =>
      selectedUserId
        ? participants.find(
            (participant) => participant.userId === selectedUserId,
          )
        : null,
    [participants, selectedUserId],
  );

  const liveDashboard = useMemo(() => {
    if (!dashboard || !selectedParticipant) return dashboard;
    return {
      ...dashboard,
      participant: {
        ...dashboard.participant,
        ...selectedParticipant,
        startedAt: dashboard.participant.startedAt,
        leftAt: dashboard.participant.leftAt,
        lockedAt: dashboard.participant.lockedAt,
      },
    };
  }, [dashboard, selectedParticipant]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let hasChanges = false;

          Object.entries(updates).forEach(([key, value]) => {
            const current = next.get(key);
            if (value === null || value === undefined) {
              if (current !== null) {
                next.delete(key);
                hasChanges = true;
              }
              return;
            }

            if (current !== value) {
              next.set(key, value);
              hasChanges = true;
            }
          });

          return hasChanges ? next : prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Validate selected user / detail without forcing a default selection.
  useEffect(() => {
    if (!selectedUserId) {
      if (searchParams.has("detail")) {
        updateParams({ detail: null });
      }
      return;
    }

    if (detailParam === "overview") {
      updateParams({ detail: null });
      return;
    }

    const selectedExists = participants.some(
      (participant) => participant.userId === selectedUserId,
    );
    if (!dashboardLoading && !selectedExists) {
      updateParams({ user: null, detail: null });
      return;
    }

    const contestType = dashboard?.contestType ?? contest?.contestType;
    if (!contestType || !detail) return;

    const allowedDetails = DETAIL_OPTIONS_BY_TYPE[contestType];
    if (!allowedDetails.includes(detail)) {
      updateParams({ detail: null });
    }
  }, [
    contest?.contestType,
    dashboard?.contestType,
    dashboardLoading,
    detail,
    detailParam,
    participants,
    searchParams,
    selectedUserId,
    updateParams,
  ]);

  useEffect(() => {
    if (selectedUserId || processedParticipants.length === 0) return;
    updateParams({ user: processedParticipants[0].userId });
  }, [processedParticipants, selectedUserId, updateParams]);

  const refreshBoth = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      await Promise.all([refreshAdminData(), refreshDashboard()]);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [refreshAdminData, refreshDashboard]);

  useEffect(() => {
    return registerPanelRefresh("participants", async () => {
      await refreshBoth();
    });
  }, [refreshBoth, registerPanelRefresh]);

  useEffect(() => {
    if (!contestId) return;

    const refreshLiveStatuses = async () => {
      if (document.visibilityState !== "visible") return;
      if (refreshInFlightRef.current) return;

      refreshInFlightRef.current = true;
      try {
        await refreshParticipants();
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshLiveStatuses();
    }, PARTICIPANT_STATUS_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshLiveStatuses();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [contestId, refreshParticipants]);

  const handleAddParticipant = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestParticipant(contestId, username);
      await refreshAdminData();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.added", "參賽者已新增"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.addFailed", "新增參賽者失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
      throw error;
    }
  };

  const handleExportResults = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("participants.confirmExport", "確定要匯出參賽者競賽資料？"),
      confirmLabel: t("settings.exportCSV", "匯出 CSV"),
      cancelLabel: t("button.cancel", "取消"),
    });
    if (!confirmed) return;
    try {
      await exportContestResults(contestId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.exportFailed", "匯出失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  };

  const handleDownloadReport = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    try {
      await downloadParticipantReport(contestId, selectedUserId);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reportDownloaded", {
          name: dashboard.participant.username,
        }),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.downloadFailed", "下載報告失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  };

  const handleUnlock = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, Number(selectedUserId));
      await refreshBoth();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.unlocked", "已解除鎖定"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.unlockFailed", "解除鎖定失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  };

  const handleReopenExam = async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmReopen", "確定要重新開放此學生考試嗎？"),
      confirmLabel: t("participants.reopen", "重新開放"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, Number(selectedUserId));
      await refreshBoth();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reopened", "已重新開放考試"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.reopenFailed", "重新開放失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  };

  const handleRemoveParticipant = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    const confirmed = await confirm({
      title: t("participants.confirmRemove", {
        name: dashboard.participant.username,
      }),
      confirmLabel: t("participants.remove", "移除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, Number(selectedUserId));
      await refreshAdminData();
      updateParams({ user: null, detail: null });
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.removed", "參賽者已移除"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.removeFailed", "移除參賽者失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  };

  const openEditModal = () => {
    if (!dashboard) return;
    setEditingParticipant(dashboard.participant);
    setEditExamStatus(dashboard.participant.examStatus || "not_started");
    setEditLockReason(dashboard.participant.lockReason || "");
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
      await refreshBoth();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.statusUpdated", "參賽者狀態已更新"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.updateFailed", "更新失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSearchChange = useCallback(
    (event: "" | ChangeEvent<HTMLInputElement>) => {
      if (event === "") {
        updateParams({ q: null });
        return;
      }
      updateParams({ q: event.target.value || null });
    },
    [updateParams],
  );

  const listPaneProps = {
    participants: processedParticipants,
    totalItems: participants.length,
    selectedUserId,
    loading: isRefreshing,
  };

  const participantToolbarActions = (
    <>
      <div className={styles.toolbarSearchDesktop}>
        <TableToolbarSearch
          id="participants-toolbar-search"
          labelText={t("participants.searchLabel", "搜尋參賽者")}
          placeholder={t(
            "participants.searchPlaceholder",
            "搜尋姓名或使用者 ID...",
          )}
          value={searchQuery}
          onChange={handleSearchChange}
          persistent
          size="md"
        />
      </div>
      <div className={styles.toolbarSearchMobile}>
        {mobileSearchOpen || searchQuery ? (
          <TableToolbarSearch
            id="participants-toolbar-search-mobile"
            labelText={t("participants.searchLabel", "搜尋參賽者")}
            placeholder={t("participants.searchMobilePlaceholder", "搜尋")}
            value={searchQuery}
            onChange={handleSearchChange}
            onBlur={() => {
              if (!searchQuery) setMobileSearchOpen(false);
            }}
            expanded
            persistent
            autoFocus
            size="md"
          />
        ) : (
          <Button
            kind="ghost"
            size="md"
            renderIcon={Search}
            iconDescription={t("participants.searchLabel", "搜尋參賽者")}
            hasIconOnly
            onClick={() => setMobileSearchOpen(true)}
          />
        )}
      </div>
      <FilterPopover
        hasActiveFilters={hasActiveFilters}
        triggerLabel={t("participants.filters", "篩選")}
        onReset={() => updateParams({ q: null, status: null, sort: null })}
      >
        <FluidDropdown
          id="participants-toolbar-status"
          titleText={t("participants.selectStatus", "狀態")}
          label={t("participants.selectStatus", "狀態")}
          items={statusOptions}
          itemToString={(item) => (item as Option | null)?.label ?? ""}
          selectedItem={
            statusOptions.find((item) => item.id === statusFilter) ?? null
          }
          onChange={({ selectedItem }) =>
            updateParams({
              status:
                (selectedItem as Option | null)?.id &&
                (selectedItem as Option).id !== "all"
                  ? (selectedItem as Option).id
                  : null,
            })
          }
        />
        <FluidDropdown
          id="participants-toolbar-sort"
          titleText={t("dashboard.sortLabel", "排序")}
          label={t("dashboard.sortLabel", "排序")}
          items={sortOptions}
          itemToString={(item) => (item as Option | null)?.label ?? ""}
          selectedItem={sortOptions.find((item) => item.id === sortKey) ?? null}
          onChange={({ selectedItem }) =>
            updateParams({
              sort:
                (selectedItem as Option | null)?.id &&
                (selectedItem as Option).id !== "score_desc"
                  ? (selectedItem as Option).id
                  : null,
            })
          }
        />
      </FilterPopover>
      <Button
        kind="ghost"
        size="lg"
        data-testid="participants-toolbar-export-btn"
        renderIcon={DocumentExport}
        iconDescription={t("settings.exportCSV", "匯出 CSV")}
        onClick={() => void handleExportResults()}
        hasIconOnly
      />
      {!rosterManagedByClassroom ? (
        <Button
          kind="primary"
          size="lg"
          data-testid="participants-toolbar-add-btn"
          renderIcon={Add}
          onClick={() => setAddModalOpen(true)}
        >
          {t("participants.add", "新增參賽者")}
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      <div className={styles.page}>
        <AdminSplitLayout
          className={styles.inspectorLayout}
          toolbar={
            <PanelToolbar
              leftActions={
                <Button
                  kind={rosterOpen ? "primary" : "ghost"}
                  size="md"
                  renderIcon={UserMultiple}
                  iconDescription={t(
                    rosterOpen
                      ? "participants.closeRoster"
                      : "participants.openRoster",
                    rosterOpen ? "關閉參賽者列表" : "開啟參賽者列表",
                  )}
                  hasIconOnly
                  onClick={() => setRosterOpen((open) => !open)}
                />
              }
              title={t("participants.viewTitle", "檢視參與者")}
              actions={
                <>
                  {participantToolbarActions}
                  {detail ? (
                    <Button
                      kind="ghost"
                      size="md"
                      renderIcon={Close}
                      iconDescription={t(
                        "participants.closeDetail",
                        "關閉詳細",
                      )}
                      hasIconOnly
                      onClick={() => updateParams({ detail: null })}
                    />
                  ) : null}
                </>
              }
            />
          }
          sidebar={
            <ParticipantsListPane
              {...listPaneProps}
              onSelect={(userId) => {
                if (isCompactLayout) setRosterOpen(false);
                updateParams({
                  user: userId,
                });
              }}
            />
          }
          sidebarWidth={320}
          rightPane={
            selectedUserId ? (
              <div
                className={styles.detailCol}
                aria-label={t("participants.detailPanel", "參賽者詳細資料")}
              >
                {detail ? (
                  <ParticipantDashboardPane
                    contestId={contestId}
                    dashboard={liveDashboard}
                    loading={dashboardLoading}
                    error={dashboardError}
                    activeDetail={activeDetail}
                    hideOverviewTab
                    onDetailChange={(nextDetail) =>
                      updateParams({ detail: nextDetail })
                    }
                    onDownloadReport={handleDownloadReport}
                    onEditStatus={openEditModal}
                    onUnlock={handleUnlock}
                    onReopenExam={handleReopenExam}
                    onRemoveParticipant={
                      rosterManagedByClassroom
                        ? undefined
                        : handleRemoveParticipant
                    }
                    onOpenGrading={() => updateParams({ panel: "grading" })}
                    onRefreshEvents={refreshBoth}
                  />
                ) : null}
              </div>
            ) : undefined
          }
          rightPaneWidth={480}
          contentMaxWidth={820}
          contentClassName={styles.operationsContent}
          mobileSidebarOpen={rosterOpen}
          mobileDetailOpen={Boolean(selectedUserId && detail)}
        >
          <ParticipantOperationsPane
            dashboard={liveDashboard}
            loading={dashboardLoading}
            error={dashboardError}
            onDownloadReport={handleDownloadReport}
            onEditStatus={openEditModal}
            onUnlock={handleUnlock}
            onReopenExam={handleReopenExam}
            onRemoveParticipant={
              rosterManagedByClassroom ? undefined : handleRemoveParticipant
            }
            onOpenDetail={(nextDetail) => updateParams({ detail: nextDetail })}
            onOpenGrading={() => updateParams({ panel: "grading" })}
            onOpenProctoring={() =>
              updateParams({ panel: "proctoring", user: selectedUserId })
            }
            showViolationKpi={Boolean(contest?.cheatDetectionEnabled)}
          />
        </AdminSplitLayout>
      </div>

      {!rosterManagedByClassroom ? (
        <AddParticipantModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddParticipant}
        />
      ) : null}

      <ParticipantStatusEditModal
        open={editModalOpen}
        saving={saving}
        participantUsername={editingParticipant?.username}
        examStatus={editExamStatus}
        lockReason={editLockReason}
        onClose={() => setEditModalOpen(false)}
        onSubmit={() => {
          void handleUpdateParticipant();
        }}
        onExamStatusChange={setEditExamStatus}
        onLockReasonChange={setEditLockReason}
      />

      <ConfirmModal {...modalProps} />
    </>
  );
};

export default ContestParticipantsScreen;
