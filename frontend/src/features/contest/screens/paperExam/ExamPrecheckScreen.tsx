import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
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

const requestMonitorScreenShare = async (): Promise<{
  granted: boolean;
  displaySurface: string | null;
  detail: string;
}> => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return {
      granted: false,
      displaySurface: null,
      detail: "瀏覽器不支援螢幕分享 API，請改用最新版 Chrome / Edge。",
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
          ? "已確認分享來源為整個螢幕。"
          : displaySurface
            ? "已完成螢幕分享授權（目前來源非整個螢幕，將依多螢幕規則檢核）。"
            : "已完成螢幕分享授權（瀏覽器未回報 displaySurface，將以規則持續監控）。",
    };
  } catch {
    clearPrecheckScreenShareHandoff(true);
    return {
      granted: false,
      displaySurface: null,
      detail: "未完成螢幕分享授權，請允許分享整個螢幕後重試。",
    };
  }
};

const ExamPrecheckScreen: React.FC = () => {
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
    { id: "participation", label: "參賽狀態檢查", status: "pending" },
    { id: "submitted", label: "交卷記錄檢查", status: "pending" },
  ]);
  const [envChecks, setEnvChecks] = useState<CheckItem[]>([
    { id: "singleMonitor", label: "單螢幕檢查", status: "pending" },
    { id: "shareScreen", label: "分享螢幕", status: "pending" },
    { id: "fullscreen", label: "全螢幕測試", status: "pending" },
    { id: "interaction", label: "互動輸入檢查", status: "pending" },
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
      label: "等待執行",
      color: "var(--cds-text-secondary)",
      Icon: Time,
    },
    running: {
      label: "測試中",
      color: "var(--cds-support-info)",
      Icon: InProgress,
    },
    pass: {
      label: "成功",
      color: "var(--cds-support-success)",
      Icon: CheckmarkFilled,
    },
    fail: {
      label: "失敗",
      color: "var(--cds-support-error)",
      Icon: ErrorFilled,
    },
    blocked: {
      label: "未通過",
      color: "var(--cds-support-warning)",
      Icon: WarningAlt,
    },
  };

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

    // 參賽狀態檢查（取代原本的 NYCU OAuth 驗證）
    if (contest.examStatus) {
      updateCheck(setChecks, "participation", "pass", "已確認參賽資格");
    } else {
      updateCheck(setChecks, "participation", "fail", "尚未取得參賽資格");
    }

    // 交卷記錄檢查：依據 contest 是否允許重複入場
    if (contest.examStatus === "submitted") {
      if (contest.allowMultipleJoins) {
        updateCheck(setChecks, "submitted", "pass", "已有交卷記錄，但本場考試允許重複入場");
      } else {
        updateCheck(setChecks, "submitted", "fail", "已有交卷記錄，無法重複考試");
      }
    } else {
      updateCheck(setChecks, "submitted", "pass", "無交卷記錄");
    }
  }, [currentStep, contest]);

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
      { id: "singleMonitor", label: "單螢幕檢查", status: "pending" },
      { id: "shareScreen", label: "分享螢幕", status: "pending" },
      { id: "fullscreen", label: "全螢幕測試", status: "pending" },
      { id: "interaction", label: "互動輸入檢查", status: "pending" },
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
      markBlocked("fullscreen", "需先通過分享螢幕檢查。");
      markBlocked("interaction", "需先通過分享螢幕檢查。");
      clearPrecheckScreenShareHandoff(true);
    };
    const blockRemainingAfterSingleMonitor = (detail: string) => {
      markBlocked("shareScreen", detail);
      markBlocked("fullscreen", detail);
      markBlocked("interaction", detail);
      clearPrecheckScreenShareHandoff(true);
    };

    try {
      markRunning("singleMonitor", "檢測中...");
      const diagnostics = await displayService.check();

      if (!diagnostics.supportsScreenDetails) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          "[阻擋] 你的瀏覽器不支援考場要求的監控技術。請改用最新版的 Google Chrome 或 Microsoft Edge。"
        );
        blockRemainingAfterSingleMonitor("需先通過單螢幕檢查。");
        return;
      }

      if (diagnostics.screenCount === null) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          "[阻擋] 系統無法取得螢幕數量。請確認你在彈出的視窗中選擇了「允許」，並關閉阻擋追蹤的外掛後重試。"
        );
        blockRemainingAfterSingleMonitor("需先通過單螢幕檢查。");
        return;
      }

      if (diagnostics.isExtended || diagnostics.screenCount > 1) {
        await finalizeCheck(
          "singleMonitor",
          "fail",
          `[阻擋] 偵測到多個實體顯示器 (${diagnostics.screenCount} 個)。為確保公平，請拔除或關閉外接螢幕後重試。`
        );
        blockRemainingAfterSingleMonitor("需先通過單螢幕檢查。");
        return;
      }

      await finalizeCheck(
        "singleMonitor",
        "pass",
        "已確認為單一螢幕環境。"
      );

      markRunning("shareScreen", "請於彈窗選擇整個螢幕。");
      const shareResult = await requestMonitorScreenShare();
      if (!shareResult.granted) {
        await failShareAndBlock(`[阻擋] ${shareResult.detail}`);
        return;
      }

      // Recheck after user selected the shared screen to avoid stale pre-share state.
      await sleep(PRECHECK_SHARE_RECHECK_DELAY_MS);
      const diagnosticsAfterShare = await displayService.check();
      if (diagnosticsAfterShare.screenCount === null) {
        await failShareAndBlock("[阻擋] 分享後無法確認螢幕數量。請關閉 Sidecar/外接螢幕並重試。");
        return;
      }
      if (diagnosticsAfterShare.isExtended || diagnosticsAfterShare.screenCount > 1) {
        await failShareAndBlock(
          `[阻擋] 分享後仍偵測到多螢幕 (${diagnosticsAfterShare.screenCount} 個)。請先關閉 Sidecar/外接螢幕。`
        );
        return;
      }

      const isMonitorSurface = shareResult.displaySurface === "monitor";
      if (!isMonitorSurface) {
        await failShareAndBlock(
          "[阻擋] 必須選擇分享「整個螢幕 (monitor)」，不允許僅分享視窗、分頁或未知來源。"
        );
        return;
      } else {
        await finalizeCheck(
          "shareScreen",
          "pass",
          "已成功分享整個螢幕畫面。"
        );
      }

      markRunning("fullscreen", "啟用全螢幕中...");
      try {
        const enteredFullscreen = await withTimeout(
          requestFullscreen(),
          PRECHECK_FULLSCREEN_TIMEOUT_MS,
          "requestFullscreen timeout"
        );
        if (enteredFullscreen && isFullscreen()) {
          await finalizeCheck("fullscreen", "pass", "全螢幕啟用成功。");
        } else {
          await finalizeCheck(
            "fullscreen",
            "fail",
            "無法啟用全螢幕，請允許瀏覽器全螢幕後重試。"
          );
          markBlocked("interaction", "需先通過全螢幕測試。");
          return;
        }
      } catch {
        await finalizeCheck("fullscreen", "fail", "全螢幕檢查逾時，請重試。");
        markBlocked("interaction", "需先通過全螢幕測試。");
        return;
      }

      markRunning("interaction", "檢查頁面焦點與近期輸入...");
      const hasRecentInput =
        Date.now() - lastInteractionAtRef.current <= PRECHECK_RECENT_INTERACTION_WINDOW_MS;
      if (!document.hasFocus()) {
        await finalizeCheck("interaction", "fail", "請先切回此頁面後重試。");
      } else if (!hasRecentInput) {
        await finalizeCheck(
          "interaction",
          "fail",
          "未偵測到近期輸入，請先點擊頁面或按下任意鍵後重試。"
        );
      } else {
        await finalizeCheck("interaction", "pass", "已偵測到互動輸入。");
      }

    } finally {
      setEnvTestDone(true);
      setEnvTestRunning(false);
    }
  }, [envTestRunning]);

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
            return {
              ...item,
              status: "blocked" as const,
              detail: `需先通過「${failure.checkId === "singleMonitor" ? "單螢幕檢查" : failure.checkId === "shareScreen" ? "分享螢幕" : failure.checkId === "fullscreen" ? "全螢幕測試" : "互動輸入檢查"}」。`,
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
    []
  );

  const runStartPreflightValidation = useCallback(async (): Promise<PreflightValidationFailure | null> => {
    const diagnostics = await displayService.check();
    if (!diagnostics.supportsScreenDetails) {
      return {
        checkId: "singleMonitor",
        detail: "瀏覽器不支援螢幕管理檢測，請改用最新版 Chrome / Edge。",
        clearShareHandoff: true,
      };
    }
    if (diagnostics.screenCount === null) {
      return {
        checkId: "singleMonitor",
        detail: "無法確認螢幕數量，請重新執行環境檢查。",
        clearShareHandoff: true,
      };
    }
    if (diagnostics.isExtended || diagnostics.screenCount > 1) {
      return {
        checkId: "singleMonitor",
        detail: `目前偵測到多螢幕 (${diagnostics.screenCount} 個)，請先關閉外接螢幕後重試。`,
        clearShareHandoff: true,
      };
    }

    const handoffStream = peekPrecheckScreenShareHandoff();
    if (!handoffStream) {
      return {
        checkId: "shareScreen",
        detail: "螢幕分享已失效，請回到上一步重新完成分享螢幕檢查。",
        clearShareHandoff: true,
      };
    }
    const track = handoffStream.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") {
      return {
        checkId: "shareScreen",
        detail: "螢幕分享已中斷，請回到上一步重新完成分享螢幕檢查。",
        clearShareHandoff: true,
      };
    }
    const settings = (track.getSettings?.() || {}) as MediaTrackSettings & { displaySurface?: string };
    if (settings.displaySurface !== "monitor") {
      return {
        checkId: "shareScreen",
        detail: "目前分享來源不是整個螢幕 (monitor)，請回到上一步重新分享。",
        clearShareHandoff: true,
      };
    }

    if (!isFullscreen()) {
      return {
        checkId: "fullscreen",
        detail: "目前不是全螢幕模式，請回到上一步重新完成全螢幕檢查。",
      };
    }

    return null;
  }, []);

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
          setStartGuardError("無法進入全螢幕，請允許瀏覽器全螢幕後重新開始。");
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
        message={isStarting ? "考試即將開始" : "正在進入考場..."}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>考前檢查</h2>
          <Button kind="ghost" size="sm" onClick={handleBackToDashboard}>
            返回競賽主頁
          </Button>
        </div>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
          正式作答前，請完成以下檢查。若未通過螢幕分享或全螢幕檢查，將無法開始考試。
        </p>

        <ProgressIndicator currentIndex={currentStep} spaceEqually style={{ marginBottom: "2rem" }}>
          <ProgressStep label="資格確認" />
          <ProgressStep label="環境檢查" />
          <ProgressStep label="確認開始" />
        </ProgressIndicator>

        {error && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="錯誤"
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
            title="開始前檢查未通過"
            subtitle={startGuardError}
            style={{ marginBottom: "1rem" }}
          />
        )}

        {currentStep === 0 && (
          <div className={styles.stepContent} key="step-0">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <CursorIcon size={20} /> 參賽資格確認
                </h4>
                {renderCheckList(checks)}
              </Tile>
              <div className={styles.navRowEnd}>
                <Button
                  kind="primary"
                  renderIcon={ArrowRight}
                  disabled={!step1AllPass}
                  onClick={() => setCurrentStep(1)}
                >
                  下一步：環境檢查
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
                  <Screen size={20} /> 環境檢查
                </h4>
                <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--cds-text-secondary)", lineHeight: 1.6 }}>
                  <b>本考場採取嚴格環境限制：</b><br/>
                  1. 僅允許使用最新版 Google Chrome 或 Microsoft Edge。<br/>
                  2. 瀏覽器彈出「管理視窗與顯示器」權限時，必須點擊<b>【允許】</b>。<br/>
                  3. 必須為<b>單一實體螢幕</b>（請拔除外接顯示器）。<br/>
                  4. 畫面分享時必須選擇<b>【整個螢幕 (Entire Screen)】</b>。
                </p>
                {renderCheckList(envChecks)}
              </Tile>
              <div className={styles.navRow}>
                <Button kind="secondary" onClick={() => setCurrentStep(0)}>
                  上一步
                </Button>
                {!envTestDone ? (
                  <Button kind="primary" renderIcon={FitToScreen} onClick={runEnvChecks} disabled={envTestRunning}>
                    {envTestRunning ? "檢測中..." : "開始環境測試"}
                  </Button>
                ) : envAllPass ? (
                  <Button kind="primary" renderIcon={ArrowRight} onClick={() => setCurrentStep(2)}>
                    下一步：確認開始
                  </Button>
                ) : (
                  <Button kind="primary" renderIcon={FitToScreen} onClick={runEnvChecks} disabled={envTestRunning}>
                    重新測試
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
                <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>考試說明</h4>
                <ul style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
                  <li>考試期間請勿切換視窗或分頁，系統將記錄離開行為。</li>
                  <li>請保持全螢幕模式，退出全螢幕將觸發警告。</li>
                  <li>作答內容每 2 秒自動儲存，無需手動存檔。</li>
                  <li>考試時間結束後系統將自動交卷。</li>
                  {contest?.endTime && (
                    <li>
                      考試截止時間：{new Date(contest.endTime).toLocaleString("zh-TW")}
                    </li>
                  )}
                </ul>
              </Tile>
              <div className={styles.navRow}>
                <Button kind="secondary" onClick={() => setCurrentStep(1)}>
                  上一步
                </Button>
                <Button
                  kind="danger"
                  disabled={loading}
                  onClick={handleStart}
                >
                  確認開始考試
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
