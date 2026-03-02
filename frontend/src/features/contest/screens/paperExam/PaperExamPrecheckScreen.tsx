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
  Checkmark,
  WarningAlt,
  Screen,
  FitToScreen,
  Cursor_1 as CursorIcon,
  ArrowRight,
} from "@carbon/icons-react";
import { requestFullscreen } from "@/features/contest/hooks/useContestExamActions";
import ExamCountdownOverlay from "@/features/contest/components/exam/ExamCountdownOverlay";
import { usePaperExamFlow } from "./usePaperExamFlow";
import {
  hasPaperExamPrecheckPassed,
  markPaperExamPrecheckPassed,
  syncPaperExamPrecheckGateByStatus,
} from "./hooks/precheckGate";
import styles from "./PaperExamPrecheck.module.scss";

type CheckStatus = "pending" | "running" | "pass" | "fail";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

type ScreenDetailsLike = { screens?: unknown[] };

const COUNTDOWN_SECONDS = 3;

const PaperExamPrecheckScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, startSession } =
    usePaperExamFlow();

  const [currentStep, setCurrentStep] = useState(0);
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "auth", label: "身份驗證", status: "pending" },
    { id: "submitted", label: "交卷記錄檢查", status: "pending" },
  ]);
  const [envChecks, setEnvChecks] = useState<CheckItem[]>([
    { id: "screen", label: "單螢幕檢查", status: "pending" },
    { id: "fullscreen", label: "全螢幕測試", status: "pending" },
    { id: "focus", label: "焦點偵測測試", status: "pending" },
  ]);
  const [envTestDone, setEnvTestDone] = useState(false);
  const [envTestRunning, setEnvTestRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    syncPaperExamPrecheckGateByStatus(contestId, contest.examStatus);

    // Only skip precheck when this tab/session already passed precheck and exam is active.
    // Paused (freshly unlocked) must re-run precheck before resuming.
    if (
      contest.examStatus === "in_progress" &&
      hasPaperExamPrecheckPassed(contestId)
    ) {
      navigate(`/contests/${contestId}/paper-exam/answering`, { replace: true });
    }
  }, [contest, contestId, navigate]);

  // Step 1: Identity verification
  useEffect(() => {
    if (currentStep !== 0 || !contest) return;

    updateCheck(setChecks, "auth", "pass", "已通過 NYCU OAuth 驗證");

    if (contest.examStatus === "submitted") {
      updateCheck(setChecks, "submitted", "fail", "已有交卷記錄，無法重複考試");
    } else {
      updateCheck(setChecks, "submitted", "pass", "無交卷記錄");
    }
  }, [currentStep, contest]);

  const step1AllPass = checks.every((c) => c.status === "pass");

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Step 2: Environment checks
  const runEnvChecks = useCallback(async () => {
    if (envTestRunning) return;
    setEnvTestRunning(true);
    setEnvChecks([
      { id: "screen", label: "單螢幕檢查", status: "pending" },
      { id: "fullscreen", label: "全螢幕測試", status: "pending" },
      { id: "focus", label: "焦點偵測測試", status: "pending" },
    ]);
    setEnvTestDone(false);

    await delay(600);
    updateCheck(setEnvChecks, "screen", "running");
    await delay(1200);
    try {
      const getScreenDetails =
        "getScreenDetails" in window
          ? (
              window as Window & {
                getScreenDetails?: () => Promise<ScreenDetailsLike>;
              }
            ).getScreenDetails
          : undefined;

      if (!getScreenDetails) {
        updateCheck(
          setEnvChecks,
          "screen",
          "pass",
          "瀏覽器未提供螢幕檢測 API，已改用全螢幕與焦點監控。多個分頁不會視為多螢幕。"
        );
      } else {
        const screenDetails = await getScreenDetails();
        const screenCount = Array.isArray(screenDetails?.screens)
          ? screenDetails.screens.length
          : 1;
        if (screenCount > 1) {
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
        }
      }
    } catch {
      updateCheck(
        setEnvChecks,
        "screen",
        "pass",
        "無法取得螢幕檢測權限，已改用全螢幕與焦點監控。多個分頁不會視為多螢幕。"
      );
    }

    await delay(1500);
    updateCheck(setEnvChecks, "fullscreen", "running");
    await delay(800);
    try {
      await requestFullscreen();
      await delay(500);
      updateCheck(setEnvChecks, "fullscreen", "pass", "全螢幕正常運作");
    } catch {
      updateCheck(
        setEnvChecks,
        "fullscreen",
        "fail",
        "無法進入全螢幕，請確認瀏覽器允許全螢幕並關閉會阻擋全螢幕的外掛。"
      );
    }

    await delay(1500);
    updateCheck(setEnvChecks, "focus", "running");
    await delay(800);
    let hasFocus = document.hasFocus();
    if (!hasFocus) {
      for (let i = 0; i < 3; i++) {
        await delay(500);
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

    setEnvTestDone(true);
    setEnvTestRunning(false);
  }, [envTestRunning]);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const handleStart = useCallback(async () => {
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
      if (!document.fullscreenElement) await requestFullscreen();
      markPaperExamPrecheckPassed(contestId);
      navigate(`/contests/${contestId}/paper-exam/answering`);
    })();
  }, [countdown, contestId, navigate, startSession]);

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
        <h2 style={{ marginBottom: "0.5rem" }}>考前檢查</h2>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
          正式作答前，請完成以下三項驗證。
        </p>

        <ProgressIndicator currentIndex={currentStep} spaceEqually style={{ marginBottom: "2rem" }}>
          <ProgressStep label="身份驗證" />
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

        {currentStep === 0 && (
          <div className={styles.stepContent} key="step-0">
            <Stack gap={5}>
              <Tile>
                <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <CursorIcon size={20} /> 身份與資格驗證
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
                  若瀏覽器不支援螢幕檢測 API，系統會改用全螢幕與焦點監控。
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

export default PaperExamPrecheckScreen;
