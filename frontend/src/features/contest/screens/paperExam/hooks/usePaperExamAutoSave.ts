import { useCallback, useEffect, useRef, useState } from "react";
import {
  submitExamAnswer,
  getExamAnswerDraft,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ExamQuestionType } from "@/core/entities/contest.entity";

const AUTO_SAVE_DELAY = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type ExamAnswerPayload = { selected: unknown } | { text: string };

const OBJECTIVE_TYPES: ExamQuestionType[] = [
  "true_false",
  "single_choice",
  "multiple_choice",
];

export function buildExamAnswerPayload(
  value: unknown,
  questionType?: ExamQuestionType,
): ExamAnswerPayload {
  if (questionType && OBJECTIVE_TYPES.includes(questionType)) {
    return { selected: value };
  }

  if (typeof value === "string") {
    return { text: value };
  }

  return { selected: value };
}

export function usePaperExamAutoSave({
  contestId,
  questionIds,
  setAnswers,
}: {
  contestId: string | undefined;
  /** IDs of all questions – used to restore drafts on mount. */
  questionIds?: string[];
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const pendingSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Restore any locally-cached drafts so answers survive a page reload caused
  // by a server error.  Only applies when the server hasn't returned saved
  // answers yet (caller passes empty initial answers).
  useEffect(() => {
    if (!contestId || !questionIds?.length) return;
    setAnswers((prev) => {
      const restored: Record<string, unknown> = {};
      for (const qId of questionIds) {
        if (prev[qId] === undefined || prev[qId] === null || prev[qId] === "") {
          const draft = getExamAnswerDraft(contestId, qId);
          if (draft !== null) restored[qId] = draft;
        }
      }
      return Object.keys(restored).length ? { ...prev, ...restored } : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown, questionType?: ExamQuestionType) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));

      if (!contestId) return;
      const existing = pendingSaves.current.get(questionId);
      if (existing) clearTimeout(existing);

      setSaveStatus("saving");
      const timeout = setTimeout(() => {
        const answerPayload = buildExamAnswerPayload(value, questionType);
        submitExamAnswer(contestId, questionId, answerPayload)
          .then(() => setSaveStatus("saved"))
          .catch(() => setSaveStatus("error"));
        pendingSaves.current.delete(questionId);
      }, AUTO_SAVE_DELAY);
      pendingSaves.current.set(questionId, timeout);
    },
    [contestId, setAnswers],
  );

  return { handleAnswerChange, saveStatus };
}
