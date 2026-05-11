import React from "react";
import {
  InlineNotification,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";
import PaperQuestionOverviewTable from "./PaperQuestionOverviewTable";
import AnswerDisplay from "./AnswerDisplay";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";

const canOpenPaperAnsweringFromDashboard = (contest: ContestDetail | null | undefined): boolean => {
  if (!contest) return false;
  const PAPER_ANSWERING_OPEN_STATUSES = new Set(["in_progress", "paused", "locked"]);
  return (
    contest.contestType === "paper_exam" &&
    isContestParticipant(contest) &&
    !!contest.examStatus && PAPER_ANSWERING_OPEN_STATUSES.has(contest.examStatus)
  );
};


interface PaperExamResultsListProps {
  contest: ContestDetail;
  maxWidth?: string;
}

const PaperExamResultsList: React.FC<PaperExamResultsListProps> = ({
  contest,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const contestId = contest.id.toString();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [results, setResults] = useState<ExamAnswerDetail[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canQueryExamData = isContestParticipant(contest);
  const canOpenAnswering = canOpenPaperAnsweringFromDashboard(contest);
  const resultsPublished = contest.resultsPublished === true;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!canQueryExamData) {
        setQuestions([]);
        setResults([]);
        setLoadError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const [examQuestions, publishedResults] = await Promise.all([
          getExamQuestions(contestId),
          resultsPublished ? getExamResults(contestId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setQuestions(
          examQuestions.slice().sort((a, b) => a.order - b.order)
        );
        setResults(publishedResults);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : t("paperExamProblems.loadFailed")
        );
        showToast({
          kind: "error",
          title: t("paperExamProblems.loadFailedTitle"),
          subtitle: t("paperExamProblems.loadFailed"),
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canQueryExamData, contestId, resultsPublished, showToast, t]);

  const resultMap = useMemo(
    () =>
      new Map(results.map((result) => [String(result.questionId), result])),
    [results]
  );

  const rows = useMemo(
    () =>
      questions.map((question, index) => {
        const result = resultMap.get(String(question.id));
        return {
          id: String(question.id),
          index: index + 1,
          prompt: question.prompt,
          type: t(
            `common:questionType.label.${(result?.questionType || question.questionType)?.toString()}`,
            (result?.questionType || question.questionType || "-").toString()
          ),
          maxScore: question.score ?? 0,
          score:
            resultsPublished && result
              ? `${result.score ?? 0}`
              : t("paperExamProblems.notGraded"),
          feedback:
            resultsPublished && result
              ? result.feedback || t("paperExamProblems.noFeedback")
              : "-",
        };
      }),
    [questions, resultMap, resultsPublished, t]
  );

  const totalScore = useMemo(
    () => results.reduce((sum, item) => sum + (item.score ?? 0), 0),
    [results]
  );
  const totalMaxScore = useMemo(
    () => questions.reduce((sum, item) => sum + (item.score ?? 0), 0),
    [questions]
  );

  return (
    <div style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
        {t("paperExamProblems.title")}
      </h4>
            {canOpenAnswering && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.openingTitle")}
                subtitle={t("paperExamProblems.openingDescription")}
                style={{ marginBottom: "1rem" }}
              />
            )}

            {!canQueryExamData && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.notRegisteredTitle")}
                subtitle={t("paperExamProblems.notRegisteredDescription")}
                style={{ marginBottom: "1rem" }}
              />
            )}

            {contest.examStatus === "submitted" && !resultsPublished && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.gradingTitle")}
                subtitle={t("paperExamProblems.gradingDescription")}
                style={{ marginBottom: "1rem" }}
              />
            )}

            {resultsPublished && (
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <Tag type="green">
                  {t("paperExamProblems.totalScore", {
                    score: totalScore,
                    total: totalMaxScore,
                  })}
                </Tag>
              </div>
            )}

            {loadError && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.loadFailedTitle")}
                subtitle={loadError}
                style={{ marginBottom: "1rem" }}
              />
            )}

            {canQueryExamData && (
              <>
                <PaperQuestionOverviewTable
                  rows={rows.map((row) => ({
                    id: row.id,
                    index: row.index,
                    prompt: row.prompt,
                    typeLabel: row.type,
                    maxScore: row.maxScore,
                    scoreDisplay: row.score,
                    feedbackDisplay: row.feedback,
                  }))}
                  showScore={resultsPublished}
                  showFeedback={resultsPublished}
                  onRowClick={
                    canOpenAnswering
                      ? (questionId) =>
                          contest.boundClassroomId
                            ? navigate(
                                getClassroomContestSolvePath(
                                  contest.boundClassroomId,
                                  contestId,
                                  questionId,
                                ),
                              )
                            : navigate("/dashboard")
                      : undefined
                  }
                />

                {resultsPublished && results.length > 0 ? (
                  <div style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}>
                    {questions.map((question, index) => {
                      const result = resultMap.get(String(question.id));
                      if (!result) return null;
                      return (
                        <section
                          key={question.id}
                          style={{
                            border: "1px solid var(--cds-border-subtle-01)",
                            borderRadius: "0.5rem",
                            padding: "1rem",
                            background: "var(--cds-layer-01)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "1rem",
                              marginBottom: "0.75rem",
                              alignItems: "baseline",
                            }}
                          >
                            <strong>
                              {t("answering.submit.questionPreview", { index: index + 1 })}
                            </strong>
                            <span>
                              {result.score ?? 0} / {question.score}
                            </span>
                          </div>
                          <div style={{ marginBottom: "1rem" }}>
                            <MarkdownRenderer enableMath enableHighlight>
                              {question.prompt}
                            </MarkdownRenderer>
                          </div>
                          <AnswerDisplay
                            questionType={question.questionType}
                            answerFormat={question.answerFormat}
                            answerContent={result.answer}
                            options={question.options}
                            correctAnswer={result.questionSnapshot?.correctAnswer ?? question.correctAnswer}
                            explanation={
                              result.questionExplanation ??
                              result.questionSnapshot?.explanation ??
                              question.explanation
                            }
                          />
                          {result.feedback ? (
                            <div style={{ marginTop: "0.75rem" }}>
                              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                                {t("paperExamProblems.feedbackLabel", "批改評語")}
                              </div>
                              <MarkdownRenderer enableMath enableHighlight>
                                {result.feedback}
                              </MarkdownRenderer>
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}

            {!loading && rows.length === 0 && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.emptyTitle")}
                subtitle={t("paperExamProblems.emptyDescription")}
                style={{ marginTop: "1rem" }}
              />
            )}

            {loading && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={t("paperExamProblems.loadingTitle")}
                subtitle={t("paperExamProblems.loadingDescription")}
                style={{ marginTop: "1rem" }}
              />
            )}
    </div>
  );
};

export default PaperExamResultsList;
