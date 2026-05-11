/**
 * Pure utility to map slim ExamAnswerGrading[] + ExamQuestion[] → GradingAnswerRow[].
 *
 * Previously consumed the fat ExamAnswerDetail DTO which duplicated question_*
 * and participant name fields on every row. Switched to the slim projection
 * (backend `?projection=grading`) so this now joins question info via
 * `questions` and participant names via `participantMap`.
 */
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamAnswerGrading } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow, QuestionType } from "./gradingTypes";

export function buildGradingRows(
  allAnswers: ExamAnswerGrading[],
  questions: ExamQuestion[],
  participantMap?: Map<string, { username: string; displayName: string }>,
): GradingAnswerRow[] {
  const questionsMap = new Map<string, ExamQuestion>();
  questions.forEach((q, i) =>
    questionsMap.set(q.id, { ...q, order: q.order ?? i }),
  );

  return allAnswers.map((a) => {
    const q = questionsMap.get(a.questionId);
    const qIdx = q ? q.order : 0;
    const qType = (q?.questionType ?? "short_answer") as QuestionType;
    const isAuto =
      qType === "true_false" ||
      qType === "single_choice" ||
      qType === "multiple_choice";

    const studentId = a.participantUserId;
    const student = participantMap?.get(studentId);
    const studentUsername = student?.username ?? "unknown";
    const studentDisplayName = student?.displayName ?? studentUsername;

    return {
      id: a.id,
      studentId,
      studentUsername,
      studentDisplayName,
      questionId: a.questionId,
      questionIndex: qIdx + 1,
      questionPrompt: q?.prompt ?? "",
      questionExplanation: q?.explanation ?? "",
      questionType: qType,
      answerFormat: q?.answerFormat,
      questionOptions: q?.options ?? [],
      maxScore: q?.score ?? 0,
      answerContent: a.answer,
      score: a.score,
      feedback: a.feedback ?? "",
      gradedBy: a.gradedByUsername,
      gradedAt: a.gradedAt,
      isAutoGraded: isAuto && a.score !== null,
      correctAnswer: q?.correctAnswer ?? null,
    };
  });
}
