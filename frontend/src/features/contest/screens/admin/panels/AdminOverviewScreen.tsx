import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@carbon/react";
import {
  Download,
  Launch,
  QrCode,
  Renew,
  Settings,
  UserFollow,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import AdminOverviewCommandCenter from "@/features/contest/components/admin/AdminOverviewCommandCenter";
import AdminPreparationCommandCenter from "@/features/contest/components/admin/AdminPreparationCommandCenter";
import AdminExamResultOverview from "@/features/contest/components/admin/statistics/AdminExamResultOverview";
import AdminQuestionStatsGallery from "@/features/contest/components/admin/statistics/AdminQuestionStatsGallery";
import { useContestResultDashboard } from "@/features/contest/components/admin/statistics/useContestResultDashboard";
import { AddParticipantModal } from "@/features/contest/components/modals/AddParticipantModal";
import {
  useAdminPanelRefresh,
  useContest,
  useContestAdmin,
} from "@/features/contest/contexts";
import { getContestState } from "@/core/entities/contest.entity";
import type {
  AdminPanelId,
  AdminPanelProps,
  ContestSettingsSectionId,
} from "@/features/contest/modules/types";
import { useGradingData } from "@/features/contest/screens/settings/grading";
import { addContestParticipant, updateContest } from "@/infrastructure/api/repositories";
import { exportContestResults } from "@/infrastructure/api/repositories/contestExports.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import {
  buildAdminOverviewDashboard,
  buildAdminPreparationOverview,
  type DashboardText,
  type PreparationItemKey,
} from "./adminOverviewDashboard.model";
import styles from "./AdminOverviewScreen.module.scss";

