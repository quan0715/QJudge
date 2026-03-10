import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  InlineNotification,
  Stack,
  ProgressIndicator,
  ProgressStep,
  Tile,
} from "@carbon/react";
import {
  CheckmarkFilled,
  ErrorFilled,
  InProgress,
  Time,
  WarningAlt,
  Screen,
  FitToScreen,
  Cursor_1 as CursorIcon,
  ArrowRight,
} from "@carbon/icons-react";
import { requestFullscreen, isFullscreen } from "@/core/usecases/exam";
import ExamCountdownOverlay from "@/features/contest/components/exam/ExamCountdownOverlay";
import { DisplayCheckService } from "@/features/contest/detectors/displayCheckService";
import { usePaperExamFlow } from "./usePaperExamFlow";
import {
  markExamPrecheckPassed,
  clearExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks/useExamPrecheckGate";
import {
  clearPrecheckScreenShareHandoff,
  peekPrecheckScreenShareHandoff,
  setPrecheckScreenShareHandoff,
} from "./hooks/examScreenShareHandoff";
import {
  getPostPrecheckPath,
  getContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { setAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import styles from "./ExamPrecheck.module.scss";

type CheckStatus = "pending" | "running" | "pass" | "fail" | "blocked";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

type EnvCheckId = "singleMonitor" | "shareScreen" | "fullscreen" | "interaction";

interface PreflightValidationFailure {
  checkId: EnvCheckId;
  detail: string;
  clearShareHandoff?: boolean;
}

const ENV_CHECK_ORDER: EnvCheckId[] = [
  "singleMonitor",
  "shareScreen",
  "fullscreen",
  "interaction",
];

const COUNTDOWN_SECONDS = 3;
const PRECHECK_FULLSCREEN_TIMEOUT_MS = 4000;
const PRECHECK_RECENT_INTERACTION_WINDOW_MS = 30000;
const PRECHECK_SHARE_RECHECK_DELAY_MS = 350;
const PRECHECK_MIN_RUNNING_MS = 1000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const displayService = new DisplayCheckService();

const ExamPrecheckScreen: React.FC = () => {
  const { t } = useTranslation(["contest", "common"]);
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, startSession } =
    usePaperExamFlow();

  const getPostPrecheckRoute = useCallback(() => {
    if (!contestId) return "";
    return getPostPrecheckPath(contestId, contest);
  }, [contest, contestId]);

  const handleBackToDashboard = useCallback(() => {
    if (!contestId) return;
    navigate(getContestDashboardPath(contestId));
  }, [contestId, navigate]);

  const [currentStep, setCurrentStep] = useState(0);
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "participation", label: t("precheck.eligibility.participation"), status: "pending" },
    { id: "submitted", label: t("precheck.eligibility.submission"), status: "pending" },
  ]);
  const [envChecks, setEnvChecks] = useState<CheckItem[]>([
    { id: "singleMonitor", label: t("precheck.environment.checks.monitor"), status: "pending" },
    { id: "shareScreen", label: t("precheck.environment.checks.sharing"), status: "pending" },
    { id: "fullscreen", label: t("precheck.environment.checks.fullscreen"), status: "pending" },
    { id: "interaction", label: t("precheck.environment.checks.interaction"), status: "pending" },
  ]);
  const [envTestDone, setEnvTestDone] = useState(false);
  const [envTestRunning, setEnvTestRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startGuardError, setStartGuardError] = useState<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionAtRef = useRef<number>(Date.now());

  const updateCheck = (
    setter: React.Dispatch<React.SetStateAction<CheckItem[]>>,
    id: string,
    status: CheckStatus,
    detail?: string
  ) => {
    setter((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status, detail } : c))
    );
  };

  const statusMeta: Record<
    CheckStatus,
    { label: string; color: string; Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }
  > = {
    pending: {
      label: t("common:status.pending"),
      color: "var(--cds-text-secondary)",
      Icon: Time,
    },
    running: {
      label: t("precheck.environment.status.checking"),
      color: "var(--cds-support-info)",
      Icon: InProgress,
    },
    pass: {
      label: t("common:status.success"),
      color: "var(--cds-support-success)",
      Icon: CheckmarkFilled,
    },
    fail: {
      label: t("common:status.failed"),
      color: "var(--cds-support-error)",
      Icon: ErrorFilled,
    },
    blocked: {
      label: t("common:status.notPassed"),
      color: "var(--cds-support-warning)",
      Icon: WarningAlt,
    },
  };

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

  // Keep precheck-gate in sync with server status.
  useEffect(() => {
    if (!contest || !contestId) return;
    // Force fresh precheck checks every time user enters this screen.
    clearExamPrecheckPassed(contestId);
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);
    setAnticheatPhase(contestId, "PRECHECK");
  }, [contest, contestId]);

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

  // Step 2: Environment checks
  const runEnvChecks = useCallback(async () => {
    if (envTestRunning) return;
    setStartGuardError(null);
    setEnvTestRunning(true);
    setEnvChecks([
      { id: "singleMonitor", label: t("precheck.environment.checks.monitor"), status: "pending" },
      { id: "shareScreen", label: t("precheck.environment.checks.sharing"), status: "pending" },
      { id: "fullscreen", label: t("precheck.environment.checks.fullscreen"), status: "pending" },
      { id: "interaction", label: t("precheck.environment.checks.interaction"), status: "pending" },
    ]);
    setEnvTestDone(false);

    const runningAt = new Map<string, number>();
    const markRunning = (id: string, detail?: string) => {
      runningAt.set(id, Date.now());
      updateCheck(setEnvChecks, id, "running", detail);
    };
    const finalizeCheck = async (
      id: string,
      status: Exclude<CheckStatus, "pending" | "running">,
      detail?: string
    ) => {
      const startedAt = runningAt.get(id);
      if (startedAt) {
        const elapsed = Date.now() - startedAt;
        const remain = PRECHECK_MIN_RUNNING_MS - elapsed;
        if (remain > 0) await sleep(remain);
      }
      runningAt.delete(id);
      updateCheck(setEnvChecks, id, status, detail);
    };
    const markBlocked = (id: string, detail: string) => {
      updateCheck(setEnvChecks, id, "blocked", detail);
    };
    const failShareAndBlock = async (detail: string) => {
      await finalizeCheck("shareScreen", "fail", detail);
      const depMsg = t("precheck.environment.errors.dependencyPrefix", { name: t("precheck.environment.checks.sharing") });
      markBlocked("fullscreen", depMsg);
      markBlocked("interaction", depMsg);
      clearPrecheckScreenShareHandoff(true);
    };
    const blockRemainingAfterSingleMonitor = () => {
      const depMsg = t("precheck.environment.errors.dependencyPrefix", { name: t("precheck.environment.checks.monitor") });
      markBlocked("shareScreen", depMsg);
      markBlocked("fullscreen", depMsg);
      markBlocked("interaction", depMsg);
      clearPrecheckScreenShareHandoff(true);
    };

    try {
      markRunning("singleMonitor", t("precheck.environment.status.checking"));
      const diagnostics = await displayService.check();

      if (!diagnostics.supportsScreenDetails) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          t("precheck.environment.errors.browserNotSupported")
        );
        blockRemainingAfterSingleMonitor();
        return;
      }

      if (diagnostics.screenCount === null) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          t("precheck.environment.errors.noScreenDetails")
        );
        blockRemainingAfterSingleMonitor();
        return;
      }

      if (diagnostics.isExtended || diagnostics.screenCount > 1) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          t("precheck.environment.errors.multiMonitor", { count: diagnostics.screenCount })
        );
        blockRemainingAfterSingleMonitor();
        return;
      }

      await finalizeCheck(
        "singleMonitor",
        "pass",
        t("precheck.eligibility.status.passed")
      );

      markRunning("shareScreen", t("precheck.environment.requirements.sharing"));
      const shareResult = await requestMonitorScreenShare();
      if (!shareResult.granted) {
        await failShareAndBlock(shareResult.detail);
        return;
      }

      // Recheck after user selected the shared screen to avoid stale pre-share state.
      await sleep(PRECHECK_SHARE_RECHECK_DELAY_MS);
      const diagnosticsAfterShare = await displayService.check();
      if (diagnosticsAfterShare.screenCount === null) {
        await failShareAndBlock(t("precheck.environment.errors.noScreenDetails"));
        return;
      }
      if (diagnosticsAfterShare.isExtended || diagnosticsAfterShare.screenCount > 1) {
        await failShareAndBlock(
          t("precheck.environment.errors.multiMonitor", { count: diagnosticsAfterShare.screenCount })
        );
        return;
      }

      const isMonitorSurface = shareResult.displaySurface === "monitor";
      if (!isMonitorSurface) {
        await failShareAndBlock(t("precheck.environment.errors.notMonitor"));
        return;
      } else {
        await finalizeCheck(
          "shareScreen",
          "pass",
          t("precheck.environment.checks.sharing")
        );
      }

      markRunning("fullscreen", t("precheck.environment.status.checking"));
      try {
        const enteredFullscreen = await withTimeout(
          requestFullscreen(),
          PRECHECK_FULLSCREEN_TIMEOUT_MS,
          "requestFullscreen timeout"
        );
        if (enteredFullscreen && isFullscreen()) {
          await finalizeCheck("fullscreen", "pass", t("common:status.success"));
        } else {
          await finalizeCheck(
            "fullscreen",
            "fail",
            t("precheck.environment.errors.fullscreenFailed")
          );
          const depMsg = t("precheck.environment.errors.dependencyPrefix", { name: t("precheck.environment.checks.fullscreen") });
          markBlocked("interaction", depMsg);
          return;
        }
      } catch {
        await finalizeCheck("fullscreen", "fail", t("precheck.environment.errors.fullscreenTimeout"));
        const depMsg = t("precheck.environment.errors.dependencyPrefix", { name: t("precheck.environment.checks.fullscreen") });
        markBlocked("interaction", depMsg);
        return;
      }

      markRunning("interaction", t("precheck.environment.status.checking"));
      const hasRecentInput =
        Date.now() - lastInteractionAtRef.current <= PRECHECK_RECENT_INTERACTION_WINDOW_MS;
      if (!document.hasFocus()) {
        await finalizeCheck("interaction", "fail", t("precheck.environment.errors.focusFailed"));
      } else if (!hasRecentInput) {
        await finalizeCheck(
          "interaction",
          "fail",
          t("precheck.environment.errors.interactionFailed")
        );
      } else {
        await finalizeCheck("interaction", "pass", t("common:status.success"));
      }

    } finally {
      setEnvTestDone(true);
      setEnvTestRunning(false);
    }
  }, [envTestRunning, requestMonitorScreenShare, t]);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const applyPreflightFailureToEnvChecks = useCallback(
    (failure: PreflightValidationFailure) => {
      const failureIndex = ENV_CHECK_ORDER.indexOf(failure.checkId);
      if (failureIndex < 0) return;

      setEnvChecks((prev) =>
        prev.map((item) => {
          const itemId = item.id as EnvCheckId;
          const idx = ENV_CHECK_ORDER.indexOf(itemId);
          if (idx === failureIndex) {
            return {
              ...item,
              status: "fail" as const,
              detail: failure.detail,
            };
          }
          if (idx > failureIndex) {
            const depName = failure.checkId === "singleMonitor"
              ? t("precheck.environment.checks.monitor")
              : failure.checkId === "shareScreen"
                ? t("precheck.environment.checks.sharing")
                : failure.checkId === "fullscreen"
                  ? t("precheck.environment.checks.fullscreen")
                  : t("precheck.environment.checks.interaction");
            return {
              ...item,
              status: "blocked" as const,
              detail: t("precheck.environment.errors.dependencyPrefix", { name: depName }),
            };
          }
          return item;
        })
      );
      setEnvTestDone(true);
      setEnvTestRunning(false);
      if (failure.clearShareHandoff) {
        clearPrecheckScreenShareHandoff(true);
      }
    },
    [t]
  );

  const runStartPreflightValidation = useCallback(async (): Promise<PreflightValidationFailure | null> => {
    const diagnostics = await displayService.check();
    if (!diagnostics.supportsScreenDetails) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.browserNotSupported"),
        clearShareHandoff: true,
      };
    }
    if (diagnostics.screenCount === null) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.noScreenDetails"),
        clearShareHandoff: true,
      };
    }
    if (diagnostics.isExtended || diagnostics.screenCount > 1) {
      return {
        checkId: "singleMonitor",
        detail: t("precheck.environment.errors.multiMonitor", { count: diagnostics.screenCount }),
        clearShareHandoff: true,
      };
    }

    const handoffStream = peekPrecheckScreenShareHandoff();
    if (!handoffStream) {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.sharingInterrupted"),
        clearShareHandoff: true,
      };
    }
    const track = handoffStream.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.sharingInterrupted"),
        clearShareHandoff: true,
      };
    }
    const settings = (track.getSettings?.() || {}) as MediaTrackSettings & { displaySurface?: string };
    if (settings.displaySurface !== "monitor") {
      return {
        checkId: "shareScreen",
        detail: t("precheck.environment.errors.notMonitor"),
        clearShareHandoff: true,
      };
    }

    if (!isFullscreen()) {
      return {
        checkId: "fullscreen",
        detail: t("precheck.environment.errors.fullscreenFailed"),
      };
    }

    return null;
  }, [t]);

  const handleStart = useCallback(async () => {
    setStartGuardError(null);
    const validationFailure = await runStartPreflightValidation();
    if (validationFailure) {
      applyPreflightFailureToEnvChecks(validationFailure);
      setStartGuardError(validationFailure.detail);
      setCurrentStep(1);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
  }, [applyPreflightFailureToEnvChecks, runStartPreflightValidation]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
      return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
    }
    (async () => {
      const validationFailure = await runStartPreflightValidation();
      if (validationFailure) {
        applyPreflightFailureToEnvChecks(validationFailure);
        setStartGuardError(validationFailure.detail);
        setCurrentStep(1);
        setCountdown(null);
        return;
      }
      const started = await startSession();
      if (!started || !contestId) { setCountdown(null); return; }
      if (!isFullscreen()) {
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
    applyPreflightFailureToEnvChecks,
    countdown,
    contestId,
    getPostPrecheckRoute,
    navigate,
    runStartPreflightValidation,
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

        {currentStep === 1 && (
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
                    onClick={runEnvChecks}
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
                    onClick={runEnvChecks}
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
                  <li>{t("precheck.instruction.noSwitch")}</li>
                  <li>{t("precheck.instruction.keepFullscreen")}</li>
                  <li>{t("precheck.instruction.autoSave")}</li>
                  <li>{t("precheck.instruction.autoSubmit")}</li>
                  {contest?.endTime && (
                    <li>
                      {t("precheck.instruction.deadline", { time: new Date(contest.endTime).toLocaleString() })}
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
