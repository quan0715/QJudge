import React from "react";
import { Layer } from "@carbon/react";
import { Information } from "@carbon/icons-react";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import type { ExecutionState, ResultMode } from "@/core/types/solver.types";
import { ResultToolbar } from "./ResultToolbar";
import { EditTestCasesPanel } from "./testcases";
import { ResultsPanel } from "./execution";
import "./ResultPanel.scss";

// Re-export for backward compatibility
export type { ResultMode };

interface ResultPanelProps {
  // Mode control
  mode: ResultMode;
  onModeChange: (mode: ResultMode) => void;
  collapsed?: boolean;
  onToggle?: () => void;

  // Data & Actions
  testCases: TestCaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onAddTestCase: (input: string, output: string) => void;
  onDeleteTestCase: (id: string) => void;
  onUpdateTestCase?: (id: string, input: string, output: string) => void;

  // Actions
  onRunTest?: () => void;
  onSubmit?: () => void;

  // Execution
  executionState: ExecutionState;
}

/**
 * Empty state component for results panel
 */
const EmptyResultState: React.FC<{ onRunTest?: () => void }> = ({
  onRunTest,
}) => (
  <div className="result-panel__empty">
    <Information size={48} />
    <p className="result-panel__empty-title">尚無測試結果</p>
    <p className="result-panel__empty-subtitle">
      {onRunTest ? "點擊上方「測試」按鈕執行測試" : "請先執行測試"}
    </p>
  </div>
);

/**
 * ResultPanel - IDE-style bottom panel with toolbar
 *
 * Structure:
 * - ResultToolbar: mode buttons + action buttons + collapse toggle
 * - Content area: EditTestCasesPanel or ResultsPanel (hidden when collapsed)
 *
 * Height behavior:
 * - Collapsed: toolbar only (48px)
 * - Expanded: toolbar + content (fills Panel)
 */
export const ResultPanel: React.FC<ResultPanelProps> = ({
  mode,
  onModeChange,
  collapsed = false,
  onToggle,
  testCases,
  selectedCaseId,
  onSelectCase,
  onAddTestCase,
  onDeleteTestCase,
  onUpdateTestCase,
  executionState,
  onRunTest,
  onSubmit,
}) => {
  // Check if we have results to show
  const { status, result } = executionState;
  const hasResults = status !== "idle" || result !== null;
  const isRunning = status === "running" || status === "polling";

  // Render content based on mode
  const renderContent = () => {
    if (mode === "testcases") {
      return (
        <EditTestCasesPanel
          testCases={testCases}
          selectedCaseId={selectedCaseId}
          onSelectCase={onSelectCase}
          onAddTestCase={onAddTestCase}
          onDeleteTestCase={onDeleteTestCase}
          onUpdateTestCase={onUpdateTestCase}
        />
      );
    }

    // Results mode - show empty state if no results and not running
    if (!hasResults && !isRunning) {
      return <EmptyResultState onRunTest={onRunTest} />;
    }

    // Results mode - show ResultsPanel (handles its own skeleton/loading states)
    return <ResultsPanel executionState={executionState} testCases={testCases} />;
  };

  return (
    <Layer level={0} className="result-panel">
      {/* Toolbar - always visible */}
      <ResultToolbar
        mode={mode}
        onModeChange={onModeChange}
        collapsed={collapsed}
        onToggle={onToggle}
        onRunTest={onRunTest}
        onSubmit={onSubmit}
        isRunning={isRunning}
      />

      {/* Content - hidden when collapsed */}
      {!collapsed && (
        <div className="result-panel__content">{renderContent()}</div>
      )}
    </Layer>
  );
};

export default ResultPanel;
