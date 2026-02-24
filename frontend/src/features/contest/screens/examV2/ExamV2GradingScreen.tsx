import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, InlineNotification, Stack, Tag } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { useInterval } from "@/shared/hooks/useInterval";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2GradingScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, refreshContest } = useExamV2Flow();

  useInterval(() => {
    void refreshContest();
  }, 15000);

  return (
    <ExamFlowTemplateScreen
      stepKey="grading"
      title="Exam v2：批改中"
      description="交卷後進入批改等待狀態，發布前不顯示最終分數。"
      bullets={[
        "每 15 秒刷新一次 contest 狀態，等待批改進度更新。",
        "當結果尚未發布時，停留在批改中提示。",
        "可手動刷新或前往結果頁查看最新狀態。",
      ]}
      notice="目前後端尚未提供 grading queue API，此頁先以 contest 狀態輪詢呈現。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="teal">{`Exam 狀態：${contest?.examStatus || "not_started"}`}</Tag>
            <Tag type={contest?.status === "archived" ? "green" : "blue"}>
              {`Contest 狀態：${contest?.status || "draft"}`}
            </Tag>
          </div>

          {contest?.examStatus !== "submitted" ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="尚未完成交卷"
              subtitle="目前 exam_status 不是 submitted，請先返回交卷前檢查頁。"
            />
          ) : (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="批改中"
              subtitle="開放式題目仍由助教批改，最終成績以發布時間為準。"
            />
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button kind="secondary" onClick={() => void refreshContest()}>
              立即刷新
            </Button>
            <Button
              kind="primary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}/exam-v2/result`)
              }
            >
              前往結果頁
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2GradingScreen;
