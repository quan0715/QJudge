import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getMyExamAnswers } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamItem } from "../../../types/exam.types";
import { useToast } from "@/shared/contexts/ToastContext";

export function usePaperExamQuestions(contestId: string | undefined) {
  const { t } = useTranslation("contest");
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const { showToast } = useToast();

  const items: ExamItem[] = useMemo(
    () => examQuestions.map((q) => ({ kind: "question" as const, data: q })),
    [examQuestions],
  );

  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, value] of Object.entries(answers)) {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        ids.add(id);
      }
    }
    return ids;
  }, [answers]);

  // Fetch exam questions
  useEffect(() => {
    if (!contestId) return;
    setLoadingQuestions(true);
    getExamQuestions(contestId)
      .then(setExamQuestions)
      .catch(() => {
        setExamQuestions([]);
        showToast({
          kind: "error",
          title: t("answering.error.loadQuestionsFailed"),
          subtitle: t("answering.error.loadQuestionsSubtitle"),
        });
      })
      .finally(() => setLoadingQuestions(false));
  }, [contestId, showToast, t]);

  // Load existing answers on mount
  useEffect(() => {
    if (!contestId) return;
    getMyExamAnswers(contestId)
      .then((savedAnswers) => {
        const map: Record<string, unknown> = {};
        for (const a of savedAnswers) {
          const val = a.answer;
          if ("selected" in val) map[a.questionId] = val.selected;
          else if ("text" in val) map[a.questionId] = val.text;
          else map[a.questionId] = val;
        }
        setAnswers(map);
      })
      .catch((error: any) => {
        if (error?.response?.status !== 404) {
          showToast({
            kind: "error",
            title: t("answering.error.loadAnswersFailed"),
            subtitle: t("answering.error.loadAnswersSubtitle"),
          });
        }
      });
  }, [contestId, showToast, t]);

  return { examQuestions, items, answers, setAnswers, answeredIds, loadingQuestions };
}
