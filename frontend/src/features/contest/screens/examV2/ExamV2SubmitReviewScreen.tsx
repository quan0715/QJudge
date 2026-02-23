import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, InlineNotification, Stack, Tag } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2SubmitReviewScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, submitExam } =
    useExamV2Flow();

  const canSubmit =
    contest?.examStatus === "in_progress" ||
    contest?.examStatus === "paused" ||
    contest?.examStatus === "locked";

  const handleSubmitExam = async () => {
    const success = await submitExam();
    if (!success || !contestId) return;
    navigate(`/contests/${contestId}/exam-v2/grading`);
  };

  return (
    <ExamFlowTemplateScreen
      stepKey="submit-review"
      title="Exam v2：交卷前檢查"
      description="交卷前統一檢查未作答題，避免遺漏。"
      bullets={[
        "交卷會呼叫 `/contests/:id/exam/end/`，狀態切到 submitted。",
        "submitted 後不可再作答（除非管理者 reopen）。",
        "交卷後導向批改中頁面。",
      ]}
      notice="目前未作答題目清單尚未接 paper 題型 API；先串手動交卷流程。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={canSubmit ? "blue" : "gray"}>
              {`目前狀態：${contest?.examStatus || "not_started"}`}
            </Tag>
            <Tag type="teal">
              {contest?.endTime
                ? `系統截止：${new Date(contest.endTime).toLocaleString()}`
                : "未設定截止時間"}
            </Tag>
          </div>

          {error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="交卷失敗"
              subtitle={error}
              onCloseButtonClick={clearError}
            />
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              kind="secondary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}/exam-v2/answering`)
              }
            >
              回作答頁
            </Button>
            <Button kind="danger" disabled={!canSubmit || loading} onClick={handleSubmitExam}>
              確認交卷
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2SubmitReviewScreen;
