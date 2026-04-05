import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal, TextInput, Tag } from "@carbon/react";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import OverviewActionWidgets from "@/features/contest/components/admin/OverviewActionWidgets";
import PublishScheduleModal from "@/features/contest/components/admin/PublishScheduleModal";
import StudentStatusBreakdown from "@/features/contest/components/admin/StudentStatusBreakdown";
import {
  useContest,
  useContestAdmin,
  useAdminPanelRefresh,
} from "@/features/contest/contexts";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { updateContest } from "@/infrastructure/api/repositories";
import type { ContestUpdatePayload } from "@/core/ports/contest.repository";
import { useToast } from "@/shared/contexts";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { computeParticipantStatusKpi } from "../participantStatusKpi";
import { useGradingData } from "@/features/contest/screens/settings/grading";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import styles from "./AdminOverviewScreen.module.scss";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";

export default function AdminOverviewScreen({
  onOpenSettings,
}: AdminPanelProps) {
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
  const [publishScheduleOpen, setPublishScheduleOpen] = useState(false);
  const [publishScheduleMode, setPublishScheduleMode] = useState<"publish" | "schedule">("publish");
  const [publishScheduleWarning, setPublishScheduleWarning] = useState("");
  const [publishScheduleSubmitting, setPublishScheduleSubmitting] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordInputError, setPasswordInputError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const kpi = useMemo(
    () => computeParticipantStatusKpi(participants),
    [participants],
  );
  const { globalStats } = useGradingData({ participantsOverride: participants });
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
  const openSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("panel", "settings");
      return next;
    });
  }, [onOpenSettings, setSearchParams]);

  const handlePublishContest = useCallback(async () => {
    if (!contest?.id) return;
    const workItemCount = contest.contestType === "paper_exam"
      ? contest.examQuestionsCount
      : contest.problems.length;
    const hasSchedule =
      Number.isFinite(Date.parse(contest.startTime ?? "")) &&
      Number.isFinite(Date.parse(contest.endTime ?? ""));
    const hasRules = (contest.rules ?? "").trim().length > 0;
    const publishSummaryConfirmed = await confirm({
      title: t("adminOverview.actions.publishContest", "發布競賽"),
      body: (
        <div className={styles.publishSummary}>
          <p className={styles.publishSummaryIntro}>
            {t("adminOverview.publishSummary.description", "請確認以下設定後再發布競賽。")}
          </p>
          <div className={styles.publishSummaryGrid}>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.problemCount", "題目數量")}</span>
              <span className={styles.publishSummaryValue}>{workItemCount}</span>
            </div>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.mode", "模式")}</span>
              <span className={styles.publishSummaryValue}>
                {contest.contestType === "paper_exam"
                  ? t("adminOverview.examType.paper_exam", "考卷")
                  : t("adminOverview.examType.coding", "Coding Test")}
              </span>
            </div>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.requiresPassword", "需要密碼")}</span>
              <Tag type={contest.requiresPassword ? "green" : "red"} size="sm">
                {contest.requiresPassword ? t("common:yes", "是") : t("common:no", "否")}
              </Tag>
            </div>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.strictMode", "嚴格考試模式")}</span>
              <Tag type={contest.cheatDetectionEnabled ? "green" : "red"} size="sm">
                {contest.cheatDetectionEnabled ? t("common:enabled", "已啟用") : t("common:disabled", "未啟用")}
              </Tag>
            </div>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.schedule", "已設定時間")}</span>
              <Tag type={hasSchedule ? "green" : "red"} size="sm">
                {hasSchedule ? t("common:yes", "是") : t("common:no", "否")}
              </Tag>
            </div>
            <div className={styles.publishSummaryItem}>
              <span className={styles.publishSummaryLabel}>{t("adminOverview.publishSummary.rules", "已設定競賽規則")}</span>
              <Tag type={hasRules ? "green" : "red"} size="sm">
                {hasRules ? t("common:yes", "是") : t("common:no", "否")}
              </Tag>
            </div>
          </div>
        </div>
      ),
      confirmLabel: t("adminOverview.actions.publishContest", "發布競賽"),
      cancelLabel: tc("button.cancel"),
    });
    if (!publishSummaryConfirmed) return;

    if (hasSchedule) {
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
      return;
    }
    const pendingTodoCount = (workItemCount > 0 ? 0 : 1) + (hasRules ? 0 : 1);
    setPublishScheduleMode("publish");
    setPublishScheduleWarning(
      pendingTodoCount > 0
        ? t("adminOverview.publishSchedule.todoWarning", "提醒：仍有 {{count}} 項代辦未完成，建議先檢查。", { count: pendingTodoCount })
        : "",
    );
    setPublishScheduleOpen(true);
  }, [confirm, contest, refreshContest, showToast, t, tc]);

  const handleOpenScheduleEditor = useCallback(() => {
    if (!contest?.id) return;
    setPublishScheduleMode("schedule");
    setPublishScheduleWarning("");
    setPublishScheduleOpen(true);
  }, [contest?.id]);

  const handleConfirmPublishSchedule = useCallback(async (payload: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }) => {
    if (!contest?.id) return;
    setPublishScheduleSubmitting(true);
    try {
      await updateContest(
        contest.id,
        publishScheduleMode === "publish"
          ? {
              status: "published",
              startTime: payload.startTime,
              endTime: payload.endTime,
            }
          : {
              startTime: payload.startTime,
              endTime: payload.endTime,
            },
      );
      setPublishScheduleOpen(false);
      await refreshContest();
      showToast({
        kind: "success",
        title: publishScheduleMode === "publish"
          ? t("adminOverview.actions.publishContestSuccess")
          : t("common:message.success", "設定已更新"),
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: publishScheduleMode === "publish"
          ? t("adminOverview.actions.publishContestFailed")
          : t("adminOverview.actions.updateFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishScheduleSubmitting(false);
    }
  }, [contest?.id, publishScheduleMode, refreshContest, showToast, t]);

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
      await updateContest(contest.id, { status: "draft", resultsPublished: false });
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

  const handleQuickUpdate = useCallback(
    async (payload: ContestUpdatePayload, successTitle: string) => {
      if (!contest?.id) return;
      await updateContest(contest.id, payload);
      await refreshContest();
      showToast({ kind: "success", title: successTitle });
    },
    [contest?.id, refreshContest, showToast],
  );

  const handleQuickToggleAllowMultipleJoins = useCallback(
    async (enabled: boolean) => {
      try {
        await handleQuickUpdate(
          { allowMultipleJoins: enabled },
          t("common:message.success", "設定已更新"),
        );
      } catch (error) {
        showToast({
          kind: "error",
          title: t("adminOverview.actions.updateFailed"),
          subtitle: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [handleQuickUpdate, showToast, t],
  );

  const handleQuickSavePassword = useCallback(async (requiresPassword: boolean, password?: string) => {
    try {
      await handleQuickUpdate(
        {
          requiresPassword,
          password: requiresPassword ? password : undefined,
        },
        t("common:message.success", "設定已更新"),
      );
      return true;
    } catch (error) {
      showToast({
        kind: "error",
        title: t("adminOverview.actions.updateFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }, [handleQuickUpdate, showToast, t]);

  const handleRequestToggleAllowMultipleJoins = useCallback(async () => {
    if (!contest?.id) return;
    const nextEnabled = !contest.allowMultipleJoins;
    const confirmed = await confirm({
      title: nextEnabled
        ? t("adminOverview.actions.enableAllowRejoin", "啟用重進")
        : t("adminOverview.actions.disableAllowRejoin", "停用重進"),
      body: nextEnabled
        ? t("adminOverview.widgets.allowRejoinEnableConfirm", "確定要允許學生重新加入考試嗎？")
        : t("adminOverview.widgets.allowRejoinDisableConfirm", "確定要禁止學生重新加入考試嗎？"),
      confirmLabel: tc("button.confirm", "確認"),
      cancelLabel: tc("button.cancel"),
    });
    if (!confirmed) return;
    await handleQuickToggleAllowMultipleJoins(nextEnabled);
  }, [confirm, contest?.allowMultipleJoins, contest?.id, handleQuickToggleAllowMultipleJoins, t, tc]);

  const handleRequestTogglePassword = useCallback(async () => {
    if (!contest?.id) return;
    if (contest.requiresPassword) {
      const confirmed = await confirm({
        title: t("adminOverview.actions.disablePassword", "停用密碼"),
        body: t("adminOverview.widgets.passwordDisableConfirm", "確定停用競賽密碼保護？"),
        confirmLabel: tc("button.confirm", "確認"),
        cancelLabel: tc("button.cancel"),
        danger: true,
      });
      if (!confirmed) return;
      await handleQuickSavePassword(false);
      return;
    }
    setPasswordInput("");
    setPasswordInputError("");
    setPasswordModalOpen(true);
  }, [confirm, contest?.id, contest?.requiresPassword, handleQuickSavePassword, t, tc]);

  const handleSubmitPasswordModal = useCallback(async () => {
    const nextPassword = passwordInput.trim();
    if (!nextPassword) {
      setPasswordInputError(t("adminOverview.draftChecklist.widgets.password.required", "啟用密碼時請先輸入密碼"));
      return;
    }
    setPasswordSubmitting(true);
    const ok = await handleQuickSavePassword(true, nextPassword);
    setPasswordSubmitting(false);
    if (!ok) return;
    setPasswordModalOpen(false);
    setPasswordInput("");
    setPasswordInputError("");
  }, [handleQuickSavePassword, passwordInput, t]);

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
            onOpenSettings={openSettings}
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
              onOpenChecklist={() => setChecklistOpen(true)}
              onOpenScheduleSettings={handleOpenScheduleEditor}
              onPublishContest={handlePublishContest}
              onRevertContestToDraft={handleRevertContestToDraft}
              onPublishResults={handlePublishResults}
              onRevokeResults={handleRevokeResults}
              onToggleStrictMode={handleToggleStrictMode}
              onRequestToggleAllowMultipleJoins={handleRequestToggleAllowMultipleJoins}
              onRequestTogglePassword={handleRequestTogglePassword}
            />
            {contest.status !== "draft" && (
              <StudentStatusBreakdown kpi={kpi} loading={initialLoading} />
            )}
          </div>
        }
      />
      <ConfirmModal {...modalProps} />
      <PublishScheduleModal
        open={publishScheduleOpen}
        loading={publishScheduleSubmitting}
        mode={publishScheduleMode}
        warningMessage={publishScheduleWarning}
        initialStartTime={contest.startTime}
        initialEndTime={contest.endTime}
        onClose={() => {
          if (publishScheduleSubmitting) return;
          setPublishScheduleOpen(false);
        }}
        onConfirm={handleConfirmPublishSchedule}
      />
      <Modal
        open={checklistOpen}
        passiveModal
        modalHeading={t("adminOverview.draftChecklist.todoCountTitle", "發佈代辦事件數量")}
        onRequestClose={() => setChecklistOpen(false)}
      >
        {(() => {
          const workItemCount = contest.contestType === "paper_exam"
            ? contest.examQuestionsCount
            : contest.problems.length;
          const hasWorkItems = workItemCount > 0;
          const hasSchedule = Number.isFinite(Date.parse(contest.startTime ?? "")) && Number.isFinite(Date.parse(contest.endTime ?? ""));
          const hasRules = (contest.rules ?? "").trim().length > 0;
          return (
            <div style={{ display: "grid", gap: "1rem" }}>
              <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
                {t("adminOverview.draftChecklist.todoDescription", "以下是發布前建議完成的代辦項目，你可以直接前往對應頁面編輯。")}
              </p>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <Tag type={hasWorkItems ? "green" : "red"}>
                    {hasWorkItems ? t("adminOverview.draftChecklist.status.done", "已完成") : t("adminOverview.draftChecklist.status.missing", "尚未設定")}
                  </Tag>
                  <p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>{t("adminOverview.draftChecklist.todo.problem", "1. 題目大於 0 題")}</p>
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => {
                      setChecklistOpen(false);
                      openPanel("problem_editor");
                    }}
                  >
                    {t("adminOverview.draftChecklist.actions.gotoProblemEditor", "前往編輯")}
                  </Button>
                </div>
                <div>
                  <Tag type={hasSchedule ? "green" : "red"}>
                    {hasSchedule ? t("adminOverview.draftChecklist.status.done", "已完成") : t("adminOverview.draftChecklist.status.missing", "尚未設定")}
                  </Tag>
                  <p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>{t("adminOverview.draftChecklist.todo.schedule", "2. 設定時間")}</p>
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => {
                      setChecklistOpen(false);
                      handleOpenScheduleEditor();
                    }}
                  >
                    {t("adminOverview.draftChecklist.actions.gotoSchedule", "設定時間")}
                  </Button>
                </div>
                <div>
                  <Tag type={hasRules ? "green" : "red"}>
                    {hasRules ? t("adminOverview.draftChecklist.status.done", "已完成") : t("adminOverview.draftChecklist.status.missing", "尚未設定")}
                  </Tag>
                  <p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>{t("adminOverview.draftChecklist.todo.rules", "3. 設定競賽規則")}</p>
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => {
                      setChecklistOpen(false);
                      openSettings();
                    }}
                  >
                    {t("adminOverview.draftChecklist.actions.gotoSettings", "前往設定")}
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
      <Modal
        open={passwordModalOpen}
        modalHeading={t("adminOverview.actions.enablePassword", "啟用密碼")}
        primaryButtonText={tc("button.confirm", "確認")}
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => {
          if (passwordSubmitting) return;
          setPasswordModalOpen(false);
          setPasswordInputError("");
        }}
        onRequestSubmit={() => {
          void handleSubmitPasswordModal();
        }}
        primaryButtonDisabled={passwordSubmitting}
      >
        <TextInput
          id="contest-password-enable-input"
          type="password"
          labelText={t("adminOverview.draftChecklist.widgets.password.inputLabel", "設定競賽密碼")}
          value={passwordInput}
          onChange={(e) => {
            setPasswordInput(e.target.value);
            if (passwordInputError) setPasswordInputError("");
          }}
          invalid={!!passwordInputError}
          invalidText={passwordInputError}
        />
      </Modal>
    </>
  );
}
