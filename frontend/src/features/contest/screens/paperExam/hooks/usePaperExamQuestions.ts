import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getExamPaper } from "@/infrastructure/api/repositories/examPaper.repository";
import { getMyExamAnswers } from "@/infrastructure/api/repositories/examAnswers.repository";
import type {
  ExamPaperSection,
  ExamQuestion,
  ExamQuestionGroup,
} from "@/core/entities/contest.entity";
import type { ExamItem } from "../../../types/exam.types";
import { useToast } from "@/shared/contexts/ToastContext";

export function usePaperExamQuestions(contestId: string | undefined) {
  const { t } = useTranslation("contest");
  const tRef = useRef(t);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [groups, setGroups] = useState<ExamQuestionGroup[]>([]);
  const [sections, setSections] = useState<ExamPaperSection[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const { showToast } = useToast();

  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
    getExamPaper(contestId)
      .then((paper) => {
        setExamQuestions(paper.questions);
        setGroups(paper.groups);
        setSections(paper.sections);
      })
      .catch(() => {
        setExamQuestions([]);
        setGroups([]);
        setSections([]);
        showToast({
          kind: "error",
          title: tRef.current("answering.error.loadQuestionsFailed"),
          subtitle: tRef.current("answering.error.loadQuestionsSubtitle"),
        });
      })
      .finally(() => setLoadingQuestions(false));
  }, [contestId, showToast]);

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
            title: tRef.current("answering.error.loadAnswersFailed"),
            subtitle: tRef.current("answering.error.loadAnswersSubtitle"),
          });
        }
      });
  }, [contestId, showToast]);

  return {
    examQuestions,
    groups,
    sections,
    items,
    answers,
    setAnswers,
    answeredIds,
    loadingQuestions,
  };
}
