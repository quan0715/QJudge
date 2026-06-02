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
import { isOpenAnswerDocument } from "@/shared/ui/editor";

function unwrapExamAnswerValue(answer: Record<string, unknown>): unknown {
  if ("selected" in answer) return answer.selected;
  if ("text" in answer) return answer.text;
  if ("document" in answer && isOpenAnswerDocument(answer.document)) return answer.document;
  return answer;
}

export function usePaperExamQuestions(contestId: string | undefined) {
  const { t } = useTranslation("contest");
  const tRef = useRef(t);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [groups, setGroups] = useState<ExamQuestionGroup[]>([]);
  const [sections, setSections] = useState<ExamPaperSection[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(() => Boolean(contestId));
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
    let isCurrent = true;

    if (!contestId) {
      return () => {
        isCurrent = false;
      };
    }

    queueMicrotask(() => {
      if (isCurrent) setLoadingQuestions(true);
    });
    getExamPaper(contestId)
      .then((paper) => {
        if (!isCurrent) return;
        setExamQuestions(paper.questions);
        setGroups(paper.groups);
        setSections(paper.sections);
      })
      .catch(() => {
        if (!isCurrent) return;
        setExamQuestions([]);
        setGroups([]);
        setSections([]);
        showToast({
          kind: "error",
          title: tRef.current("answering.error.loadQuestionsFailed"),
          subtitle: tRef.current("answering.error.loadQuestionsSubtitle"),
        });
      })
      .finally(() => {
        if (isCurrent) setLoadingQuestions(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [contestId, showToast]);

  // Load existing answers on mount
  useEffect(() => {
    let isCurrent = true;

    if (!contestId) {
      return () => {
        isCurrent = false;
      };
    }

    getMyExamAnswers(contestId)
      .then((savedAnswers) => {
        if (!isCurrent) return;
        const map: Record<string, unknown> = {};
        for (const a of savedAnswers) {
          map[a.questionId] = unwrapExamAnswerValue(a.answer);
        }
        setAnswers(map);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const status = typeof error === "object" && error !== null
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
        if (status !== 404) {
          showToast({
            kind: "error",
            title: tRef.current("answering.error.loadAnswersFailed"),
            subtitle: tRef.current("answering.error.loadAnswersSubtitle"),
          });
        }
      });

    return () => {
      isCurrent = false;
    };
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
