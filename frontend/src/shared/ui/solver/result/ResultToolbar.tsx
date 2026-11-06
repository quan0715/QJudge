import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "@carbon/react";
import {
  Chemistry,
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
  /** Disable 測試 (a test run is in progress) */
  testDisabled?: boolean;
  /** Disable 繳交 (a submit request is in flight) */
  submitDisabled?: boolean;
  /** Offer the submission history tab. */
  hasSubmissions?: boolean;
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
  testDisabled = false,
  submitDisabled = false,
  hasSubmissions = false,
}) => {
  const { t } = useTranslation();
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
      {/* Left: named tabs, so each one says what it opens. No selection while collapsed. */}
      <div className="result-toolbar__modes" role="group" aria-label={t("solver.panelTabs", "結果面板")}>
        {([
          ["testcases", t("solver.tabs.testcases", "測資")],
          ["results", t("solver.tabs.results", "結果")],
          ...(hasSubmissions ? [["submissions", t("solver.tabs.submissions", "提交紀錄")] as const] : []),
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="result-toolbar__tab"
            aria-pressed={!collapsed && mode === value}
            onClick={() => handleModeChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right: Actions */}
      <div className="result-toolbar__actions">
        {onRunTest && (
          <Button
            kind="ghost"
            size="md"
            renderIcon={Chemistry}
            onClick={handleRunTest}
            disabled={testDisabled}
          >
            {t("solver.test", "測試")}
          </Button>
        )}

        {onSubmit && (
          <Button
            kind="primary"
            size="md"
            renderIcon={SendFilled}
            onClick={handleSubmit}
            disabled={submitDisabled}
          >
            {t("solver.submit", "繳交")}
          </Button>
        )}

        {/* Collapse/Expand toggle */}
        {onToggle && (
          <Tooltip label={collapsed ? "展開" : "收合"} align="top">
            <Button
              kind="ghost"
              size="md"
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
