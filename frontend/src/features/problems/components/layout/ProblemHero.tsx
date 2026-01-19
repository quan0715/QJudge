import React from "react";
import { Tag } from "@carbon/react";
import { HeroBase } from "@/shared/layout/HeroBase";
import { KpiCard } from "@/shared/ui/dataCard";
import { Checkmark, Percentage, Document, Trophy } from "@carbon/icons-react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import "./ProblemHero.scss";

interface ProblemHeroProps {
  problem: ProblemDetail | null;
  loading?: boolean;
  // Contest mode props
  contestMode?: boolean;
  contestId?: string;
  contestName?: string;
  problemScore?: number;
  problemLabel?: string; // e.g., "A", "B", "C"
  // Layout
  maxWidth?: string;
  // Actions
  actions?: React.ReactNode;
}

const ProblemHero: React.FC<ProblemHeroProps> = ({
  problem,
  loading,
  contestMode = false,
  contestId: _contestId,
  contestName: _contestName,
  problemScore,
  problemLabel,
  maxWidth,
  actions,
}) => {
  if (loading || !problem) {
    return <HeroBase title="" loading={true} maxWidth={maxWidth} />;
  }

  // Title with optional label prefix in contest mode
  const displayTitle =
    contestMode && problemLabel
      ? `${problemLabel}. ${problem.title}`
      : problem.title;

  const badges = (
    <>
      <Tag
        type={
          problem.difficulty === "easy"
            ? "green"
            : problem.difficulty === "medium"
              ? "blue"
              : "red"
        }
      >
        {problem.difficulty.toUpperCase()}
      </Tag>
      {problem.tags?.map((tag: { id: string; name: string }) => (
        <Tag key={tag.id} type="gray">
          {tag.name}
        </Tag>
      ))}
    </>
  );

  const metadata = (
    <>
      <div className="problem-hero__metadata-item">
        <span className="problem-hero__metadata-label">Time Limit</span>
        <span className="problem-hero__metadata-value">
          {problem.timeLimit} ms
        </span>
      </div>
      <div className="problem-hero__metadata-item">
        <span className="problem-hero__metadata-label">Memory Limit</span>
        <span className="problem-hero__metadata-value">
          {problem.memoryLimit} KB
        </span>
      </div>
    </>
  );

  // Calculate AC rate from problem statistics
  const acRate =
    problem.submissionCount && problem.submissionCount > 0
      ? Math.round(
          ((problem.acceptedCount || 0) / problem.submissionCount) * 100
        )
      : 0;

  // KPI Cards: adapt based on mode
  const kpiCards = contestMode ? (
    <>
      <KpiCard
        icon={Trophy}
        value={problemScore !== undefined ? `${problemScore} pts` : "-"}
        label="Score"
      />
      <KpiCard
        icon={Document}
        value={problem.submissionCount || 0}
        label="Submissions"
      />
      <KpiCard
        icon={Checkmark}
        value={problem.acceptedCount || 0}
        label="Accepted"
      />
    </>
  ) : (
    <>
      <KpiCard icon={Percentage} value={`${acRate}%`} label="AC Rate" />
      <KpiCard
        icon={Document}
        value={problem.submissionCount || 0}
        label="Submissions"
      />
      <KpiCard
        icon={Checkmark}
        value={problem.acceptedCount || 0}
        label="Accepted"
      />
    </>
  );

  return (
    <HeroBase
      title={displayTitle}
      badges={badges}
      metadata={metadata}
      actions={actions}
      kpiCards={kpiCards}
      maxWidth={maxWidth}
    />
  );
};

export default ProblemHero;
