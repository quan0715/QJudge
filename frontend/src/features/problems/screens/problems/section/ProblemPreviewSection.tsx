import React from "react";
import { ClickableTile, SkeletonText, Layer, Stack } from "@carbon/react";
import { CheckmarkFilled, ArrowRight } from "@carbon/icons-react";
import type { Problem } from "@/core/entities/problem.entity";
import { DifficultyBadge, CategoryTag, AcrBadge } from "@/shared/ui/tag";
import "./ProblemPreviewSection.scss";

export interface ProblemPreviewSectionProps {
  problem: Problem;
  onSelect?: (problem: Problem) => void;
}

export const ProblemPreviewSection: React.FC<ProblemPreviewSectionProps> = ({
  problem,
  onSelect,
}) => {
  const tagNames = Array.isArray(problem.tags)
    ? problem.tags.map((t) => t.name).filter(Boolean)
    : [];
  const acceptanceRate = problem.acceptanceRate;

  const handleSelect = () => onSelect?.(problem);

  return (
    <ClickableTile onClick={handleSelect}>
      <Stack
        orientation="horizontal"
        gap={4}
        className="problem-preview-card__container"
      >
        <div className="problem-preview-card__content">
          <p className="problem-preview-card__title">{problem.title}</p>
          <div className="problem-preview-card__meta">
            <DifficultyBadge difficulty={problem.difficulty} />
            <CategoryTag labels={tagNames} />
            <AcrBadge value={acceptanceRate} />
          </div>
        </div>

        <div className="problem-preview-card__actions">
          {problem.isSolved ? (
            <CheckmarkFilled
              className="problem-preview-card__status-icon problem-preview-card__status-icon--success"
              size={20}
              aria-label="Solved"
            />
          ) : (
            <ArrowRight
              className="problem-preview-card__status-icon"
              size={20}
              aria-label="View problem"
            />
          )}
        </div>
      </Stack>
    </ClickableTile>
  );
};

export const ProblemPreviewSectionSkeleton: React.FC = () => (
  <Layer level={1}>
    <ClickableTile className="problem-preview-card problem-preview-card--skeleton">
      <Stack gap={4}>
        <div className="problem-preview-card__content">
          <SkeletonText heading width="220px" />
          <Stack
            orientation="horizontal"
            gap={3}
            className="problem-preview-card__meta"
          >
            <span className="problem-preview-card__status-placeholder" />
            <SkeletonText width="60px" />
            <SkeletonText width="80px" />
            <SkeletonText width="100px" />
          </Stack>
        </div>
        <div className="problem-preview-card__actions">
          <span className="problem-preview-card__status-placeholder" />
        </div>
      </Stack>
    </ClickableTile>
  </Layer>
);

export default ProblemPreviewSection;
