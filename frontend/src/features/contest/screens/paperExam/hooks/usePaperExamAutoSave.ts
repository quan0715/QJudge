import { useCallback, useRef, useState } from "react";
import { submitExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";

const AUTO_SAVE_DELAY = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function usePaperExamAutoSave({
  contestId,
  setAnswers,
}: {
  contestId: string | undefined;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const pendingSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));

      if (!contestId) return;
      const existing = pendingSaves.current.get(questionId);
      if (existing) clearTimeout(existing);

      setSaveStatus("saving");
      const timeout = setTimeout(() => {
        const answerPayload =
          typeof value === "string" ? { text: value } : { selected: value };
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
