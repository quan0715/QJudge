import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import OverviewActionWidgets from "@/features/contest/components/admin/OverviewActionWidgets";
import StudentStatusBreakdown from "@/features/contest/components/admin/StudentStatusBreakdown";
import {
  useContest,
  useContestAdmin,
  useAdminPanelRefresh,
} from "@/features/contest/contexts";
import type { AdminPanelId } from "@/features/contest/modules/types";
import { updateContest } from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { computeParticipantStatusKpi } from "../participantStatusKpi";
import { useGradingData } from "@/features/contest/screens/settings/grading";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import styles from "./AdminOverviewScreen.module.scss";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";

export default function AdminOverviewScreen() {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const { contest, refreshContest } = useContest();
  const {
    participants,
    examEvents,
    initialLoading,
    refreshAllAdminData,
  } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const { showToast } = useToast();
  const { confirm, modalProps } = useConfirmModal();
  const [, setSearchParams] = useSearchParams();

  const kpi = useMemo(
    () => computeParticipantStatusKpi(participants),
    [participants],
  );
  const { globalStats } = useGradingData();
  const violationCount = useMemo(
    () =>
      examEvents.filter(
        (event) =>
          event.eventType !== "heartbeat" && getEventPriority(event.eventType) === 1,
      ).length,
    [examEvents],
  );

  const openPanel = useCallback(
    (panel: AdminPanelId) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", panel);
        return next;
      });
    },
    [setSearchParams],
  );

  const handlePublishContest = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: t("adminOverview.actions.publishContestConfirm"),
      body: t("adminOverview.actions.publishContestBody"),
      confirmLabel: t("adminOverview.actions.publishContest"),
      cancelLabel: tc("button.cancel"),
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { status: "published" });
      await refreshContest();
      showToast({ kind: "success", title: t("adminOverview.actions.publishContestSuccess") });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishContestFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast, t, tc]);

  const handlePublishResults = useCallback(async (progressPercent?: number) => {
    if (!contest?.id) return;
    const isIncomplete = typeof progressPercent === "number" && progressPercent < 100;
    const confirmed = await confirm({
      title: t("adminOverview.actions.publishResultsConfirm"),
      body: isIncomplete ? (
        <>
          <p>{t("adminOverview.actions.publishResultsBody")}</p>
          <p style={{ marginTop: "0.75rem", color: "var(--cds-support-warning)" }}>
            {t("adminOverview.actions.publishResultsWarning", { progress: progressPercent })}
          </p>
          <button
            type="button"
            onClick={() => openPanel("grading")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginTop: "0.5rem",
              color: "var(--cds-link-primary)",
              fontSize: "0.875rem",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {t("adminOverview.actions.goToGrading", "前往批改面板")}
          </button>
        </>
      ) : t("adminOverview.actions.publishResultsBody"),
      confirmLabel: t("adminOverview.actions.publishResults"),
      cancelLabel: tc("button.cancel"),
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { resultsPublished: true });
      await refreshContest();
      showToast({ kind: "success", title: t("adminOverview.actions.publishResultsSuccess") });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.publishResultsFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast, t, tc]);

  const handleRevertContestToDraft = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: t("adminOverview.actions.revertToDraftConfirm"),
      body: t("adminOverview.actions.revertToDraftBody"),
      confirmLabel: t("adminOverview.actions.revertToDraft"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { status: "draft" });
      await refreshContest();
      showToast({ kind: "success", title: t("adminOverview.actions.revertToDraftSuccess") });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.revertToDraftFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast, t, tc]);

  const handleToggleStrictMode = useCallback(async () => {
    if (!contest?.id) return;
    const nextEnabled = !contest.cheatDetectionEnabled;
    const confirmed = await confirm({
      title: nextEnabled
        ? t("adminOverview.actions.strictModeEnableConfirm")
        : t("adminOverview.actions.strictModeDisableConfirm"),
      body: nextEnabled
        ? t("adminOverview.actions.strictModeEnableBody")
        : t("adminOverview.actions.strictModeDisableBody"),
      confirmLabel: nextEnabled
        ? t("adminOverview.actions.strictModeEnable")
        : t("adminOverview.actions.strictModeDisable"),
      cancelLabel: tc("button.cancel"),
      danger: !nextEnabled,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { cheatDetectionEnabled: nextEnabled });
      await refreshContest();
      showToast({
        kind: "success",
        title: nextEnabled
          ? t("adminOverview.actions.strictModeEnableSuccess")
          : t("adminOverview.actions.strictModeDisableSuccess"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.updateFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.cheatDetectionEnabled, contest?.id, refreshContest, showToast, t, tc]);

  const handleRevokeResults = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: t("adminOverview.actions.revokeResultsConfirm"),
      body: t("adminOverview.actions.revokeResultsBody"),
      confirmLabel: t("adminOverview.actions.revokeResults"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { resultsPublished: false });
      await refreshContest();
      showToast({ kind: "success", title: t("adminOverview.actions.revokeResultsSuccess") });
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.revokeResultsFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast, t, tc]);

  useEffect(() => {
    return registerPanelRefresh("overview", async () => {
      await Promise.all([refreshAllAdminData(), refreshContest()]);
    });
  }, [refreshAllAdminData, refreshContest, registerPanelRefresh]);

  if (!contest) return null;

  return (
    <>
      <EntityOverviewFrame
        hero={
          <KpiCards
            contest={contest}
            loading={initialLoading}
            onOpenPanel={openPanel}
          />
        }
        main={
          <div className={styles.mainColumn}>
            <OverviewActionWidgets
              contest={contest}
              kpi={kpi}
              gradingStats={globalStats}
              violationCount={violationCount}
              loading={initialLoading}
              onOpenPanel={openPanel}
              onPublishContest={handlePublishContest}
              onRevertContestToDraft={handleRevertContestToDraft}
              onPublishResults={handlePublishResults}
              onRevokeResults={handleRevokeResults}
              onToggleStrictMode={handleToggleStrictMode}
            />
            <StudentStatusBreakdown kpi={kpi} loading={initialLoading} />
          </div>
        }
      />
      <ConfirmModal {...modalProps} />
    </>
  );
}
