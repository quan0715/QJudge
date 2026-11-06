import React, { useCallback, useState, useEffect } from "react";
import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import { useProblemSolver } from "@/features/problems/hooks/useProblemSolver";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import { SolverLayout } from "@/shared/layout/SolverLayout";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

// Import solver sub-components from shared UI
import { StatementPanel, EditorContent, ResultPanel } from "@/shared/ui/solver";

import "./ProblemFullPageSolve.scss";

interface ProblemFullPageSolveProps {
  /** The problem to solve */
  problem: CodingProblemDetail;
  statementNavigation?: {
    activeTabIndex: number;
    selectTab: (index: number) => void;
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
  };
  onAccepted?: (problemId: string) => void;
  /** Problem label (e.g. "A" for contest) */
  problemLabel?: string;
  /** Contest that owns this problem session */
  contestId: string;
  /** Optional menu panel (for contest mode with ProblemMenu) */
  menuPanel?: React.ReactNode;
  /** Disable text selection/copy for exam mode */
  disableCopy?: boolean;
  /** Disable submission button */
  submissionDisabled?: boolean;
  /** Contest-scoped submissions tab content */
  renderSubmissions: () => React.ReactNode;
  /** Footer under the statement, e.g. previous / next question. */
  statementFooter?: React.ReactNode;
}

/**
 * ProblemFullPageSolve - Full-screen IDE-style problem solving interface
 *
 * Contest-scoped full-screen interface for solving coding problems.
 */
export const ProblemFullPageSolve: React.FC<ProblemFullPageSolveProps> = (props) => {
  const { user } = useAuth();
  const userId = user ? String(user.id) : null;
  // Remount the editor on identity changes so the prior account's in-memory
  // draft cannot be displayed or persisted under the next account's key.
  return <ProblemSolveSession key={userId ?? "anonymous"} {...props} userId={userId} />;
};

const ProblemSolveSession: React.FC<ProblemFullPageSolveProps & { userId: string | null }> = ({
  problem,
  problemLabel = "",
  statementNavigation,
  onAccepted,
  contestId,
  menuPanel,
  disableCopy = false,
  submissionDisabled = false,
  renderSubmissions,
  userId,
  statementFooter,
}) => {
  const { t } = useTranslation("contest");
  // Use the problem solver hook
  const solver = useProblemSolver({
    problem,
    contestId,
    problemLabel,
    userId,
  });

  useEffect(() => {
    if (solver.executionState.type === "submit" &&
        solver.executionState.status === "complete" &&
        solver.executionState.result?.type === "submit" &&
        solver.executionState.result.status === "AC") {
      onAccepted?.(problem.id);
    }
  }, [solver.executionState, problem.id, onAccepted]);

  const { confirm, modalProps } = useConfirmModal();
  const { hasPendingSubmission, submit } = solver;
  const handleSubmit = useCallback(async () => {
    if (hasPendingSubmission && !(await confirm({
      title: "目前尚有提交在進行中",
      body: `${problemLabel} 題的上一筆提交還在判題，確定要再繳交一次嗎？`,
      confirmLabel: "繳交",
      cancelLabel: "取消",
    }))) return;
    await submit();
  }, [confirm, hasPendingSubmission, problemLabel, submit]);

  // Get editor settings from user preferences
  const { editorFontSize, editorTabSize, updateEditorSettings } =
    useUserPreferences();

  // Statement panel collapsed state (controlled by this component)
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const statementCollapsed = statementNavigation?.collapsed ?? internalCollapsed;
  const setStatementCollapsed = statementNavigation?.setCollapsed ?? setInternalCollapsed;


  // Handle editor settings change
  const handleEditorSettingsChange = useCallback(
    (settings: { fontSize?: number; tabSize?: 2 | 4 }) => {
      updateEditorSettings(settings);
    },
    [updateEditorSettings]
  );

  // Render statement content based on activeTabIndex
  const renderStatementContent = useCallback(
    () => (
      <StatementPanel
        problem={problem}
        activeTabIndex={0}
        disableCopy={disableCopy}
        renderSubmissions={renderSubmissions}
      />
    ),
    [problem, disableCopy, renderSubmissions]
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
        allowStatementCollapse={false}
        externalStatementNavigation={false}
        statementTitle={t("answering.workspace.statement", "題目內容")}
        statementFooter={statementFooter}
        activeTabIndex={0}
        menuPanel={menuPanel}
        renderStatementContent={renderStatementContent}
        editorPanel={
          <EditorContent
            code={solver.code}
            onCodeChange={solver.setCode}
            language={solver.language}
            onLanguageChange={solver.setLanguage}
            languageOptions={solver.languageOptions}
            fontSize={editorFontSize}
            tabSize={editorTabSize}
            onEditorSettingsChange={handleEditorSettingsChange}
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
            onSubmit={submissionDisabled ? undefined : handleSubmit}
            testDisabled={solver.testRunning}
            submitDisabled={solver.submitting}
          />
        }
        statementCollapsed={statementCollapsed}
        onStatementCollapsedChange={setStatementCollapsed}
        resultCollapsed={!solver.resultOpen}
      />
      {modalProps.open && <ConfirmModal {...modalProps} />}
    </div>
  );
};

export default ProblemFullPageSolve;
