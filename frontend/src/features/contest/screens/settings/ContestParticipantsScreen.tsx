import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  InlineNotification,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import type {
  ContestParticipant,
  ExamStatusType,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContestAdmin } from "@/features/contest/contexts";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { AddParticipantModal } from "@/features/contest/components/modals/AddParticipantModal";
import {
  addContestParticipant,
  approveTakeover,
  downloadParticipantReport,
  removeParticipant,
  reopenExam,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

import ParticipantDashboardPane from "@/features/contest/components/participants/ParticipantDashboardPane";
import ParticipantsListPane from "@/features/contest/components/participants/ParticipantsListPane";
import ParticipantsMobileSelector from "@/features/contest/components/participants/ParticipantsMobileSelector";
import ParticipantStatusEditModal from "@/features/contest/components/participants/ParticipantStatusEditModal";
import useParticipantDashboard from "./participants/useParticipantDashboard";
import {
  DETAIL_OPTIONS_BY_TYPE,
  EXAM_STATUS_KEYS,
  getParticipantDisplayName,
  type SortKey,
  STATUS_TAG_TYPE,
} from "./participants/participantsScreen.config";
import styles from "@/features/contest/components/participants/ContestParticipantsDashboard.module.scss";

const ContestParticipantsScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { t } = useTranslation("contest");
  const { participants, isRefreshing, refreshAdminData } = useContestAdmin();
  const { contest } = useContest();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, modalProps } = useConfirmModal();

  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] = useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);

  const searchQuery = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "all";
  const sortKey = (searchParams.get("sort") as SortKey) || "score_desc";
  const selectedUserId = searchParams.get("user");
  const detail = (searchParams.get("detail") as ParticipantDashboardDetail) || "overview";

  const { data: dashboard, loading: dashboardLoading, error: dashboardError, refresh: refreshDashboard } =
    useParticipantDashboard(contestId, selectedUserId);

  const canDeleteExamVideos = useMemo(() => {
    if (!contest || !user) return false;
    if (contest.permissions?.canDeleteContest) return true;
    return Boolean(contest.ownerUsername && user.username === contest.ownerUsername);
  }, [contest, user]);

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
      { id: "score_desc", label: t("participantsDashboard.sort.scoreDesc", "分數高到低") },
      { id: "joined_desc", label: t("participantsDashboard.sort.joinedDesc", "加入時間新到舊") },
      { id: "violations_desc", label: t("participantsDashboard.sort.violationsDesc", "違規次數高到低") },
      { id: "name_asc", label: t("participantsDashboard.sort.nameAsc", "姓名 A-Z") },
    ],
    [t],
  );

  const processedParticipants = useMemo(() => {
    let rows = [...participants];
    if (statusFilter !== "all") {
      rows = rows.filter((participant) => participant.examStatus === statusFilter);
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
          return new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime();
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

  /** The currently selected participant object (from unfiltered list) */
  const selectedParticipant = useMemo(
    () => participants.find((p) => p.userId === selectedUserId),
    [participants, selectedUserId],
  );

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
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
    }, { replace: true });
  }, [setSearchParams]);

  // Auto-select first participant + validate selected user / detail
  useEffect(() => {
    if (!selectedUserId) {
      // Auto-select the first participant when data is ready
      if (processedParticipants.length > 0 && !isRefreshing) {
        updateParams({ user: processedParticipants[0].userId, detail: "overview" });
      } else if (searchParams.has("detail")) {
        updateParams({ detail: null });
      }
      return;
    }

    const selectedExists = participants.some((participant) => participant.userId === selectedUserId);
    if (!dashboardLoading && !selectedExists) {
      updateParams({ user: null, detail: null });
      return;
    }

    const contestType = dashboard?.contestType ?? contest?.contestType;
    if (!contestType) return;

    const allowedDetails = DETAIL_OPTIONS_BY_TYPE[contestType];
    if (!allowedDetails.includes(detail)) {
      updateParams({ detail: "overview" });
    }
  }, [
    contest?.contestType,
    dashboard?.contestType,
    dashboardLoading,
    detail,
    isRefreshing,
    participants,
    processedParticipants,
    searchParams,
    selectedUserId,
    updateParams,
  ]);

  const refreshBoth = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      await Promise.all([refreshAdminData(), refreshDashboard()]);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [refreshAdminData, refreshDashboard]);

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

  const handleDownloadReport = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    try {
      await downloadParticipantReport(contestId, selectedUserId);
      setNotification({
        kind: "success",
        message: t("participants.reportDownloaded", { name: dashboard.participant.username }),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.downloadFailed", "下載報告失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleUnlock = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, Number(selectedUserId));
      await refreshBoth();
      setNotification({ kind: "success", message: t("participants.unlocked", "已解除鎖定") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.unlockFailed", "解除鎖定失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleApproveTakeover = async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participantsDashboard.confirmTakeover", "確定要核可此學生的裝置接管嗎？"),
      confirmLabel: t("participantsDashboard.approveTakeover", "核可裝置接管"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await approveTakeover(contestId, Number(selectedUserId));
      await refreshBoth();
      setNotification({ kind: "success", message: t("participantsDashboard.takeoverApproved", "已核可裝置接管") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("participantsDashboard.takeoverApproveFailed", "核可裝置接管失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleReopenExam = async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmReopen", "確定要重新開放此學生考試嗎？"),
      confirmLabel: t("participants.reopen", "重新開放"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, Number(selectedUserId));
      await refreshBoth();
      setNotification({ kind: "success", message: t("participants.reopened", "已重新開放考試") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.reopenFailed", "重新開放失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleRemoveParticipant = async () => {
    if (!contestId || !selectedUserId || !dashboard) return;
    const confirmed = await confirm({
      title: t("participants.confirmRemove", { name: dashboard.participant.username }),
      confirmLabel: t("participants.remove", "移除"),
      cancelLabel: t("common.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, Number(selectedUserId));
      await refreshAdminData();
      updateParams({ user: null, detail: null });
      setNotification({ kind: "success", message: t("participants.removed", "參賽者已移除") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.removeFailed", "移除參賽者失敗");
      setNotification({ kind: "error", message });
    }
  };

  const handleRefreshParticipants = async () => {
    setIsManualRefreshing(true);
    try {
      await refreshBoth();
    } finally {
      setIsManualRefreshing(false);
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
        lock_reason: editExamStatus === "locked" || editExamStatus === "locked_takeover" ? editLockReason : "",
      });
      setEditModalOpen(false);
      await refreshBoth();
      setNotification({ kind: "success", message: t("participants.statusUpdated", "參賽者狀態已更新") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("participants.updateFailed", "更新失敗");
      setNotification({ kind: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const listPaneProps = {
    participants: processedParticipants,
    selectedUserId,
    loading: isRefreshing,
    searchQuery,
    statusFilter,
    statusOptions,
    sortKey,
    sortOptions,
    totalItems: participants.length,
    onSearchChange: (value: string) => updateParams({ q: value || null }),
    onStatusFilterChange: (value: string) => updateParams({ status: value === "all" ? null : value }),
    onSortChange: (value: string) => updateParams({ sort: value === "score_desc" ? null : value }),
    onAddParticipant: () => setAddModalOpen(true),
    onRefreshParticipants: () => void handleRefreshParticipants(),
    isRefreshingParticipants: isManualRefreshing || isRefreshing,
  };

  const selectedDisplayName = getParticipantDisplayName(selectedParticipant);

  const selectedStatusTag = selectedParticipant?.examStatus
    ? (STATUS_TAG_TYPE[selectedParticipant.examStatus] || "cool-gray")
    : null;

  return (
    <>
      <div className={styles.root}>
        <ParticipantsMobileSelector
          drawerOpen={drawerOpen}
          selectedDisplayName={selectedDisplayName}
          selectedParticipant={selectedParticipant}
          selectedStatusTag={selectedStatusTag}
          selectedStatusLabel={
            selectedParticipant?.examStatus
              ? t(`examStatus.${selectedParticipant.examStatus}`, selectedParticipant.examStatus)
              : null
          }
          selectParticipantLabel={t("participants.selectParticipant", "選擇參賽者")}
          listPaneProps={listPaneProps}
          onOpenDrawer={() => setDrawerOpen(true)}
          onCloseDrawer={() => setDrawerOpen(false)}
          onSelectUser={(userId) => updateParams({ user: userId, detail: detail || "overview" })}
        />

        <div className={styles.listCol}>
          <ParticipantsListPane
            {...listPaneProps}
            onSelect={(userId) => updateParams({ user: userId, detail: detail || "overview" })}
          />
        </div>

        <ParticipantDashboardPane
          contestId={contestId}
          dashboard={dashboard}
          loading={dashboardLoading}
          error={dashboardError}
          activeDetail={detail}
          onDetailChange={(nextDetail) => updateParams({ detail: nextDetail })}
          onDownloadReport={handleDownloadReport}
          onEditStatus={openEditModal}
          onUnlock={handleUnlock}
          onApproveTakeover={handleApproveTakeover}
          onReopenExam={handleReopenExam}
          onRemoveParticipant={handleRemoveParticipant}
          canDeleteExamVideos={canDeleteExamVideos}
          onOpenGrading={() => updateParams({ panel: "grading" })}
          onRefreshEvents={refreshBoth}
        />
      </div>

      {notification ? (
        <InlineNotification
          lowContrast
          kind={notification.kind}
          title={notification.kind === "success" ? t("common.success", "成功") : t("common.error", "錯誤")}
          subtitle={notification.message}
          onCloseButtonClick={() => setNotification(null)}
        />
      ) : null}

      <AddParticipantModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddParticipant}
      />

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
