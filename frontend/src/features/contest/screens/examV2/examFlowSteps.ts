export type ExamFlowStepKey =
  | "registration"
  | "precheck"
  | "answering"
  | "submit-review"
  | "grading"
  | "result";

export interface ExamFlowStep {
  key: ExamFlowStepKey;
  title: string;
  subtitle: string;
  path: string;
}

export const EXAM_FLOW_STEPS: ExamFlowStep[] = [
  {
    key: "registration",
    title: "1. 報名確認",
    subtitle: "確認資格、截止時間與報名狀態",
    path: "registration",
  },
  {
    key: "precheck",
    title: "2. 考前檢查",
    subtitle: "裝置/網路/全螢幕/規則確認",
    path: "precheck",
  },
  {
    key: "answering",
    title: "3. 單頁連續作答",
    subtitle: "同頁作答 + autosave + 倒數計時",
    path: "answering",
  },
  {
    key: "submit-review",
    title: "4. 交卷前檢查",
    subtitle: "未作答題目提示與最終確認",
    path: "submit-review",
  },
  {
    key: "grading",
    title: "5. 批改中",
    subtitle: "顯示批改狀態與預計更新時間",
    path: "grading",
  },
  {
    key: "result",
    title: "6. 發布後結果",
    subtitle: "查看總分、題目得分與評語",
    path: "result",
  },
];

export const getExamFlowStepIndex = (key: ExamFlowStepKey): number =>
  EXAM_FLOW_STEPS.findIndex((step) => step.key === key);

