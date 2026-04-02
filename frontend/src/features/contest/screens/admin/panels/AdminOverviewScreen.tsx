import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import OverviewEventSummaryPanel from "@/features/contest/components/admin/OverviewEventSummaryPanel";
import OverviewInsightsPanel from "@/features/contest/components/admin/OverviewInsightsPanel";
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

  const handlePublishResults = useCallback(async () => {
    if (!contest?.id) return;
    const confirmed = await confirm({
      title: "確定要發布成績嗎？",
      body: "發布後學生將可以查看這場競賽的成績。",
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
          <>
            <StudentStatusBreakdown kpi={kpi} loading={initialLoading} />
            <OverviewEventSummaryPanel examEvents={examEvents} loading={initialLoading} />
          </>
        }
        side={
          <OverviewInsightsPanel
            contest={contest}
            overviewMetrics={overviewMetrics}
            loading={initialLoading}
            onOpenPanel={openPanel}
          />
        }
      />
      <ConfirmModal {...modalProps} />
    </>
  );
}
