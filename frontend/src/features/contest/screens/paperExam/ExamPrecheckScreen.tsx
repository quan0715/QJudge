import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  InlineNotification,
  Stack,
  Tag,
  ProgressIndicator,
  ProgressStep,
  Tile,
} from "@carbon/react";
import {
  Screen,
  FitToScreen,
  Cursor_1 as CursorIcon,
  ArrowRight,
  WarningAlt,
} from "@carbon/icons-react";
import { requestFullscreen, isFullscreen } from "@/core/usecases/exam";
import ExamCountdownOverlay from "@/features/contest/components/exam/ExamCountdownOverlay";
import { usePaperExamFlow } from "./usePaperExamFlow";
import {
  markExamPrecheckPassed,
  hasExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks/useExamPrecheckGate";
import {
  clearPrecheckScreenShareHandoff,
  setPrecheckScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import {
  clearPrecheckWebcamHandoff,
  setPrecheckWebcamHandoff,
} from "@/features/contest/anticheat/webcamHandoffStore";
import {
  getClassroomContestDashboardPath,
  getClassroomContestSolvePath,
  getPostPrecheckPath,
  getContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { setAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import {
  applyPreflightFailureToEnvChecks,
  type CheckItem,
  createEligibilityChecks,
  createEnvironmentChecks,
  type EnvironmentCheckFilter,
  createStatusMeta,
  runEnvChecks,
  runStartPreflightValidation,
  updateCheck,
} from "./precheckEnvironment";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import {
  buildExamEntryDeviceMetadata,
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";
import {
  requestUserMediaVideo,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";
import { isStreamHealthy } from "@/features/contest/anticheat/mediaStreamHealth";
import styles from "./ExamPrecheck.module.scss";

const COUNTDOWN_SECONDS = 3;

const ExamPrecheckScreen: React.FC = () => {
  const { t } = useTranslation(["contest", "common"]);
  const navigate = useNavigate();
  const { classroomId } = useParams<{ classroomId?: string }>();
  const { contestId, contest, loading, error, clearError, startSession } =
    usePaperExamFlow();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const { config: anticheatConfig } = useContestAnticheatConfig(contestId);

  const capability = detectAnticheatCapability();
  const monitoringPlan = resolveDeviceMonitoringPlan(
    capability,
    anticheatConfig?.devicePolicy ?? contest?.anticheatDevicePolicy
  );
  const entryDeviceMetadata = buildExamEntryDeviceMetadata(capability, monitoringPlan);
  const skipFullscreenCheck = !monitoringPlan.precheck.requireFullscreen;
  const entryDeviceLabel =
    entryDeviceMetadata.device_kind === "tablet"
      ? capability.isIPadLike
        ? t("precheck.entryDevice.kind.ipad", "平板（iPad）")
        : t("precheck.entryDevice.kind.tablet", "平板")
      : t("precheck.entryDevice.kind.desktop", "桌機 / 筆電");
  const entryModeLabel = capability.isPwaMode
    ? t("precheck.entryDevice.mode.pwa", "PWA 模式")
    : t("precheck.entryDevice.mode.browser", "瀏覽器分頁模式");
  const entrySourceLabel = entryDeviceMetadata.active_sources.length
    ? entryDeviceMetadata.active_sources
        .map((source) =>
          source === "screen_share"
            ? t("precheck.entryDevice.source.screenShare", "螢幕畫面")
            : t("precheck.entryDevice.source.webcam", "Webcam")
        )
        .join(" + ")
    : t("precheck.entryDevice.source.none", "未啟用監考來源");

  const getPostPrecheckRoute = useCallback(() => {
    if (!contestId) return "";
    return effectiveClassroomId
      ? getClassroomContestSolvePath(effectiveClassroomId, contestId)
      : getPostPrecheckPath(contestId, contest);
  }, [contest, contestId, effectiveClassroomId]);

  const handleBackToDashboard = useCallback(() => {
    if (!contestId) return;
    navigate(
      effectiveClassroomId
        ? getClassroomContestDashboardPath(effectiveClassroomId, contestId)
        : getContestDashboardPath(contestId),
    );
  }, [contestId, effectiveClassroomId, navigate]);

  const [currentStep, setCurrentStep] = useState(0);
  const [checks, setChecks] = useState<CheckItem[]>(() => createEligibilityChecks(t));
  const checkFilter: EnvironmentCheckFilter = {
    requireScreenShare: monitoringPlan.precheck.requireScreenShare,
    enableWebcam: monitoringPlan.precheck.enableWebcam,
    requirePwaMode: monitoringPlan.precheck.requirePwaMode,
    skipFullscreen: skipFullscreenCheck,
  };
  const [envChecks, setEnvChecks] = useState<CheckItem[]>(() => createEnvironmentChecks(t, checkFilter));
  const [envTestDone, setEnvTestDone] = useState(false);
  const [envTestRunning, setEnvTestRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startGuardError, setStartGuardError] = useState<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionAtRef = useRef<number>(0);
  const statusMeta = createStatusMeta(t);

  const requestMonitorScreenShare = useCallback(async (): Promise<{
    granted: boolean;
    displaySurface: string | null;
    detail: string;
  }> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return {
        granted: false,
        displaySurface: null,
        detail: t("precheck.environment.errors.browserNotSupported"),
      };
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const settings = (track?.getSettings?.() || {}) as MediaTrackSettings & {
        displaySurface?: string;
      };
      const displaySurface = settings.displaySurface;

      setPrecheckScreenShareHandoff(stream);

      return {
        granted: true,
        displaySurface: displaySurface ?? null,
        detail:
          displaySurface === "monitor"
            ? t("precheck.environment.checks.sharing")
            : t("precheck.environment.errors.notMonitor"),
      };
    } catch {
      clearPrecheckScreenShareHandoff(true);
      return {
        granted: false,
        displaySurface: null,
        detail: t("precheck.environment.errors.sharingFailed"),
      };
    }
  }, [t]);

  const requestWebcamCapture = useCallback(async (): Promise<{
    granted: boolean;
    detail: string;
  }> => {
    if (!supportsUserMediaApi()) {
      return {
        granted: false,
        detail: t("precheck.environment.errors.webcamUnsupported", "此瀏覽器不支援 Webcam。"),
      };
    }
    try {
      const stream = await requestUserMediaVideo();
      if (!isStreamHealthy(stream)) {
        stream.getTracks().forEach((t) => t.stop());
        clearPrecheckWebcamHandoff(true);
        return {
          granted: false,
          detail: t("precheck.environment.errors.webcamFailed", "Webcam 無法使用，請重新授權。"),
        };
      }
      setPrecheckWebcamHandoff(stream);
      return {
        granted: true,
        detail: t("precheck.environment.checks.webcam", "Webcam"),
      };
    } catch {
      clearPrecheckWebcamHandoff(true);
      return {
        granted: false,
        detail: t("precheck.environment.errors.webcamFailed", "Webcam 無法使用，請重新授權。"),
      };
    }
  }, [t]);

  // Initialize precheck phase and clear stale handoffs once per route entry.
  useEffect(() => {
    if (!contestId) return;
    setAnticheatPhase(contestId, "PRECHECK");
    clearPrecheckScreenShareHandoff(true);
    clearPrecheckWebcamHandoff(true);
  }, [contestId]);

  // Keep precheck-gate in sync with server status.
  useEffect(() => {
    if (!contest || !contestId) return;
    // Do not clear gate on precheck mount to avoid redirect loops on iPad/PWA.
    // Fresh-attempt reset is handled at dashboard start action.
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);
  }, [contest, contestId]);

  useEffect(() => {
    if (!contestId || !contest) return;
    if (contest.examStatus !== "in_progress") return;
    if (!hasExamPrecheckPassed(contestId)) return;
    navigate(getPostPrecheckRoute(), { replace: true });
  }, [contest, contestId, getPostPrecheckRoute, navigate]);

  // Step 1: Participation & submission verification
  useEffect(() => {
    if (currentStep !== 0 || !contest) return;

    // 參賽狀態檢查
    if (contest.examStatus) {
      updateCheck(setChecks, "participation", "pass", t("precheck.eligibility.status.passed"));
    } else {
      updateCheck(setChecks, "participation", "fail", t("precheck.eligibility.status.failed"));
    }

    // 交卷記錄檢查
    if (contest.examStatus === "submitted") {
      if (contest.allowMultipleJoins) {
        updateCheck(setChecks, "submitted", "pass", t("precheck.eligibility.status.submittedAllowed"));
      } else {
        updateCheck(setChecks, "submitted", "fail", t("precheck.eligibility.status.submittedDenied"));
      }
    } else {
      updateCheck(setChecks, "submitted", "pass", t("precheck.eligibility.status.noSubmission"));
    }
  }, [currentStep, contest, t]);

  const step1AllPass = checks.every((c) => c.status === "pass");

  useEffect(() => {
    lastInteractionAtRef.current = Date.now();
    const markInteracted = () => {
      lastInteractionAtRef.current = Date.now();
    };
    document.addEventListener("pointerdown", markInteracted, true);
    document.addEventListener("keydown", markInteracted, true);
    return () => {
      document.removeEventListener("pointerdown", markInteracted, true);
      document.removeEventListener("keydown", markInteracted, true);
    };
  }, []);

  const runEnvironmentChecks = useCallback(async () => {
    if (!monitoringPlan.allowed) {
      const firstMissing = monitoringPlan.missingEnabledSources[0];
      const detail =
        firstMissing === "screen_share"
          ? t("precheck.environment.errors.browserNotSupported")
          : t("precheck.environment.errors.webcamUnsupported", "此瀏覽器不支援 Webcam。");
      setEnvChecks((prev) =>
        prev.map((item) =>
          item.id === (firstMissing === "screen_share" ? "shareScreen" : "webcam")
            ? { ...item, status: "fail", detail }
            : item
        )
      );
      setEnvTestDone(true);
      setEnvTestRunning(false);
      setStartGuardError(detail);
      return;
    }
    await runEnvChecks({
      t,
      envTestRunning,
      requireScreenShare: monitoringPlan.precheck.requireScreenShare,
      requireWebcam: monitoringPlan.precheck.requireWebcam,
      enableWebcam: monitoringPlan.precheck.enableWebcam,
      requirePwaOnTablet: monitoringPlan.precheck.requirePwaMode,
      isPwaMode: capability.isPwaMode,
      skipFullscreenCheck,
      checkFilter,
      requestMonitorScreenShare,
      requestWebcamCapture,
      lastInteractionAt: lastInteractionAtRef.current,
      setStartGuardError,
      setEnvChecks,
      setEnvTestDone,
      setEnvTestRunning,
    });
  }, [
    capability.isPwaMode,
    envTestRunning,
    monitoringPlan.allowed,
    monitoringPlan.missingEnabledSources,
    monitoringPlan.precheck.enableWebcam,
    monitoringPlan.precheck.requirePwaMode,
    monitoringPlan.precheck.requireScreenShare,
    monitoringPlan.precheck.requireWebcam,
    requestMonitorScreenShare,
    requestWebcamCapture,
    skipFullscreenCheck,
    t,
  ]);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const handleStart = useCallback(async () => {
    setStartGuardError(null);
    if (!monitoringPlan.allowed) {
      const firstMissing = monitoringPlan.missingEnabledSources[0];
      const detail =
        firstMissing === "screen_share"
          ? t("precheck.environment.errors.browserNotSupported")
          : t("precheck.environment.errors.webcamUnsupported", "此瀏覽器不支援 Webcam。");
      setStartGuardError(detail);
      setCurrentStep(1);
      return;
    }
    const validationFailure = await runStartPreflightValidation(t, {
      requireScreenShare: monitoringPlan.precheck.requireScreenShare,
      requireWebcam: monitoringPlan.precheck.requireWebcam,
      enableWebcam: monitoringPlan.precheck.enableWebcam,
      requirePwaOnTablet: monitoringPlan.precheck.requirePwaMode,
      isPwaMode: capability.isPwaMode,
      skipFullscreenCheck,
    });
    if (validationFailure) {
      applyPreflightFailureToEnvChecks(
        validationFailure,
        setEnvChecks,
        setEnvTestDone,
        setEnvTestRunning,
        t
      );
      setStartGuardError(validationFailure.detail);
      setCurrentStep(1);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
  }, [
    capability.isPwaMode,
    monitoringPlan.allowed,
    monitoringPlan.missingEnabledSources,
    monitoringPlan.precheck.requireScreenShare,
    monitoringPlan.precheck.requireWebcam,
    monitoringPlan.precheck.requirePwaMode,
    skipFullscreenCheck,
    t,
  ]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
      return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
    }
    (async () => {
      const validationFailure = await runStartPreflightValidation(t, {
        requireScreenShare: monitoringPlan.precheck.requireScreenShare,
        requireWebcam: monitoringPlan.precheck.requireWebcam,
        requirePwaOnTablet: monitoringPlan.precheck.requirePwaMode,
        isPwaMode: capability.isPwaMode,
        skipFullscreenCheck,
      });
      if (validationFailure) {
        applyPreflightFailureToEnvChecks(
          validationFailure,
          setEnvChecks,
          setEnvTestDone,
          setEnvTestRunning,
          t
        );
        setStartGuardError(validationFailure.detail);
        setCurrentStep(1);
        setCountdown(null);
        return;
      }
      const started = await startSession();
      if (!started || !contestId) { setCountdown(null); return; }
      if (!skipFullscreenCheck && !isFullscreen()) {
        const enteredFullscreen = await requestFullscreen();
        if (!enteredFullscreen || !isFullscreen()) {
          setStartGuardError(t("precheck.environment.errors.fullscreenFailed"));
          setCountdown(null);
          return;
        }
      }
      markExamPrecheckPassed(contestId);
      navigate(getPostPrecheckRoute());
    })();
  }, [
    capability.isPwaMode,
    countdown,
    contestId,
    monitoringPlan.precheck.requireScreenShare,
    monitoringPlan.precheck.requireWebcam,
    monitoringPlan.precheck.requirePwaMode,
    getPostPrecheckRoute,
    navigate,
    skipFullscreenCheck,
    startSession,
    t,
  ]);

  const renderCheckList = (items: CheckItem[]) => (
        <div className={styles.checkList}>
      {items.map((item) => (
        <div key={item.id} className={styles.checkItem} data-status={item.status}>
          <div className={styles.checkIcon}>
            {(() => {
              const meta = statusMeta[item.status];
              const Icon = meta.Icon;
              return <Icon size={20} style={{ color: meta.color }} />;
            })()}
          </div>
          <div style={{ flex: 1 }}>
            <div className={styles.checkLabelRow}>
              <div className={styles.checkLabel}>{item.label}</div>
              <div className={styles.checkStatusText} data-status={item.status}>
                {statusMeta[item.status].label}
              </div>
            </div>
            {item.detail && <div className={styles.checkDetail}>{item.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );

  if (countdown !== null) {
    const isStarting = countdown > 0;
    return (
      <ExamCountdownOverlay
        value={countdown}
        showGo
        message={isStarting ? t("precheck.countdown.starting") : t("precheck.countdown.entering")}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>{t("precheck.title")}</h2>
          <Button
            kind="ghost"
            size="sm"
            data-testid="precheck-back-dashboard-btn"
            onClick={handleBackToDashboard}
          >
            {t("precheck.backToDashboard")}
          </Button>
        </div>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
          {t("precheck.description")}
        </p>
        <ProgressIndicator currentIndex={currentStep} spaceEqually style={{ marginBottom: "2rem" }}>
          <ProgressStep label={t("precheck.steps.eligibility")} />
          <ProgressStep label={t("precheck.steps.environment")} />
          <ProgressStep label={t("precheck.steps.confirmation")} />
        </ProgressIndicator>

        {error && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t("common:error.title")}
            subtitle={error}
            onCloseButtonClick={clearError}
            style={{ marginBottom: "1rem" }}
          />
        )}
        {startGuardError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t("common:error.validationFailed")}
            subtitle={startGuardError}
            style={{ marginBottom: "1rem" }}
          />
        )}

        {currentStep === 0 && (
          <div className={styles.stepContent} key="step-0">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <CursorIcon size={20} /> {t("precheck.eligibility.title")}
                </h4>
                {renderCheckList(checks)}
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--cds-border-subtle)" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                    {t("precheck.entryDevice.title", "進場資訊")}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Tag type="blue" size="sm">
                      {entryDeviceLabel}
                    </Tag>
                    <Tag type="cyan" size="sm">
                      {entryModeLabel}
                    </Tag>
                    <Tag type="purple" size="sm">
                      {t("precheck.entryDevice.monitoring")}: {entrySourceLabel}
                    </Tag>
                  </div>
                </div>
              </Tile>
              <div className={styles.navRowEnd}>
                <Button
                  kind="primary"
                  renderIcon={ArrowRight}
                  data-testid="precheck-step1-next-btn"
                  disabled={!step1AllPass}
                  onClick={() => setCurrentStep(1)}
                >
                  {t("precheck.eligibility.nextStep")}
                </Button>
              </div>
            </Stack>
          </div>
        )}

        {currentStep === 1 && !monitoringPlan.allowed && (
          <div className={styles.stepContent} key="step-1-unsupported">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <WarningAlt size={20} style={{ color: "var(--cds-support-error)" }} />
                  {t("precheck.environment.deviceUnsupported.title", "不支援此裝置")}
                </h4>
                <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1rem", lineHeight: 1.6 }}>
                  {monitoringPlan.missingEnabledSources.length > 0
                    ? t(
                        "precheck.environment.deviceUnsupported.missingCapabilities",
                        "本考試需要 {{sources}}，但此裝置或瀏覽器不支援。請換用支援的裝置或瀏覽器後重試。",
                        {
                          sources: monitoringPlan.missingEnabledSources
                            .map((s) =>
                              s === "screen_share"
                                ? t("precheck.entryDevice.source.screenShare", "螢幕畫面")
                                : t("precheck.entryDevice.source.webcam", "Webcam")
                            )
                            .join("、"),
                        }
                      )
                    : t(
                        "precheck.environment.deviceUnsupported.deviceKindDisabled",
                        "本考試不允許使用{{device}}作答，請換用允許的裝置重新進入。",
                        { device: entryDeviceLabel }
                      )}
                </p>
                <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                  {t("precheck.environment.deviceUnsupported.detected", "偵測到的裝置：{{device}}（{{mode}}）", {
                    device: entryDeviceLabel,
                    mode: entryModeLabel,
                  })}
                </div>
              </Tile>
              <div className={styles.navRow}>
                <Button
                  kind="secondary"
                  data-testid="precheck-step2-prev-btn"
                  onClick={() => setCurrentStep(0)}
                >
                  {t("common:button.previous")}
                </Button>
                <Button
                  kind="primary"
                  data-testid="precheck-back-dashboard-btn"
                  onClick={handleBackToDashboard}
                >
                  {t("precheck.backToDashboard")}
                </Button>
              </div>
            </Stack>
          </div>
        )}

        {currentStep === 1 && monitoringPlan.allowed && (
          <div className={styles.stepContent} key="step-1">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Screen size={20} /> {t("precheck.environment.title")}
                </h4>
                <div style={{ marginTop: 0, marginBottom: "1rem", color: "var(--cds-text-secondary)", lineHeight: 1.6 }}>
                  <b>{t("precheck.environment.requirements.title")}</b><br/>
                  1. {t("precheck.environment.requirements.browser")}<br/>
                  2. {t("precheck.environment.requirements.permission")}<br/>
                  3. {t("precheck.environment.requirements.display")}<br/>
                  4. {t("precheck.environment.requirements.sharing")}
                </div>
                {renderCheckList(envChecks)}
              </Tile>
              <div className={styles.navRow}>
                <Button
                  kind="secondary"
                  data-testid="precheck-step2-prev-btn"
                  onClick={() => setCurrentStep(0)}
                >
                  {t("common:button.previous")}
                </Button>
                {!envTestDone ? (
                  <Button
                    kind="primary"
                    renderIcon={FitToScreen}
                    data-testid="precheck-step2-primary-btn"
                    onClick={runEnvironmentChecks}
                    disabled={envTestRunning}
                  >
                    {envTestRunning ? t("precheck.environment.status.checking") : t("precheck.environment.status.start")}
                  </Button>
                ) : envAllPass ? (
                  <Button
                    kind="primary"
                    renderIcon={ArrowRight}
                    data-testid="precheck-step2-next-btn"
                    onClick={() => setCurrentStep(2)}
                  >
                    {t("precheck.environment.status.next")}
                  </Button>
                ) : (
                  <Button
                    kind="primary"
                    renderIcon={FitToScreen}
                    data-testid="precheck-step2-primary-btn"
                    onClick={runEnvironmentChecks}
                    disabled={envTestRunning}
                  >
                    {t("precheck.environment.status.retry")}
                  </Button>
                )}
              </div>
            </Stack>
          </div>
        )}

        {currentStep === 2 && (
          <div className={styles.stepContent} key="step-2">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>{t("precheck.instruction.title")}</h4>
                <ul style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
                  <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.noSwitch") }} />
                  <li
                    dangerouslySetInnerHTML={{
                      __html: skipFullscreenCheck
                        ? t("precheck.instruction.keepPwaMode")
                        : t("precheck.instruction.keepFullscreen"),
                    }}
                  />
                  {(monitoringPlan.precheck.requireScreenShare ||
                    monitoringPlan.precheck.requireWebcam) && (
                    <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.monitoringActive") }} />
                  )}
                  <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.blockedActions") }} />
                  <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.autoSave") }} />
                  <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.autoSubmit") }} />
                  {contest?.endTime && (
                    <li>
                      {t("precheck.instruction.deadline", {
                        time: new Date(contest.endTime).toLocaleString(),
                      })}
                    </li>
                  )}
                </ul>
              </Tile>
              <div className={styles.navRow}>
                <Button
                  kind="secondary"
                  data-testid="precheck-step3-prev-btn"
                  onClick={() => setCurrentStep(1)}
                >
                  {t("common:button.previous")}
                </Button>
                <Button
                  kind="danger"
                  data-testid="precheck-confirm-start-btn"
                  disabled={loading}
                  onClick={handleStart}
                >
                  {t("precheck.instruction.confirmStart")}
                </Button>
              </div>
            </Stack>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamPrecheckScreen;
