import type { Meta, StoryObj } from "@storybook/react-vite";
import { Theme } from "@carbon/react";
import "@/i18n";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "../gradingTypes";
import { resolveAnswerSource } from "./workbenchRowModel";
import { WorkbenchStudentRow } from "./WorkbenchStudentRow";

const answer: GradingAnswerRow = {
  id: "answer-1", studentId: "student-1", studentUsername: "preview_01",
  studentDisplayName: "模擬學生", questionId: "question-1", questionIndex: 1,
  questionPrompt: "請說明你的解題方式。", questionType: "short_answer", questionOptions: [],
  maxScore: 10, answerContent: { text: "先分析條件，再分步驗證。" },
  score: 8, feedback: "推理正確，部分說明可再補充。", gradedBy: "teacher",
  gradedAt: "2026-10-26T00:00:00Z", isAutoGraded: false, isAiGraded: true, correctAnswer: null,
};

const meta = {
  title: "features/contest/grading/WorkbenchStudentRow",
  component: WorkbenchStudentRow,
  args: {
    row: {
      studentId: answer.studentId, name: answer.studentDisplayName, username: answer.studentUsername,
      answers: [answer], total: 8, source: resolveAnswerSource(answer, { suggestions: {} }),
    },
    questions: [{ id: answer.questionId, questionType: "short_answer", score: 10 }] as ExamQuestion[],
    labels: new Map(), maxScore: 10, expanded: false, drafts: {}, suggestionScores: {}, busy: false,
    onToggle: () => {}, onDraftChange: () => {}, onPrimary: () => {}, onSecondary: () => {},
  },
  decorators: [(Story) => <Theme theme="g100"><div style={{ maxWidth: 1200 }}><Story /></div></Theme>],
} satisfies Meta<typeof WorkbenchStudentRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AiGraded: Story = {};
export const HumanConfirmed: Story = {
  args: { row: { ...meta.args.row, answers: [{ ...answer, isAiGraded: false }], source: "manual" } },
};
export const LightHumanConfirmed: Story = {
  ...HumanConfirmed,
  decorators: [(Story) => <Theme theme="white"><Story /></Theme>],
};
export const GroupWithUnansweredChild: Story = {
  args: {
    row: {
      ...meta.args.row,
      answers: [{ ...answer, questionId: "question-14a", maxScore: 5, score: 1, feedback: "有辨認 7 並嘗試加上二進位權重，但迴圈未更新輸入。" }],
      total: 1,
      source: "manual",
    },
    questions: [
      { id: "question-14a", questionType: "short_answer", score: 5 },
      { id: "question-14b", questionType: "short_answer", score: 10 },
    ] as ExamQuestion[],
    labels: new Map([["question-14a", { label: "14(a)" }], ["question-14b", { label: "14(b)" }]]),
    maxScore: 15,
    expanded: true,
  },
};
export const Unanswered: Story = {
  args: {
    row: { ...meta.args.row, name: "空白卷學生", answers: [], total: 0, source: "unanswered" },
    expanded: true,
  },
};
