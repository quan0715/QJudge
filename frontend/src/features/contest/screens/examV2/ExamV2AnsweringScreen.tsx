import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, InlineNotification, Stack, Tag } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { useInterval } from "@/shared/hooks/useInterval";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2AnsweringScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, heartbeat } = useExamV2Flow();
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);

  const isInProgress = contest?.examStatus === "in_progress";

  const endTimeText = contest?.endTime
    ? new Date(contest.endTime).toLocaleString()
    : "未設定";

  const sendHeartbeatNow = async () => {
    try {
      await heartbeat();
      setLastHeartbeatAt(new Date().toLocaleTimeString());
      setHeartbeatError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Heartbeat 失敗";
      setHeartbeatError(message);
    }
  };

  useInterval(() => {
    void sendHeartbeatNow();
  }, isInProgress ? 30000 : null);

  return (
    <ExamFlowTemplateScreen
      stepKey="answering"
      title="Exam v2：單頁連續作答"
      description="所有題目同頁呈現，學生可以連續作答，不需要逐題切換頁面。"
      bullets={[
        "此頁會每 30 秒送出 heartbeat（in_progress 時）。",
        "目前題目內容沿用既有 contest problem API。",
        "下一步交卷前檢查可手動提交 exam/end。",
      ]}
      notice="目前後端尚未提供 paper 題型作答 API；先串 exam session API 與監控心跳。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={isInProgress ? "green" : "gray"}>
              {isInProgress ? "作答中" : `狀態：${contest?.examStatus || "not_started"}`}
            </Tag>
            <Tag type="blue">{`結束時間：${endTimeText}`}</Tag>
            <Tag type="teal">
              {lastHeartbeatAt
                ? `最後心跳：${lastHeartbeatAt}`
                : "尚未送出 heartbeat"}
            </Tag>
          </div>

          {heartbeatError ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="心跳異常"
              subtitle={heartbeatError}
            />
          ) : null}

          {!isInProgress ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="尚未開始作答"
              subtitle="請先完成考前檢查並開始考試。"
            />
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              kind="secondary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}?tab=problems`)
              }
            >
              進入題目區
            </Button>
            <Button kind="tertiary" disabled={!isInProgress} onClick={sendHeartbeatNow}>
              立即送出 Heartbeat
            </Button>
            <Button
              kind="primary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}/exam-v2/submit-review`)
              }
            >
              前往交卷前檢查
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2AnsweringScreen;
