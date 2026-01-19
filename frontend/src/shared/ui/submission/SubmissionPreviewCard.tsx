import React from "react";
import { Tag } from "@carbon/react";
import { Time, DataBase } from "@carbon/icons-react";
import type { Submission } from "@/core/entities/submission.entity";
import { getStatusConfig } from "@/core/config/status.config";
import { formatSmartTime } from "@/shared/utils/format";
import "./SubmissionPreviewCard.scss";

export interface SubmissionPreviewCardProps {
  /** The submission to display */
  submission: Submission;
  /** Click handler */
  onClick?: () => void;
  /** Whether to show the score */
  showScore?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

/**
 * SubmissionPreviewCard - A card component for displaying submission previews
 *
 * Features:
 * - Status badge with color coding (using shared statusConfig)
 * - Language tag
 * - Score (optional)
 * - Execution time with icon
 * - Memory usage with icon
 * - Relative time since submission
 * - Compact mode for space-constrained layouts
 */
export const SubmissionPreviewCard: React.FC<SubmissionPreviewCardProps> = ({
  submission,
  onClick,
  showScore = true,
  compact = false,
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  // Use shared status config
  const statusConfig = getStatusConfig(submission.status);
  const iconSize = compact ? 14 : 16;

  return (
    <div
      className={`submission-preview-card ${
        compact ? "submission-preview-card--compact" : ""
      } ${onClick ? "submission-preview-card--clickable" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Status Badge */}
      <div className="submission-preview-card__status">
        <Tag type={statusConfig.type} size={compact ? "sm" : "md"}>
          {submission.status}
        </Tag>
      </div>

      {/* Language Tag */}
      <div className="submission-preview-card__language">
        <Tag type="cool-gray" size={compact ? "sm" : "md"}>
          {submission.language}
        </Tag>
      </div>

      {/* Score (optional) */}
      {showScore && submission.score !== undefined && (
        <div className="submission-preview-card__score">
          <span className="submission-preview-card__score-value">
            {submission.score}
          </span>
          <span className="submission-preview-card__score-label">分</span>
        </div>
      )}

      {/* Metrics Row: Time & Memory */}
      <div className="submission-preview-card__metrics">
        {/* Execution Time */}
        {submission.execTime !== undefined && (
          <div className="submission-preview-card__metric">
            <Time size={iconSize} />
            <span>{submission.execTime} ms</span>
          </div>
        )}

        {/* Memory Usage */}
        {submission.memoryUsage !== undefined && (
          <div className="submission-preview-card__metric">
            <DataBase size={iconSize} />
            <span>{Math.round(submission.memoryUsage / 1024)} MB</span>
          </div>
        )}
      </div>

      {/* Submission Time */}
      <div className="submission-preview-card__created">
        <span className="submission-preview-card__created-text">
          {formatSmartTime(submission.createdAt)}
        </span>
      </div>
    </div>
  );
};

export default SubmissionPreviewCard;
