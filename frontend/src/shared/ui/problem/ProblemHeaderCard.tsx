import React from "react";
import { Time, DataBase } from "@carbon/icons-react";
import type { ProblemDetail, Difficulty } from "@/core/entities/problem.entity";
import { DifficultyBadge } from "@/shared/ui/tag/DifficultyBadge";
import { CategoryTag } from "@/shared/ui/tag/CategoryTag";
import { AcrBadge } from "@/shared/ui/tag/AcrBadge";
import "./ProblemHeaderCard.scss";

// ============================================================================
// Types
// ============================================================================

interface ProblemHeaderCardProps {
  /** Problem data */
  problem: ProblemDetail;
  /** Optional problem label (e.g., "A" for contest) */
  problemLabel?: string;
  /** Show AC rate badge */
  showAcRate?: boolean;
  /** Show time/memory limits */
  showLimits?: boolean;
  /** Show category tags */
  showTags?: boolean;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * ProblemHeaderCard - A compact header card displaying problem information
 *
 * Features:
 * - Title with optional problem label
 * - Difficulty badge (color-coded)
 * - AC Rate badge with ring indicator
 * - Category tags (collapsible)
 * - Time/Memory limits
 */
export const ProblemHeaderCard: React.FC<ProblemHeaderCardProps> = ({
  problem,
  problemLabel,
  showAcRate = true,
  showLimits = true,
  showTags = true,
  className,
}) => {
  // Calculate AC rate
  const acRate =
    problem.submissionCount && problem.submissionCount > 0
      ? ((problem.acceptedCount || 0) / problem.submissionCount) * 100
      : 0;

  // Extract tag names
  const tagNames = problem.tags?.map((tag) => tag.name) || [];

  // Title with optional label
  const displayTitle = problemLabel
    ? `${problemLabel}. ${problem.title}`
    : problem.title;

  return (
    <div className={`problem-header-card ${className || ""}`}>
      {/* Title Row */}
      <div className="problem-header-card__title-row">
        <h2 className="problem-header-card__title">{displayTitle}</h2>
      </div>

      {/* Badges Row */}
      <div className="problem-header-card__badges">
        <DifficultyBadge
          difficulty={problem.difficulty as Difficulty}
          size="md"
        />
        {showAcRate && <AcrBadge value={acRate} size="md" />}
        {showTags && tagNames.length > 0 && (
          <CategoryTag labels={tagNames} maxVisible={3} size="md" />
        )}
      </div>

      {/* Limits Row */}
      {showLimits && (
        <div className="problem-header-card__limits">
          <div className="problem-header-card__limit-item">
            <Time size={16} />
            <span className="problem-header-card__limit-label">Time Limit</span>
            <span className="problem-header-card__limit-value">
              {problem.timeLimit} ms
            </span>
          </div>
          <div className="problem-header-card__limit-item">
            <DataBase size={16} />
            <span className="problem-header-card__limit-label">
              Memory Limit
            </span>
            <span className="problem-header-card__limit-value">
              {problem.memoryLimit} KB
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProblemHeaderCard;
