import React from "react";
import {
  InlineNotification,
  Tag,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";
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
import PaperQuestionOverviewTable from "./PaperQuestionOverviewTable";

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
            `questionTypes.${(result?.questionType || question.questionType)?.toString()}`,
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
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <ContainerCard title={t("paperExamProblems.title")}>
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
                        navigate(`/contests/${contestId}/paper-exam/answering?q=${questionId}`)
                    : undefined
                }
              />
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
          </ContainerCard>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default PaperExamResultsList;
