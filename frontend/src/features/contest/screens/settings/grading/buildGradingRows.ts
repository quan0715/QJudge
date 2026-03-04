/**
 * Pure utility to map ExamAnswerDetail[] + ExamQuestion[] → GradingAnswerRow[].
 * Shared between useGradingData hook and report PDF export.
 */
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamAnswerDetail } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow, QuestionType } from "./gradingTypes";

export function buildGradingRows(
  allAnswers: ExamAnswerDetail[],
  questions: ExamQuestion[],
  participantMap?: Map<string, { username: string; nickname: string }>
): GradingAnswerRow[] {
  const questionsMap = new Map<string, ExamQuestion>();
  questions.forEach((q, i) =>
    questionsMap.set(q.id, { ...q, order: q.order ?? i })
  );

  return allAnswers.map((a) => {
    const q = questionsMap.get(a.questionId);
    const qIdx = q ? q.order : 0;
    const qType = (a.questionType ?? "short_answer") as QuestionType;
    const isAuto =
      qType === "true_false" ||
      qType === "single_choice" ||
      qType === "multiple_choice";

    const studentId = a.participantUserId ?? a.id;
    const studentUsername =
      a.participantUsername ??
      participantMap?.get(studentId)?.username ??
      "unknown";
    const studentNickname =
      a.participantNickname ??
      participantMap?.get(studentId)?.nickname ??
      studentUsername;

    const correctAnswer =
      a.questionSnapshot?.correctAnswer ?? q?.correctAnswer ?? null;

    return {
      id: a.id,
      studentId,
      studentUsername,
      studentNickname,
      questionId: a.questionId,
      questionIndex: qIdx + 1,
      questionPrompt: a.questionPrompt ?? "",
      questionType: qType,
      questionOptions: a.questionOptions ?? [],
      maxScore: a.maxScore ?? 0,
      answerContent: a.answer,
      score: a.score,
      feedback: a.feedback ?? "",
      gradedBy: a.gradedByUsername,
      gradedAt: a.gradedAt,
      isAutoGraded: isAuto && a.score !== null,
      correctAnswer,
    };
  });
}
