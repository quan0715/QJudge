import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  InlineNotification,
  Stack,
  ProgressIndicator,
  ProgressStep,
  Tile,
} from "@carbon/react";
import {
  Checkmark,
  WarningAlt,
  Screen,
  FitToScreen,
  Cursor_1 as CursorIcon,
  ArrowRight,
} from "@carbon/icons-react";
import { requestFullscreen, isFullscreen, exitFullscreen } from "@/core/usecases/exam";
import ExamCountdownOverlay from "@/features/contest/components/exam/ExamCountdownOverlay";
import { usePaperExamFlow } from "./usePaperExamFlow";
import {
  hasExamPrecheckPassed,
  markExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks/useExamPrecheckGate";
import {
  getPostPrecheckPath,
  getContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import {
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS,
  EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS,
  EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
  EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import styles from "./ExamPrecheck.module.scss";

type CheckStatus = "pending" | "running" | "pass" | "fail";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

type ScreenDetailsLike = { screens?: unknown[] };
type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

const COUNTDOWN_SECONDS = 3;
const DISPLAY_SAMPLE_INTERVAL_MS =
  EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS;
const DISPLAY_SAMPLE_COUNT =
  Math.ceil(
    EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS / DISPLAY_SAMPLE_INTERVAL_MS
  ) + 1;
const PRECHECK_INTERACTION_TIMEOUT_MS = 5000;
const PRECHECK_SCREEN_DETAILS_TIMEOUT_MS = 2500;
const PRECHECK_FULLSCREEN_TIMEOUT_MS = 6000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const isScreenExtended = (): boolean => {
  const screenWithExtended = window.screen as Screen & { isExtended?: boolean };
  return screenWithExtended.isExtended === true;
};

const getPermissionState = async (): Promise<string | null> => {
  if (!navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({
      name: "window-management" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
};

type DisplayDiagnostics = {
  supportsScreenDetails: boolean;
  screenCount: number | null;
  isExtended: boolean;
  permissionState: string | null;
  errorMessage: string | null;
};

const detectDisplayDiagnostics = async (): Promise<DisplayDiagnostics> => {
  const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
  const supportsScreenDetails = typeof getScreenDetails === "function";
  const permissionState = await withTimeout(
    getPermissionState(),
    PRECHECK_SCREEN_DETAILS_TIMEOUT_MS,
    "Permission query timeout"
  ).catch(() => null);
  const extended = isScreenExtended();

  if (!supportsScreenDetails) {
    return {
      supportsScreenDetails,
      screenCount: null,
      isExtended: extended,
      permissionState,
      errorMessage: "Screen Details API unavailable",
    };
  }

  try {
    const details = await withTimeout(
      getScreenDetails(),
      PRECHECK_SCREEN_DETAILS_TIMEOUT_MS,
      "getScreenDetails timeout"
    );
    return {
      supportsScreenDetails,
      screenCount: Array.isArray(details?.screens) ? details.screens.length : null,
      isExtended: extended,
      permissionState,
      errorMessage: null,
    };
  } catch (error) {
    return {
      supportsScreenDetails,
      screenCount: null,
      isExtended: extended,
      permissionState,
      errorMessage:
        error instanceof Error ? error.message : "Failed to fetch screen details",
    };
  }
};

const ExamPrecheckScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const debugEnabled = searchParams.get("debug_precheck") === "1";
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
    { id: "screen", label: "單螢幕檢查", status: "pending" },
    { id: "fullscreen", label: "全螢幕測試", status: "pending" },
    { id: "focus", label: "焦點偵測測試", status: "pending" },
    { id: "interaction", label: "互動輸入檢查", status: "pending" },
  ]);
  const [envTestDone, setEnvTestDone] = useState(false);
  const [envTestRunning, setEnvTestRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startGuardError, setStartGuardError] = useState<string | null>(null);
  const [displayDiagnostics, setDisplayDiagnostics] = useState<DisplayDiagnostics | null>(null);
  const [debugUpdatedAt, setDebugUpdatedAt] = useState<string>("");
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerInteractionAtRef = useRef<number>(0);
  const lastKeyInteractionAtRef = useRef<number>(0);

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

  // Keep precheck-gate in sync with server status.
  useEffect(() => {
    if (!contest || !contestId) return;
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);

    // Only skip precheck when this tab/session already passed precheck and exam is active.
    // Paused (freshly unlocked) must re-run precheck before resuming.
    if (
      contest.examStatus === "in_progress" &&
      hasExamPrecheckPassed(contestId)
    ) {
      navigate(getPostPrecheckRoute(), { replace: true });
    }
  }, [contest, contestId, getPostPrecheckRoute, navigate]);

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

  const refreshDisplayDiagnostics = useCallback(async () => {
    if (!debugEnabled) return;
    const diagnostics = await detectDisplayDiagnostics();
    setDisplayDiagnostics(diagnostics);
    setDebugUpdatedAt(new Date().toLocaleTimeString("zh-TW"));
  }, [debugEnabled]);

  useEffect(() => {
    if (!debugEnabled) return;
    void refreshDisplayDiagnostics();
    const timer = window.setInterval(() => {
      void refreshDisplayDiagnostics();
    }, 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, [debugEnabled, refreshDisplayDiagnostics]);

  // Step 2: Environment checks
  const runEnvChecks = useCallback(async () => {
    if (envTestRunning) return;
    setEnvTestRunning(true);
    setEnvChecks([
      { id: "screen", label: "單螢幕檢查", status: "pending" },
      { id: "fullscreen", label: "全螢幕測試", status: "pending" },
      { id: "focus", label: "焦點偵測測試", status: "pending" },
      { id: "interaction", label: "互動輸入檢查", status: "pending" },
    ]);
    setEnvTestDone(false);

    try {
      // Ensure display diagnostics are measured in windowed mode.
      // Some browsers may report inconsistent display info while fullscreen.
      if (isFullscreen()) {
        try {
          await withTimeout(exitFullscreen(), PRECHECK_FULLSCREEN_TIMEOUT_MS, "exitFullscreen timeout");
          await sleep(250);
        } catch {
          // Keep going with diagnostics even if exit fails.
        }
      }

      await sleep(600);
      updateCheck(setEnvChecks, "screen", "running");
      // Align with runtime monitoring cadence: sample immediately, then follow the
      // same interaction/interval rhythm.
      await sleep(EXAM_MONITORING_FOCUS_CHECK_DELAY_MS);
      let screenCheckPassed = false;
      try {
        const diagnosticsSamples: DisplayDiagnostics[] = [];
        for (let i = 0; i < DISPLAY_SAMPLE_COUNT; i += 1) {
          diagnosticsSamples.push(await detectDisplayDiagnostics());
          if (i < DISPLAY_SAMPLE_COUNT - 1) {
            await sleep(DISPLAY_SAMPLE_INTERVAL_MS);
          }
        }
        const diagnostics =
          diagnosticsSamples[diagnosticsSamples.length - 1] ?? (await detectDisplayDiagnostics());
        const hasAnyMultiDisplay = diagnosticsSamples.some(
          (sample) => (sample.screenCount !== null && sample.screenCount > 1) || sample.isExtended
        );
        const hasAnyScreenDetailsSupport = diagnosticsSamples.some(
          (sample) => sample.supportsScreenDetails
        );
        const allSamplesReadableScreenCount = diagnosticsSamples.every(
          (sample) => sample.screenCount !== null
        );

        if (debugEnabled) {
          setDisplayDiagnostics(diagnostics);
          setDebugUpdatedAt(new Date().toLocaleTimeString("zh-TW"));
        }

        if (!hasAnyScreenDetailsSupport) {
          updateCheck(
            setEnvChecks,
            "screen",
            "fail",
            "瀏覽器不支援單螢幕檢測 API。請改用最新版 Chrome/Edge 後重試。"
          );
        } else if (!allSamplesReadableScreenCount) {
          updateCheck(
            setEnvChecks,
            "screen",
            "fail",
            "螢幕檢測結果不穩定，請確認已允許瀏覽器螢幕權限並關閉可能干擾的外掛後重試。"
          );
        } else if (hasAnyMultiDisplay) {
          updateCheck(
            setEnvChecks,
            "screen",
            "fail",
            "偵測到多個實體顯示器，請僅保留單螢幕後重試。多個瀏覽器分頁不會被視為多螢幕。"
          );
        } else {
          updateCheck(
            setEnvChecks,
            "screen",
            "pass",
            "單螢幕環境。提醒：多個瀏覽器分頁不會被視為多螢幕。"
          );
          screenCheckPassed = true;
        }
      } catch {
        updateCheck(
          setEnvChecks,
          "screen",
          "fail",
          "無法取得螢幕檢測權限，請允許瀏覽器螢幕權限並重新測試。"
        );
      }

      if (!screenCheckPassed) {
        updateCheck(
          setEnvChecks,
          "fullscreen",
          "fail",
          "需先通過單螢幕檢查，才可進行全螢幕測試。"
        );
        updateCheck(
          setEnvChecks,
          "focus",
          "fail",
          "需先通過單螢幕檢查，才可進行焦點測試。"
        );
        updateCheck(
          setEnvChecks,
          "interaction",
          "fail",
          "需先通過單螢幕檢查，才可進行互動輸入檢查。"
        );
        return;
      }

      await sleep(800);
      updateCheck(setEnvChecks, "fullscreen", "running");
      await sleep(150);
      try {
        const enteredFullscreen = await withTimeout(
          requestFullscreen(),
          PRECHECK_FULLSCREEN_TIMEOUT_MS,
          "requestFullscreen timeout"
        );
        await sleep(250);
        if (enteredFullscreen && isFullscreen()) {
          updateCheck(setEnvChecks, "fullscreen", "pass", "全螢幕正常運作");
        } else {
          updateCheck(
            setEnvChecks,
            "fullscreen",
            "fail",
            "全螢幕未啟用。請點擊頁面後重試，並確認瀏覽器允許全螢幕。"
          );
        }
      } catch {
        updateCheck(
          setEnvChecks,
          "fullscreen",
          "fail",
          "全螢幕檢查逾時或失敗。請點一下頁面後重試，並確認瀏覽器允許全螢幕。"
        );
      }

      await sleep(700);
      updateCheck(setEnvChecks, "focus", "running");
      await sleep(EXAM_MONITORING_FOCUS_CHECK_DELAY_MS);
      let hasFocus = document.hasFocus();
      if (!hasFocus) {
        const focusDeadline = Date.now() + EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS;
        while (Date.now() < focusDeadline) {
          await sleep(100);
          hasFocus = document.hasFocus();
          if (hasFocus) break;
        }
      }
      if (hasFocus) {
        updateCheck(
          setEnvChecks,
          "focus",
          "pass",
          "視窗焦點正常。提醒：切換到其他分頁會觸發焦點離開事件。"
        );
      } else {
        updateCheck(
          setEnvChecks,
          "focus",
          "fail",
          "目前頁面未取得焦點，請先點擊此頁面後重試。"
        );
      }

      await sleep(600);
      updateCheck(
        setEnvChecks,
        "interaction",
        "running",
        "請在 5 秒內按任意鍵，確認鍵盤互動可被系統正確辨識。"
      );
      const interactionCheckStartAt = Date.now();
      // The "開始環境測試" button click counts as a pointer interaction baseline.
      lastPointerInteractionAtRef.current = interactionCheckStartAt;
      let hasPointerInteraction = true;
      let hasKeyboardInteraction = lastKeyInteractionAtRef.current >= interactionCheckStartAt;
      const interactionCheckDeadline = interactionCheckStartAt + PRECHECK_INTERACTION_TIMEOUT_MS;

      while (Date.now() < interactionCheckDeadline && !hasKeyboardInteraction) {
        await sleep(120);
        hasPointerInteraction =
          hasPointerInteraction || lastPointerInteractionAtRef.current >= interactionCheckStartAt;
        hasKeyboardInteraction = lastKeyInteractionAtRef.current >= interactionCheckStartAt;
      }

      if (hasPointerInteraction && hasKeyboardInteraction) {
        updateCheck(
          setEnvChecks,
          "interaction",
          "pass",
          "已偵測按鈕點擊與鍵盤輸入。一般頁面操作不會被誤判為作弊。"
        );
      } else if (!hasKeyboardInteraction) {
        updateCheck(
          setEnvChecks,
          "interaction",
          "fail",
          "未偵測到鍵盤輸入，請按任意鍵後重新測試。"
        );
      } else {
        updateCheck(
          setEnvChecks,
          "interaction",
          "fail",
          "未偵測到按鈕/滑鼠互動，請點擊頁面後重新測試。"
        );
      }
    } finally {
      setEnvTestDone(true);
      setEnvTestRunning(false);
    }
  }, [debugEnabled, envTestRunning]);

  useEffect(() => {
    const handlePointerInteraction = () => {
      lastPointerInteractionAtRef.current = Date.now();
    };
    const handleKeyboardInteraction = () => {
      lastKeyInteractionAtRef.current = Date.now();
    };

    document.addEventListener("pointerdown", handlePointerInteraction, true);
    document.addEventListener("keydown", handleKeyboardInteraction, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerInteraction, true);
      document.removeEventListener("keydown", handleKeyboardInteraction, true);
    };
  }, []);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const handleStart = useCallback(async () => {
    setStartGuardError(null);
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
      return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
    }
    (async () => {
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
  }, [countdown, contestId, getPostPrecheckRoute, navigate, startSession]);

  const renderCheckList = (items: CheckItem[]) => (
    <div className={styles.checkList}>
      {items.map((item) => (
        <div key={item.id} className={styles.checkItem} data-status={item.status}>
          <div className={styles.checkIcon}>
            {item.status === "pass" && (
              <Checkmark size={20} style={{ color: "var(--cds-support-success)" }} />
            )}
            {item.status === "fail" && (
              <WarningAlt size={20} style={{ color: "var(--cds-support-error)" }} />
            )}
            {item.status === "pending" && <div className={styles.checkIconPending} />}
            {item.status === "running" && <div className={styles.checkIconRunning} />}
          </div>
          <div style={{ flex: 1 }}>
            <div className={styles.checkLabel}>{item.label}</div>
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
          正式作答前，請完成以下三項驗證。若為多螢幕或未授權螢幕檢測，將無法開始考試。
        </p>

        {debugEnabled && (
          <Tile style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "0.75rem" }}>
              <strong>Precheck Debug</strong>
              <Button kind="ghost" size="sm" onClick={() => void refreshDisplayDiagnostics()}>
                重新偵測
              </Button>
            </div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: "0.75rem", lineHeight: 1.5 }}>
              <div>supportsScreenDetails: {String(displayDiagnostics?.supportsScreenDetails ?? false)}</div>
              <div>permission(window-management): {displayDiagnostics?.permissionState ?? "unknown"}</div>
              <div>screenCount: {displayDiagnostics?.screenCount ?? "null"}</div>
              <div>isExtended: {String(displayDiagnostics?.isExtended ?? false)}</div>
              <div>error: {displayDiagnostics?.errorMessage ?? "none"}</div>
              <div>updatedAt: {debugUpdatedAt || "not yet"}</div>
            </div>
          </Tile>
        )}

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
            title="全螢幕啟用失敗"
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
                  單螢幕檢查只會判斷「實體顯示器數量」，不會把多個瀏覽器分頁視為多螢幕。
                  此步驟需要瀏覽器支援與授權螢幕檢測 API，建議使用最新版 Chrome / Edge。
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
