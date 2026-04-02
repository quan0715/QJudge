import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import styles from "./AdminOverviewScreen.module.scss";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";

export default function AdminOverviewScreen() {
  const { contest, refreshContest } = useContest();
  const {
    participants,
    examEvents,
    overviewMetrics,
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
      title: "確定要發布競賽嗎？",
      body: "發布後學生就可以看到這場競賽。",
      confirmLabel: "發布競賽",
      cancelLabel: "取消",
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { status: "published" });
      await refreshContest();
      showToast({ kind: "success", title: "競賽已發布" });
    } catch (error) {
      showToast({
        kind: "error",
        title: "發布失敗",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast]);

  const handlePublishResults = useCallback(async (progressPercent?: number) => {
    if (!contest?.id) return;
    const progressWarning =
      typeof progressPercent === "number" && progressPercent < 100
        ? `\n\n目前批改進度約 ${progressPercent}%，仍可發布，但建議先確認未完成批改內容。`
        : "";
    const confirmed = await confirm({
      title: "確定要發布成績嗎？",
      body: `發布後學生將可以查看這場競賽的成績。${progressWarning}`,
      confirmLabel: "發布成績",
      cancelLabel: "取消",
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { resultsPublished: true });
      await refreshContest();
      showToast({ kind: "success", title: "成績已發布" });
    } catch (error) {
      showToast({
        kind: "error",
        title: "發布失敗",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast]);

  const handleRevertContestToDraft = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: "確定要退回草稿嗎？",
      body: "退回草稿後學生將無法再進入本競賽。",
      confirmLabel: "退回草稿",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { status: "draft" });
      await refreshContest();
      showToast({ kind: "success", title: "已退回草稿" });
    } catch (error) {
      showToast({
        kind: "error",
        title: "退回失敗",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast]);

  const handleToggleStrictMode = useCallback(async () => {
    if (!contest?.id) return;
    const nextEnabled = !contest.cheatDetectionEnabled;
    const confirmed = await confirm({
      title: nextEnabled ? "確定要啟用嚴格考試模式嗎？" : "確定要停用嚴格考試模式嗎？",
      body: nextEnabled
        ? "啟用後會套用監控與防作弊限制。"
        : "停用後將關閉嚴格監控與限制。",
      confirmLabel: nextEnabled ? "啟用模式" : "停用模式",
      cancelLabel: "取消",
      danger: !nextEnabled,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { cheatDetectionEnabled: nextEnabled });
      await refreshContest();
      showToast({
        kind: "success",
        title: nextEnabled ? "已啟用嚴格考試模式" : "已停用嚴格考試模式",
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: "更新失敗",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.cheatDetectionEnabled, contest?.id, refreshContest, showToast]);

  const handleRevokeResults = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: "確定要撤回已發布的成績嗎？",
      body: "撤回後學生將無法再查看成績。",
      confirmLabel: "撤回發布",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await updateContest(contest.id, { resultsPublished: false });
      await refreshContest();
      showToast({ kind: "success", title: "已撤回成績發布" });
    } catch (error) {
      showToast({
        kind: "error",
        title: "撤回失敗",
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  }, [confirm, contest?.id, refreshContest, showToast]);

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
            overviewMetrics={overviewMetrics}
            loading={initialLoading}
            onOpenPanel={openPanel}
            onPublishContest={handlePublishContest}
            onPublishResults={handlePublishResults}
            onRevokeResults={handleRevokeResults}
          />
        }
        main={
          <div className={styles.mainColumn}>
            <OverviewActionWidgets
              contest={contest}
              kpi={kpi}
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
