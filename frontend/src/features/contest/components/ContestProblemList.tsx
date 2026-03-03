import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";
import type {
  ContestDetail,
  ContestProblemSummary,
  ScoreboardRow,
} from "@/core/entities/contest.entity";
import {
  ProblemTable,
  type ProblemRowData,
} from "@/features/problems/components/list";

interface ContestProblemListProps {
  contest: ContestDetail;
  problems: ContestProblemSummary[];
  myRank: ScoreboardRow | null;
  maxWidth?: string;
}

export const ContestProblemList: React.FC<ContestProblemListProps> = ({
  contest,
  problems,
  myRank,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  const hasStartedExam =
    contest.hasStarted ||
    contest.examStatus === "in_progress" ||
    contest.examStatus === "paused" ||
    contest.examStatus === "locked" ||
    contest.examStatus === "submitted";

  const tableProblems: ProblemRowData[] = problems.map((problem) => ({
    ...problem,
    id: problem.id,
    problemId: problem.problemId || problem.id,
    title: problem.title,
    label: problem.label || "-",
    score: problem.score || 0,
    order: problem.order || 0,
    difficulty: problem.difficulty,
    isSolved: myRank?.problems?.[problem.id]?.status === "AC",
    submissionCount: undefined,
    acceptedCount: undefined,
  }));

  const handleRowClick = (problem: ProblemRowData) => {
    if (!hasStartedExam || !contestId) return;
    const targetId = problem.problemId || problem.id;
    navigate(`/contests/${contestId}/solve/${targetId}`);
  };

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <ContainerCard title={t("problemList")} noPadding>
            <ProblemTable
              problems={tableProblems}
              mode="contest"
              onRowClick={handleRowClick}
            />
          </ContainerCard>
        </div>
      </div>
    </SurfaceSection>
  );
};
