import React from "react";
import {
  Layer,
  SkeletonText,
  SkeletonPlaceholder,
} from "@carbon/react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { ProblemPreview, ProblemHeaderCard } from "@/shared/ui/problem";
// Import solver styles
import "../styles/_solver-statement.scss";

interface StatementPanelProps {
  problem: ProblemDetail | null;
  /** Active tab index from SolverLayout */
  activeTabIndex: number;
  /** Disable text selection/copy for contest mode */
  disableCopy?: boolean;
  /** Loading state for skeleton */
  loading?: boolean;
  /** Render prop for submissions tab content */
  renderSubmissions?: () => React.ReactNode;
}

/**
 * StatementPanel - Renders problem statement content based on activeTabIndex
 *
 * Tab indices:
 * - 0: 題目 (Problem Description) - Always shows ProblemHeaderCard + ProblemPreview
 * - 1: 繳交記錄 (My Submissions)
 *
 * The submissions content is provided via renderSubmissions prop to maintain
 * architecture boundaries (shared layer should not import from features).
 *
 * Note: Collapse/expand and tab switching is handled by SolverLayout
 */
export const StatementPanel: React.FC<StatementPanelProps> = ({
  problem,
  activeTabIndex,
  disableCopy = false,
  loading = false,
  renderSubmissions,
}) => {
  // Handle right-click prevention when copy is disabled
  const handleContextMenu = (e: React.MouseEvent) => {
    if (disableCopy) {
      e.preventDefault();
    }
  };

  // Skeleton loading state
  if (loading) {
    return (
      <Layer className="statement-panel statement-panel--loading">
        {/* Skeleton Content */}
        <div className="statement-panel__content">
          <div className="statement-panel__skeleton-section">
            <SkeletonText heading width="30%" />
          </div>
          <SkeletonText paragraph lineCount={4} />
          <div className="statement-panel__skeleton-subsection">
            <SkeletonText heading width="25%" />
          </div>
          <SkeletonText paragraph lineCount={3} />
          <div className="statement-panel__skeleton-subsection">
            <SkeletonText heading width="20%" />
          </div>
          <SkeletonPlaceholder className="statement-panel__skeleton-block" />
        </div>
      </Layer>
    );
  }

  // Render submissions content
  const renderSubmissionsContent = () => {
    if (renderSubmissions) {
      return renderSubmissions();
    }
    // Fallback: Empty state
    return (
      <div className="statement-panel__empty">
        <p>尚無繳交記錄</p>
      </div>
    );
  };

  return (
    <Layer
      className={`statement-panel ${disableCopy ? "statement-panel--no-copy" : ""}`}
      onContextMenu={handleContextMenu}
    >
      {/* Tab Content */}
      <div className="statement-panel__tab-content">
        {activeTabIndex === 0 && (
          <div className="statement-panel__content">
            {problem ? (
              <>
                <ProblemHeaderCard problem={problem} />
                <ProblemPreview
                  problem={problem}
                  showLanguageToggle={(problem.translations?.length ?? 0) > 1}
                  compact
                />
              </>
            ) : (
              <div className="statement-panel__empty">
                <p>請選擇題目</p>
              </div>
            )}
          </div>
        )}

        {activeTabIndex === 1 && (
          <div className="statement-panel__content">
            {renderSubmissionsContent()}
          </div>
        )}
      </div>
    </Layer>
  );
};

export default StatementPanel;
