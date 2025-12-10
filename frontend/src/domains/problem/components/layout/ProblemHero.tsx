import React from "react";
import { Tag } from "@carbon/react";
import { HeroBase } from "@/ui/components/layout/HeroBase";
import { DataCard } from "@/ui/components/DataCard";
import { Checkmark, Percentage, Document, Trophy } from "@carbon/icons-react";
import type { ProblemDetail } from "@/core/entities/problem.entity";

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
      {problem.tags?.map((tag: any) => (
        <Tag key={tag.id} type="gray">
          {tag.name}
        </Tag>
      ))}
    </>
  );

  const metadata = (
    <>
      <div>
        <div
          style={{
            marginBottom: "0.25rem",
            fontSize: "0.875rem",
            color: "var(--cds-text-secondary)",
          }}
        >
          Time Limit
        </div>
        <div
          style={{
            color: "var(--cds-text-primary)",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {problem.timeLimit} ms
        </div>
      </div>
      <div>
        <div
          style={{
            marginBottom: "0.25rem",
            fontSize: "0.875rem",
            color: "var(--cds-text-secondary)",
          }}
        >
          Memory Limit
        </div>
        <div
          style={{
            color: "var(--cds-text-primary)",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {problem.memoryLimit} KB
        </div>
      </div>
    </>
  );

  // Breadcrumbs: adapt based on mode
  // const breadcrumbs = contestMode ? (
  //   <Breadcrumb>
  //       <BreadcrumbItem href="/">Home</BreadcrumbItem>
  //       <BreadcrumbItem href="/contests">Contests</BreadcrumbItem>
  //       <BreadcrumbItem href={`/contests/${contestId}`}>{contestName || 'Contest'}</BreadcrumbItem>
  //       <BreadcrumbItem href="#" isCurrentPage>{problemLabel ? `${problemLabel}. ${problem.title}` : problem.title}</BreadcrumbItem>
  //   </Breadcrumb>
  // ) : (
  //   <Breadcrumb>
  //       <BreadcrumbItem href="/">Home</BreadcrumbItem>
  //       <BreadcrumbItem href="/problems">Problems</BreadcrumbItem>
  //       <BreadcrumbItem href="#" isCurrentPage>{problem.title}</BreadcrumbItem>
  //   </Breadcrumb>
  // );

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
      <DataCard
        icon={Trophy}
        value={problemScore !== undefined ? `${problemScore} pts` : "-"}
        label="Score"
      />
      <DataCard
        icon={Document}
        value={problem.submissionCount || 0}
        label="Submissions"
      />
      <DataCard
        icon={Checkmark}
        value={problem.acceptedCount || 0}
        label="Accepted"
      />
    </>
  ) : (
    <>
      <DataCard icon={Percentage} value={`${acRate}%`} label="AC Rate" />
      <DataCard
        icon={Document}
        value={problem.submissionCount || 0}
        label="Submissions"
      />
      <DataCard
        icon={Checkmark}
        value={problem.acceptedCount || 0}
        label="Accepted"
      />
    </>
  );

  return (
    <HeroBase
      // breadcrumbs={breadcrumbs}
      title={displayTitle}
      badges={badges}
      metadata={metadata}
      kpiCards={kpiCards}
      maxWidth={maxWidth}
    />
  );
};

export default ProblemHero;
