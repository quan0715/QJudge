import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, InlineNotification, Stack, Tag } from "@carbon/react";
import ExamFlowTemplateScreen from "./ExamFlowTemplateScreen";
import { useExamV2Flow } from "./useExamV2Flow";

const ExamV2ResultScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, refreshContest } = useExamV2Flow();

  return (
    <ExamFlowTemplateScreen
      stepKey="result"
      title="Exam v2：發布後結果"
      description="成績發布後，學生查看總分、題目分數、評語與紀錄。"
      bullets={[
        "結果頁整合 contest standings / submissions 現有 API。",
        "若尚未發布，顯示等待提示並可返回批改中頁面。",
        "後續可擴充問答題評語與重評紀錄區塊。",
      ]}
      notice="目前以現有 standings 與 contest 狀態作為結果可見性依據。"
      actionPanel={
        <Stack gap={4}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="teal">{`Exam 狀態：${contest?.examStatus || "not_started"}`}</Tag>
            <Tag type={contest?.scoreboardVisibleDuringContest ? "green" : "gray"}>
              {contest?.scoreboardVisibleDuringContest
                ? "進行中可看排行榜"
                : "進行中隱藏排行榜"}
            </Tag>
          </div>

          {contest?.examStatus !== "submitted" ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="結果尚不可用"
              subtitle="學生尚未完成交卷或結果尚未發布。"
            />
          ) : (
            <InlineNotification
              kind="success"
              lowContrast
              hideCloseButton
              title="可查看結果"
              subtitle="你可以進入排行榜與提交紀錄查看目前結果。"
            />
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button kind="secondary" onClick={() => void refreshContest()}>
              重新整理狀態
            </Button>
            <Button
              kind="primary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}?tab=standings`)
              }
            >
              查看排行榜
            </Button>
            <Button
              kind="tertiary"
              disabled={!contestId}
              onClick={() =>
                contestId && navigate(`/contests/${contestId}?tab=submissions`)
              }
            >
              查看提交紀錄
            </Button>
          </div>
        </Stack>
      }
    />
  );
};

export default ExamV2ResultScreen;
