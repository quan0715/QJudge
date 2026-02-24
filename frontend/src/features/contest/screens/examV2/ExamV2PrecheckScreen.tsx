import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, InlineNotification, Stack, Tag } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { requestFullscreen } from "@/features/contest/hooks/useContestExamActions";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2PrecheckScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, startSession } =
    useExamV2Flow();

  const canStart =
    !!contest?.isRegistered && contest?.examStatus !== "locked" && !loading;

  const handleStart = async () => {
    const started = await startSession();
    if (!started || !contestId) return;
    await requestFullscreen();
    navigate(`/contests/${contestId}/exam-v2/answering`);
  };

  return (
    <ExamFlowTemplateScreen
      stepKey="precheck"
      title="Exam v2：考前檢查"
      description="正式作答前執行環境檢查，確保裝置、網路與規範符合要求。"
      bullets={[
        "檢查網路與裝置狀態，避免進場後中斷。",
        "呼叫 `enter` + `exam/start` 啟動 exam session。",
        "進入作答頁後由心跳 API 維持監控狀態。",
      ]}
      notice="此頁已接上 `/contests/:id/enter/` 與 `/contests/:id/exam/start/`。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={navigator.onLine ? "green" : "red"}>
              {navigator.onLine ? "網路正常" : "目前離線"}
            </Tag>
            <Tag type={document.fullscreenElement ? "green" : "gray"}>
              {document.fullscreenElement ? "全螢幕中" : "尚未全螢幕"}
            </Tag>
            <Tag type="teal">{`Exam 狀態：${contest?.examStatus || "not_started"}`}</Tag>
          </div>

          {!contest?.isRegistered ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="尚未報名"
              subtitle="請先回到上一步完成報名，再開始考試。"
            />
          ) : null}

          {error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="無法開始"
              subtitle={error}
              onCloseButtonClick={clearError}
            />
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button kind="primary" disabled={!canStart} onClick={handleStart}>
              進入考場並開始
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2PrecheckScreen;
