import { useCallback, useEffect, useRef, useState } from "react";
import {
  submitExamAnswer,
  getExamAnswerDraft,
  saveExamAnswerDraft,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import type {
  ExamQuestionAnswerFormat,
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import { isOpenAnswerDocument } from "@/shared/ui/editor/openAnswerDocument";

const AUTO_SAVE_DELAY = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type PendingSave = { payload: ExamAnswerPayload; timeout?: ReturnType<typeof setTimeout> };

type ExamAnswerPayload = { selected: unknown } | { text: string } | { document: OpenAnswerDocument };

const OBJECTIVE_TYPES: ExamQuestionType[] = [
  "true_false",
  "single_choice",
  "multiple_choice",
];

function unwrapDraftValue(answer: Record<string, unknown>): unknown {
  if ("selected" in answer) return answer.selected;
  if ("text" in answer) return answer.text;
  if ("document" in answer && isOpenAnswerDocument(answer.document)) return answer.document;
  return answer;
}

export function buildExamAnswerPayload(
  value: unknown,
  questionType?: ExamQuestionType,
  answerFormat?: ExamQuestionAnswerFormat,
): ExamAnswerPayload {
  if (questionType && OBJECTIVE_TYPES.includes(questionType)) {
    return { selected: value };
  }

  if (answerFormat === "open_document" && isOpenAnswerDocument(value)) {
    return { document: value };
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
  const pendingSaves = useRef(new Map<string, PendingSave>());
  const latestEdits = useRef(new Map<string, PendingSave>());
  const inFlightSaves = useRef(new Set<Promise<void>>());
  const flushing = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const hasPendingWork = useCallback(
    () => pendingSaves.current.size > 0 || inFlightSaves.current.size > 0,
    [],
  );

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
          if (draft !== null) restored[qId] = unwrapDraftValue(draft);
        }
      }
      return Object.keys(restored).length ? { ...prev, ...restored } : prev;
    });
  }, [contestId, questionIds, setAnswers]);

  const savePendingAnswer = useCallback((questionId: string, entry: PendingSave) => {
    const pending = pendingSaves.current;
    const running = inFlightSaves.current;
    const latest = latestEdits.current;
    if (entry.timeout) clearTimeout(entry.timeout);
    entry.timeout = undefined;
    if (pending.get(questionId) === entry) pending.delete(questionId);
    const request = submitExamAnswer(contestId!, questionId, entry.payload).then(
      () => {
        running.delete(request);
        if (pendingSaves.current === pending) {
          setSaveStatus(hasPendingWork() ? "saving" : "saved");
        }
      },
      (error: unknown) => {
        running.delete(request);
        // A failed save remains retryable without replacing a newer edit.
        if (latest.get(questionId) === entry) pending.set(questionId, entry);
        if (pendingSaves.current === pending) setSaveStatus("error");
        throw error;
      },
    );
    running.add(request);
    return request;
  }, [contestId, hasPendingWork]);

  const flushAll = useCallback(async () => {
    const pending = pendingSaves.current;
    const running = inFlightSaves.current;
    flushing.current = true;
    try {
      // Freeze debounce timers while old writes drain, then save the latest edits.
      while (pending.size > 0 || running.size > 0) {
        for (const entry of pending.values()) {
          if (entry.timeout) clearTimeout(entry.timeout);
          entry.timeout = undefined;
        }
        await Promise.all(running);
        if (pendingSaves.current !== pending) throw new Error("Exam changed while saving answers");
        await Promise.all(Array.from(pending, ([id, entry]) => savePendingAnswer(id, entry)));
        if (pendingSaves.current !== pending) throw new Error("Exam changed while saving answers");
      }
    } finally {
      if (pendingSaves.current === pending) flushing.current = false;
    }
  }, [savePendingAnswer]);

  useEffect(() => () => {
    // Preserve unsent edits before dropping timers on navigation or a new contest.
    for (const [id, entry] of pendingSaves.current) {
      if (entry.timeout) clearTimeout(entry.timeout);
      if (contestId) saveExamAnswerDraft(contestId, id, entry.payload);
    }
    pendingSaves.current = new Map();
    latestEdits.current = new Map();
    inFlightSaves.current = new Set();
    flushing.current = false;
  }, [contestId]);

  const handleAnswerChange = useCallback(
    (
      questionId: string,
      value: unknown,
      questionType?: ExamQuestionType,
      answerFormat?: ExamQuestionAnswerFormat,
    ) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));

      if (!contestId) return;
      const existing = pendingSaves.current.get(questionId);
      if (existing?.timeout) clearTimeout(existing.timeout);

      setSaveStatus("saving");
      const entry: PendingSave = { payload: buildExamAnswerPayload(value, questionType, answerFormat) };
      if (!flushing.current) {
        entry.timeout = setTimeout(() => {
          void savePendingAnswer(questionId, entry).catch(() => {});
        }, AUTO_SAVE_DELAY);
      }
      latestEdits.current.set(questionId, entry);
      pendingSaves.current.set(questionId, entry);
    },
    [contestId, savePendingAnswer, setAnswers],
  );

  return { handleAnswerChange, saveStatus, flushAll };
}
