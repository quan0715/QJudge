import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import ExamQuestionEditCard from "./ExamQuestionEditCard";

function UnifiedQuestions() {
  const [questions, setQuestions] = useState<ExamQuestion[]>(["short_answer", "essay"].map((questionType, index) => ({
    id: `teacher-${index}`, contestId: "storybook", questionType: questionType as ExamQuestion["questionType"],
    answerFormat: "open_document", prompt: index ? "說明你的推導與理由。" : "計算並寫出答案。", explanation: "", options: [], score: 5, order: index, createdAt: "", updatedAt: "",
  })));
  return <I18nextProvider i18n={i18n}><ThemeProvider><ToastProvider><div style={{padding:24, maxWidth:960}}>
    {questions.map((question, index) => <ExamQuestionEditCard key={question.id} question={question} index={index} onDelete={async () => {}} onDuplicate={async () => {}} onAutoSave={async (payload) => {
      setQuestions(previous => previous.map(item => item.id === question.id ? {...item, prompt: payload.prompt ?? item.prompt, score: payload.score ?? item.score, referenceAnswerDocument: payload.reference_answer_document ?? item.referenceAnswerDocument, explanationDocument: payload.explanation_document ?? item.explanationDocument} : item));
    }}/>) }
  </div></ToastProvider></ThemeProvider></I18nextProvider>;
}
const meta = { title: "Contest/TeacherQuestionEditor", component: UnifiedQuestions, parameters: {layout:"fullscreen"} } satisfies Meta<typeof UnifiedQuestions>;
export default meta;
export const Unified: StoryObj<typeof meta> = {};
