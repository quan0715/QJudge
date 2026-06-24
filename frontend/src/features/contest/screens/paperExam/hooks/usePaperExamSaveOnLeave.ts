import { useCallback, useEffect, useRef, useState } from "react";
import { submitExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import type {
  ExamQuestionAnswerFormat,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import { buildExamAnswerPayload } from "./usePaperExamAutoSave";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UsePaperExamSaveOnLeaveOptions {
  contestId: string | undefined;
  answers: Record<string, unknown>;
  items: {
    kind: string;
    data: {
      id: string;
      questionType?: ExamQuestionType;
      answerFormat?: ExamQuestionAnswerFormat;
    };
  }[];
}

export function usePaperExamSaveOnLeave({
  contestId,
  answers,
  items,
}: UsePaperExamSaveOnLeaveOptions) {
  const dirtySetRef = useRef(new Set<string>());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Keep latest values accessible in refs for beforeunload/visibilitychange
  const answersRef = useRef(answers);
  const itemsRef = useRef(items);
  const contestIdRef = useRef(contestId);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { contestIdRef.current = contestId; }, [contestId]);

  const getQuestion = useCallback(
    (questionId: string) => {
      const item = itemsRef.current.find(
        (it) => it.kind === "question" && it.data.id === questionId,
      );
      return item?.data;
    },
    [],
  );

  const saveQuestion = useCallback(
    async (questionId: string) => {
      const cId = contestIdRef.current;
      if (!cId) return;
      const value = answersRef.current[questionId];
      if (value === undefined) return;

      const question = getQuestion(questionId);
      const payload = buildExamAnswerPayload(value, question?.questionType, question?.answerFormat);
      setSaveStatus("saving");
      try {
        await submitExamAnswer(cId, questionId, payload);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        throw error;
      }
    },
    [getQuestion],
  );

  const markDirty = useCallback((questionId: string) => {
    dirtySetRef.current.add(questionId);
  }, []);

  const saveIfDirty = useCallback(
    async (questionId: string) => {
      if (!dirtySetRef.current.has(questionId)) return;
      await saveQuestion(questionId);
      dirtySetRef.current.delete(questionId);
    },
    [saveQuestion],
  );

  const flushAll = useCallback(async () => {
    const dirtyIds = Array.from(dirtySetRef.current);
    if (dirtyIds.length === 0) return;
    dirtySetRef.current.clear();

    setSaveStatus("saving");
    try {
      await Promise.all(dirtyIds.map((id) => saveQuestion(id)));
      for (const id of dirtyIds) {
        dirtySetRef.current.delete(id);
      }
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [saveQuestion]);

  // Register beforeunload and visibilitychange
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtySetRef.current.size === 0) return;
      // Fire-and-forget flush using sendBeacon-like pattern
      const cId = contestIdRef.current;
      if (!cId) return;

      for (const questionId of dirtySetRef.current) {
        const value = answersRef.current[questionId];
        if (value === undefined) continue;
        const question = getQuestion(questionId);
        const payload = buildExamAnswerPayload(value, question?.questionType, question?.answerFormat);
        // Keep endpoint aligned with submitExamAnswer API contract.
        const url = `/api/v1/contests/${cId}/exam-answers/submit/`;
        const body = {
          question_id: questionId,
          answer: payload,
        };
        navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
      }
      dirtySetRef.current.clear();

      e.preventDefault();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && dirtySetRef.current.size > 0) {
        // Use sendBeacon for reliability
        const cId = contestIdRef.current;
        if (!cId) return;

        for (const questionId of dirtySetRef.current) {
          const value = answersRef.current[questionId];
          if (value === undefined) continue;
          const question = getQuestion(questionId);
          const payload = buildExamAnswerPayload(value, question?.questionType, question?.answerFormat);
          const url = `/api/v1/contests/${cId}/exam-answers/submit/`;
          const body = {
            question_id: questionId,
            answer: payload,
          };
          navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
        }
        dirtySetRef.current.clear();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [getQuestion]);

  return { markDirty, saveIfDirty, flushAll, saveStatus };
}
