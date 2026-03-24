import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
  ContestProblemSummary,
  ScoreboardRow,
} from "@/core/entities/contest.entity";
import {
  ProblemTable,
  type ProblemRowData,
} from "@/features/problems/components/list";
import { hasStartedExam } from "@/features/contest/domain/contestRuntimePolicy";

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

  const startedExam = hasStartedExam(contest);

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
    if (!startedExam || !contestId) return;
    const targetId = problem.problemId || problem.id;
    navigate(`/contests/${contestId}/solve/${targetId}`);
  };

  return (
    <div style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
        {t("problemList")}
      </h4>
      <ProblemTable
        problems={tableProblems}
        mode="contest"
        onRowClick={handleRowClick}
      />
    </div>
  );
};