export default function AdminOverviewScreen({
  onOpenSettings,
  onPreview,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const tr = useCallback<DashboardText>(
    (key, defaultValue, values) => {
      const translated = values
        ? t(key, { defaultValue, ...values })
        : t(key, defaultValue);
      if (typeof translated === "string") return translated;
      return defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
    [t],
  );
  const { showToast } = useToast();
  const { confirm, modalProps: confirmModalProps } = useConfirmModal();
  const { contest, refreshContest } = useContest();
  const {
    participants,
    examEvents,
    overviewMetrics,
    initialLoading: adminInitialLoading,
    refreshAllAdminData,
  } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const [, setSearchParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [publishingContest, setPublishingContest] = useState(false);
  const [resultRefreshKey, setResultRefreshKey] = useState(0);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const classroomBound = Boolean(contest?.isClassroomBound);

  useEffect(() => {
    const updateTime = () => setCurrentTimeMs(Date.now());
    updateTime();
    const intervalId = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const contestInProgress = useMemo(() => {
    if (!contest || contest.status !== "published") return false;
    const startMs = new Date(contest.startTime).getTime();
    const endMs = new Date(contest.endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
    return currentTimeMs >= startMs && currentTimeMs < endMs;
  }, [contest, currentTimeMs]);
  const isPreparationPhase = useMemo(() => {
    if (!contest) return false;
    if (contest.status === "draft") return true;
    if (contest.status === "archived") return false;
    return getContestState(contest, currentTimeMs) === "upcoming";
  }, [contest, currentTimeMs]);

  const handleAddParticipant = useCallback(
    async (username: string) => {
      if (!contest?.id) return;
      try {
        await addContestParticipant(contest.id, username);
        await refreshAllAdminData();
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
    },
    [contest?.id, refreshAllAdminData, showToast, t],
  );
  const { globalStats, loading: gradingLoading } = useGradingData({
    participantsOverride: participants,
    refetchOnParticipantsChange: false,
  });
  const {
    data: resultDashboard,
    loading: resultDashboardLoading,
    error: resultDashboardError,
    loadQuestionDetail: loadResultQuestionDetail,
    detailLoadingIds: resultDetailLoadingIds,
    detailErrors: resultDetailErrors,
  } = useContestResultDashboard(contest, resultRefreshKey);

  const dashboardData = useMemo(() => {
    if (!contest) return null;
    return buildAdminOverviewDashboard({
      contest,
      participants,
      examEvents,
      overviewMetrics,
      gradingStats: globalStats,
      tr,
    });
  }, [contest, participants, examEvents, overviewMetrics, globalStats, tr]);

  const preparationData = useMemo(() => {
    if (!contest || !isPreparationPhase) return null;
    return buildAdminPreparationOverview({
      contest,
      participants,
      nowMs: currentTimeMs,
      tr,
    });
  }, [contest, isPreparationPhase, participants, currentTimeMs, tr]);

  const openPanel = useCallback(
    (panel: AdminPanelId) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", contest?.contestType === "coding" && panel === "grading" ? "standings" : panel);
        return next;
      });
    },
    [setSearchParams, contest?.contestType],
  );

  const openSettings = useCallback(
    (section?: ContestSettingsSectionId) => {
      if (onOpenSettings) {
        onOpenSettings(section);
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", "settings");
        return next;
      });
    },
    [onOpenSettings, setSearchParams],
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refreshAllAdminData(), refreshContest()]);
      setResultRefreshKey((current) => current + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refreshAllAdminData, refreshContest, refreshing]);

  const handleExport = useCallback(async () => {
    if (!contest?.id || exporting) return;
    setExporting(true);
    try {
      await exportContestResults(contest.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("adminOverview.screen.exportFailed", "匯出失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setExporting(false);
    }
  }, [contest?.id, exporting, showToast, t]);

  const handleToggleResultsPublished = useCallback(async () => {
    if (!contest?.id || publishingResults) return;
    const nextPublished = !contest.resultsPublished;
    setPublishingResults(true);
    try {
      await updateContest(contest.id, { resultsPublished: nextPublished });
      await Promise.all([refreshContest(), refreshAllAdminData()]);
      setResultRefreshKey((current) => current + 1);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: nextPublished
          ? t("adminOverview.actions.publishResultsSuccess", "成績已發布")
          : t("adminOverview.actions.revokeResultsSuccess", "已撤回成績發布"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : nextPublished
            ? t("adminOverview.actions.publishResultsFailed", "發布失敗")
            : t("adminOverview.actions.revokeResultsFailed", "撤回失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setPublishingResults(false);
    }
  }, [
    contest?.id,
    contest?.resultsPublished,
    publishingResults,
    refreshAllAdminData,
    refreshContest,
    showToast,
    t,
  ]);

  const handlePublishContest = useCallback(async () => {
    if (!contest?.id || publishingContest || !preparationData) return;

    if (!preparationData.canPublish) {
      showToast({
        kind: "warning",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: t(
          "adminOverview.preparation.blockedBySchedule",
          "發布前會先請你設定考試時間",
        ),
      });
      openSettings("general");
      return;
    }

    const hasProblems = preparationData.checklist.some(
      (item) => item.key === "problems" && item.level === "done",
    );
    if (!hasProblems) {
      const confirmed = await confirm({
        title: t(
          "adminOverview.preparation.confirm.publishWithoutProblemsTitle",
          "這場競賽還沒有題目",
        ),
        body: t(
          "adminOverview.preparation.confirm.publishWithoutProblemsBody",
          "學生進場後會看到空白的題目列表。你可以先發布，稍後再補題目。",
        ),
        confirmLabel: t(
          "adminOverview.preparation.confirm.publishAnyway",
          "仍要發布",
        ),
        cancelLabel: tc("button.cancel"),
      });
      if (!confirmed) return;
    }

    setPublishingContest(true);
    try {
      await updateContest(contest.id, { status: "published" });
      await refreshContest();
      showToast({
        kind: "success",
        title: t("adminOverview.actions.publishContestSuccess", "競賽已發布"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishingContest(false);
    }
  }, [
    confirm,
    contest?.id,
    openSettings,
    preparationData,
    publishingContest,
    refreshContest,
    showToast,
    t,
    tc,
  ]);

  const handleRevertToDraft = useCallback(async () => {
    if (!contest?.id || publishingContest) return;

    const confirmed = await confirm({
      title: t(
        "adminOverview.preparation.confirm.revertToDraftTitle",
        "確定要退回草稿嗎？",
      ),
      body: t(
        "adminOverview.preparation.confirm.revertToDraftBody",
        "退回後學生會立刻看不到這場競賽。",
      ),
      confirmLabel: t("adminOverview.actions.revertToDraft", "退回草稿"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;

    setPublishingContest(true);
    try {
      await updateContest(contest.id, { status: "draft" });
      await refreshContest();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishContestFailed", "發布失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishingContest(false);
    }
  }, [
    confirm,
    contest?.id,
    publishingContest,
    refreshContest,
    showToast,
    t,
    tc,
  ]);

  const handleChecklistAction = useCallback(
    (key: PreparationItemKey) => {
      if (key === "problems") {
        openPanel("problem_editor");
        return;
      }
      openSettings("general");
    },
    [openPanel, openSettings],
  );

  useEffect(() => {
    return registerPanelRefresh("overview", handleRefresh);
  }, [handleRefresh, registerPanelRefresh]);

  if (!contest) return null;

  const contestHomePath = contest.boundClassroomId
    ? `/classrooms/${contest.boundClassroomId}/contest/${contest.id}`
    : null;
  const attendanceProjectionPath = contest.boundClassroomId
    ? `/classrooms/${contest.boundClassroomId}/contest/${contest.id}/admin/attendance/projection`
    : null;
  const openContestHome = () => {
    if (!contestHomePath) return;
    window.open(contestHomePath, "_blank", "noopener,noreferrer");
  };
  const openAttendanceProjection = () => {
    if (!attendanceProjectionPath || !contest.attendanceCheckEnabled) return;
    window.open(attendanceProjectionPath, "_blank", "noopener,noreferrer");
  };
  const openStudentPreview = () => {
    if (onPreview) {
      onPreview();
      return;
    }
    openContestHome();
  };
  const contestTypeLabel =
    contest.contestType === "paper_exam"
      ? t("adminOverview.screen.contestType.paperExam", "考卷")
      : t("adminOverview.screen.contestType.coding", "Coding Test");
  const renderContestHeader = () => (
    <section
      className={styles.overviewHeader}
      aria-label={t("adminOverview.screen.contestInfoLabel", "競賽資訊")}
    >
      <h2 className={styles.overviewHeaderTitle}>
        {t("adminOverview.screen.title", "Overview")}
      </h2>
      <div className={styles.overviewHeaderActions}>
        {
          <>
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Settings}
              iconDescription={t(
                "adminOverview.screen.actions.settings",
                "競賽設定",
              )}
              onClick={() => openSettings()}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Launch}
              iconDescription={t(
                "adminOverview.screen.actions.contestHome",
                "競賽主頁",
              )}
              disabled={!contestHomePath}
              onClick={openContestHome}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={QrCode}
              iconDescription={t(
                "adminOverview.screen.actions.attendanceProjection",
                "開啟簽到投屏",
              )}
              disabled={!attendanceProjectionPath || !contest.attendanceCheckEnabled}
              onClick={openAttendanceProjection}
            />
            {classroomBound ? null : (
              <Button
                kind="ghost"
                hasIconOnly
                renderIcon={UserFollow}
                iconDescription={t(
                  "adminOverview.screen.actions.addParticipant",
                  "新增參賽者",
                )}
                onClick={() => setAddParticipantOpen(true)}
              />
            )}
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Renew}
              iconDescription={
                refreshing
                  ? t("adminOverview.screen.actions.refreshing", "重新整理中")
                  : t("adminOverview.screen.actions.refresh", "重新整理")
              }
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Download}
              iconDescription={
                exporting
                  ? t("adminOverview.screen.actions.exporting", "匯出中")
                  : t("adminOverview.screen.actions.export", "匯出成績")
              }
              disabled={exporting || !contest.id}
              onClick={() => void handleExport()}
            />
          </>
        }
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {isPreparationPhase && preparationData ? (
          <AdminPreparationCommandCenter
            header={renderContestHeader()}
            data={preparationData}
            publishing={publishingContest}
            attendanceCheckEnabled={Boolean(contest.attendanceCheckEnabled)}
            onItemAction={handleChecklistAction}
            onPublishContest={() => void handlePublishContest()}
            onRevertToDraft={() => void handleRevertToDraft()}
            onPreviewAsStudent={openStudentPreview}
            onOpenContestHome={openContestHome}
            onOpenAttendanceProjection={openAttendanceProjection}
          />
        ) : (
          dashboardData && (
            <AdminOverviewCommandCenter
              header={renderContestHeader()}
              data={dashboardData}
              adminLoading={adminInitialLoading}
              gradingLoading={gradingLoading}
              contestId={contest.id}
              antiCheatEnabled={contest.cheatDetectionEnabled}
              classroomBound={classroomBound}
              contestInProgress={contestInProgress}
              onOpenPanel={openPanel}
              participants={participants}
              primary={null}
              overviewInfo={{
                contestTypeLabel,
              }}
              gradingAction={{
                label: contest.resultsPublished
                  ? t("adminOverview.actions.revokeResults", "撤回發布")
                  : t("adminOverview.actions.publishResults", "發布成績"),
                loadingLabel: t("action.processing", "處理中..."),
                onClick: () => void handleToggleResultsPublished(),
                disabled: !contest.id,
                loading: publishingResults,
                kind: contest.resultsPublished ? "danger--tertiary" : "primary",
              }}
              resultOverview={
                <AdminExamResultOverview
                  contest={contest}
                  dashboard={resultDashboard}
                  loading={resultDashboardLoading}
                  error={resultDashboardError}
                />
              }
              questionStatsGallery={
                <AdminQuestionStatsGallery
                  contest={contest}
                  dashboard={resultDashboard}
                  loading={resultDashboardLoading}
                  error={resultDashboardError}
                  loadQuestionDetail={loadResultQuestionDetail}
                  detailLoadingIds={resultDetailLoadingIds}
                  detailErrors={resultDetailErrors}
                />
              }
            />
          )
        )}
      </div>
      {classroomBound ? null : (
        <AddParticipantModal
          isOpen={addParticipantOpen}
          onClose={() => setAddParticipantOpen(false)}
          onSubmit={async (username) => {
            await handleAddParticipant(username);
            setAddParticipantOpen(false);
          }}
        />
      )}
      <ConfirmModal {...confirmModalProps} />
    </div>
  );
}
