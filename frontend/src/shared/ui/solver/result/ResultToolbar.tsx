import React from "react";
import { Button, Tooltip } from "@carbon/react";
import {
  Edit,
  Terminal,
  PlayFilledAlt,
  SendFilled,
  ChevronUp,
  ChevronDown,
} from "@carbon/icons-react";
import type { ResultMode } from "@/core/types/solver.types";
import "./ResultToolbar.scss";

interface ResultToolbarProps {
  /** Current active mode */
  mode: ResultMode;
  /** Callback when mode changes */
  onModeChange: (mode: ResultMode) => void;
  /** Whether the panel is collapsed */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onToggle?: () => void;
  /** Run test callback */
  onRunTest?: () => void;
  /** Submit callback */
  onSubmit?: () => void;
  /** Whether test is running */
  isRunning?: boolean;
}

/**
 * ResultToolbar - Simple toolbar for Result Panel
 *
 * Contains:
 * - Mode buttons (Edit Test Cases / Results)
 * - Action buttons (Run Test / Submit)
 * - Collapse/Expand toggle
 *
 * Auto-expands when any button is clicked while collapsed
 */
export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  mode,
  onModeChange,
  collapsed = false,
  onToggle,
  onRunTest,
  onSubmit,
  isRunning = false,
}) => {
  // Helper to auto-expand if collapsed
  const expandIfCollapsed = () => {
    if (collapsed && onToggle) {
      onToggle();
    }
  };

  const handleModeChange = (newMode: ResultMode) => {
    onModeChange(newMode);
    expandIfCollapsed();
  };

  const handleRunTest = () => {
    if (onRunTest) {
      onRunTest();
      onModeChange("results");
      // Note: onRunTest 內部已經會調用 setResultOpen(true) 展開 panel
    }
  };

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit();
      onModeChange("results");
      // Note: onSubmit 內部已經會調用 setResultOpen(true) 展開 panel
    }
  };

  return (
    <div className="result-toolbar">
      {/* Left: Mode buttons - no selection state when collapsed */}
      <div className="result-toolbar__modes">
        <Tooltip label="編輯測資" align="top">
          <Button
            kind={!collapsed && mode === "testcases" ? "tertiary" : "ghost"}
            hasIconOnly
            renderIcon={Edit}
            iconDescription="編輯測資"
            onClick={() => handleModeChange("testcases")}
          />
        </Tooltip>

        <Tooltip label="執行結果" align="top">
          <Button
            kind={!collapsed && mode === "results" ? "tertiary" : "ghost"}
            hasIconOnly
            renderIcon={Terminal}
            iconDescription="執行結果"
            onClick={() => handleModeChange("results")}
          />
        </Tooltip>
      </div>

      {/* Right: Actions */}
      <div className="result-toolbar__actions">
        {onRunTest && (
          <Tooltip label="測試" align="top">
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={PlayFilledAlt}
              iconDescription="測試"
              onClick={handleRunTest}
              disabled={isRunning}
            />
          </Tooltip>
        )}

        {onSubmit && (
          <Button
            kind="primary"
            renderIcon={SendFilled}
            onClick={handleSubmit}
            disabled={isRunning}
          >
            繳交
          </Button>
        )}

        {/* Collapse/Expand toggle */}
        {onToggle && (
          <Tooltip label={collapsed ? "展開" : "收合"} align="top">
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={collapsed ? ChevronUp : ChevronDown}
              iconDescription={collapsed ? "展開面板" : "收合面板"}
              onClick={onToggle}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default ResultToolbar;
