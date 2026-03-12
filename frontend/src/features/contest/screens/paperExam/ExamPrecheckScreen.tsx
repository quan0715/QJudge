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
  Screen,
  FitToScreen,
  Cursor_1 as CursorIcon,
  ArrowRight,
} from "@carbon/icons-react";
import { requestFullscreen, isFullscreen } from "@/core/usecases/exam";
import ExamCountdownOverlay from "@/features/contest/components/exam/ExamCountdownOverlay";
import { usePaperExamFlow } from "./usePaperExamFlow";
import {
  markExamPrecheckPassed,
  clearExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks/useExamPrecheckGate";
import {
  clearPrecheckScreenShareHandoff,
  setPrecheckScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import {
  getPostPrecheckPath,
  getContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { setAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import {
  applyPreflightFailureToEnvChecks,
  type CheckItem,
  createEligibilityChecks,
  createEnvironmentChecks,
  createStatusMeta,
  runEnvChecks,
  runStartPreflightValidation,
  updateCheck,
} from "./precheckEnvironment";
import styles from "./ExamPrecheck.module.scss";

const COUNTDOWN_SECONDS = 3;

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
  const [checks, setChecks] = useState<CheckItem[]>(() => createEligibilityChecks(t));
  const [envChecks, setEnvChecks] = useState<CheckItem[]>(() => createEnvironmentChecks(t));
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
    await runEnvChecks({
      t,
      envTestRunning,
      requestMonitorScreenShare,
      lastInteractionAt: lastInteractionAtRef.current,
      setStartGuardError,
      setEnvChecks,
      setEnvTestDone,
      setEnvTestRunning,
    });
  }, [envTestRunning, requestMonitorScreenShare, t]);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const handleStart = useCallback(async () => {
    setStartGuardError(null);
    const validationFailure = await runStartPreflightValidation(t);
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
  }, [t]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
      return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
    }
    (async () => {
      const validationFailure = await runStartPreflightValidation(t);
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
    countdown,
    contestId,
    getPostPrecheckRoute,
    navigate,
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
