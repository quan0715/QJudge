import React, { useCallback, useState } from "react";
import { InlineNotification } from "@carbon/react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { useProblemSolver } from "@/features/problems/hooks/useProblemSolver";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import { SolverLayout } from "@/shared/layout/SolverLayout";

// Import solver sub-components from shared UI
import { StatementPanel, EditorContent, ResultPanel } from "@/shared/ui/solver";

// Import feature-specific submission list
import { ProblemSubmissionList } from "@/features/problems/components/solve/submissions";

import "./ProblemFullPageSolve.scss";

interface ProblemFullPageSolveProps {
  /** The problem to solve */
  problem: ProblemDetail;
  /** Problem label (e.g. "A" for contest) */
  problemLabel?: string;
  /** Optional contest ID for contest mode */
  contestId?: string;
  /** Optional menu panel (for contest mode with ProblemMenu) */
  menuPanel?: React.ReactNode;
  /** Disable text selection/copy for exam mode */
  disableCopy?: boolean;
  /** Disable submission button */
  submissionDisabled?: boolean;
  /** Optional render function for submissions tab content (for contest mode) */
  renderSubmissions?: () => React.ReactNode;
}

/**
 * ProblemFullPageSolve - Full-screen IDE-style problem solving interface
 *
 * This is the core reusable component for solving problems.
 * - Contest mode: Uses renderSubmissions prop passed from parent
 * - Standalone mode: Uses built-in ProblemSubmissionList
 */
export const ProblemFullPageSolve: React.FC<ProblemFullPageSolveProps> = ({
  problem,
  problemLabel = "",
  contestId,
  menuPanel,
  disableCopy = false,
  submissionDisabled = false,
  renderSubmissions,
}) => {
  // Use the problem solver hook
  const solver = useProblemSolver({
    problem,
    contestId,
    problemLabel,
  });

  // Get editor settings from user preferences
  const { editorFontSize, editorTabSize, updateEditorSettings } =
    useUserPreferences();

  // Statement panel collapsed state (controlled by this component)
  const [statementCollapsed, setStatementCollapsed] = useState(false);

  // Collapse all panels (one-click to maximize editor space)
  const handleCollapseAll = useCallback(() => {
    setStatementCollapsed(true);
    // Close result panel if open
    if (solver.resultOpen) {
      solver.toggleResult();
    }
  }, [solver]);

  // Handle editor settings change
  const handleEditorSettingsChange = useCallback(
    (settings: { fontSize?: number; tabSize?: 2 | 4 }) => {
      updateEditorSettings(settings);
    },
    [updateEditorSettings]
  );

  // Determine mode
  const isContestMode = !!contestId;

  // Render statement content based on activeTabIndex
  const renderStatementContent = useCallback(
    (activeTabIndex: number) => (
      <StatementPanel
        problem={problem}
        activeTabIndex={activeTabIndex}
        disableCopy={isContestMode && disableCopy}
        renderSubmissions={
          isContestMode
            ? renderSubmissions
            : () => <ProblemSubmissionList problemId={problem.id} />
        }
      />
    ),
    [problem, disableCopy, isContestMode, renderSubmissions]
  );

  return (
    <div className="problem-full-page-solve">
      {/* Error notification */}
      {solver.error && (
        <div className="problem-full-page-solve__error-banner">
          <InlineNotification
            kind="error"
            title="錯誤"
            subtitle={solver.error}
            hideCloseButton={false}
          />
        </div>
      )}

      <SolverLayout
        menuPanel={menuPanel}
        renderStatementContent={renderStatementContent}
        editorPanel={
          <EditorContent
            code={solver.code}
            onCodeChange={solver.setCode}
            language={solver.language}
            onLanguageChange={solver.setLanguage}
            fontSize={editorFontSize}
            tabSize={editorTabSize}
            onEditorSettingsChange={handleEditorSettingsChange}
            onCollapseAll={handleCollapseAll}
          />
        }
        resultPanel={
          <ResultPanel
            mode={solver.resultMode}
            onModeChange={solver.setResultMode}
            testCases={solver.testCases}
            selectedCaseId={solver.selectedCaseId}
            onSelectCase={solver.selectCase}
            onAddTestCase={solver.addTestCase}
            onDeleteTestCase={solver.deleteTestCase}
            onUpdateTestCase={solver.updateTestCase}
            executionState={solver.executionState}
            collapsed={!solver.resultOpen}
            onToggle={solver.toggleResult}
            onRunTest={submissionDisabled ? undefined : solver.runTest}
            onSubmit={submissionDisabled ? undefined : solver.submit}
          />
        }
        statementCollapsed={statementCollapsed}
        onStatementCollapsedChange={setStatementCollapsed}
        resultCollapsed={!solver.resultOpen}
      />
    </div>
  );
};

export default ProblemFullPageSolve;
