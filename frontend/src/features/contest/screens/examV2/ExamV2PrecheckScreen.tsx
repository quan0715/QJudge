import React, { useState, useEffect, useCallback } from "react";
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
import { useExamV2Flow } from "./useExamV2Flow";

type CheckStatus = "pending" | "running" | "pass" | "fail";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

const ExamV2PrecheckScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, startSession } =
    useExamV2Flow();

  const [currentStep, setCurrentStep] = useState(0);
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "auth", label: "身份驗證", status: "pending" },
    { id: "enrollment", label: "考試名單確認", status: "pending" },
    { id: "submitted", label: "交卷記錄檢查", status: "pending" },
  ]);
  const [envChecks, setEnvChecks] = useState<CheckItem[]>([
    { id: "screen", label: "單螢幕檢查", status: "pending" },
    { id: "fullscreen", label: "全螢幕測試", status: "pending" },
    { id: "focus", label: "焦點偵測測試", status: "pending" },
  ]);
  const [envTestDone, setEnvTestDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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

  // Step 1: Identity verification
  useEffect(() => {
    if (currentStep !== 0 || !contest) return;

    updateCheck(setChecks, "auth", "pass", "已通過 NYCU OAuth 驗證");

    if (contest.isRegistered) {
      updateCheck(setChecks, "enrollment", "pass", "已在考試名單中");
    } else {
      updateCheck(setChecks, "enrollment", "fail", "尚未報名，請先完成報名");
    }

    if (contest.examStatus === "submitted") {
      updateCheck(setChecks, "submitted", "fail", "已有交卷記錄，無法重複考試");
    } else {
      updateCheck(setChecks, "submitted", "pass", "無交卷記錄");
    }
  }, [currentStep, contest]);

  const step1AllPass = checks.every((c) => c.status === "pass");

  // Step 2: Environment checks
  const runEnvChecks = useCallback(async () => {
    updateCheck(setEnvChecks, "screen", "running");
    const isExtended = (window.screen as any).isExtended;
    if (isExtended) {
      updateCheck(setEnvChecks, "screen", "fail", "偵測到多螢幕，請僅使用單螢幕");
    } else {
      updateCheck(setEnvChecks, "screen", "pass", "單螢幕環境");
    }

    updateCheck(setEnvChecks, "fullscreen", "running");
    try {
      await requestFullscreen();
      updateCheck(setEnvChecks, "fullscreen", "pass", "全螢幕正常運作");
    } catch {
      updateCheck(setEnvChecks, "fullscreen", "fail", "無法進入全螢幕，請檢查瀏覽器設定");
    }

    updateCheck(setEnvChecks, "focus", "running");
    if (document.hasFocus()) {
      updateCheck(setEnvChecks, "focus", "pass", "視窗焦點正常");
    } else {
      updateCheck(setEnvChecks, "focus", "fail", "視窗未獲得焦點");
    }

    setEnvTestDone(true);
  }, []);

  const envAllPass = envChecks.every((c) => c.status === "pass");

  const handleStart = async () => {
    const started = await startSession();
    if (!started || !contestId) return;
    if (!document.fullscreenElement) await requestFullscreen();
    navigate(`/contests/${contestId}/exam-v2/answering`);
  };

  const renderCheckList = (items: CheckItem[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            background: "var(--cds-layer-01)",
            borderRadius: "4px",
          }}
        >
          {item.status === "pass" && (
            <Checkmark size={20} style={{ color: "var(--cds-support-success)" }} />
          )}
          {item.status === "fail" && (
            <WarningAlt size={20} style={{ color: "var(--cds-support-error)" }} />
          )}
          {(item.status === "pending" || item.status === "running") && (
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "2px solid var(--cds-border-subtle-01)",
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{item.label}</div>
            {item.detail && (
              <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginTop: "0.125rem" }}>
                {item.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
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
        <Stack gap={5}>
          <Tile>
            <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CursorIcon size={20} /> 身份與資格驗證
            </h4>
            {renderCheckList(checks)}
          </Tile>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
      )}

      {currentStep === 1 && (
        <Stack gap={5}>
          <Tile>
            <h4 style={{ marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Screen size={20} /> 環境檢查
            </h4>
            {renderCheckList(envChecks)}
          </Tile>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Button kind="secondary" onClick={() => setCurrentStep(0)}>
              上一步
            </Button>
            {!envTestDone ? (
              <Button kind="primary" renderIcon={FitToScreen} onClick={runEnvChecks}>
                開始環境測試
              </Button>
            ) : envAllPass ? (
              <Button kind="primary" renderIcon={ArrowRight} onClick={() => setCurrentStep(2)}>
                下一步：確認開始
              </Button>
            ) : (
              <Button kind="primary" renderIcon={FitToScreen} onClick={() => { setEnvTestDone(false); runEnvChecks(); }}>
                重新測試
              </Button>
            )}
          </div>
        </Stack>
      )}

      {currentStep === 2 && (
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
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Button kind="secondary" onClick={() => setCurrentStep(1)}>
              上一步
            </Button>
            <Button
              kind="danger"
              disabled={loading || confirmed}
              onClick={() => {
                setConfirmed(true);
                handleStart();
              }}
            >
              {loading ? "正在進入考場..." : "確認開始考試"}
            </Button>
          </div>
        </Stack>
      )}
    </div>
  );
};

export default ExamV2PrecheckScreen;
