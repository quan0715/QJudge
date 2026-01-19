import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button, Tooltip } from "@carbon/react";
import {
  DocumentBlank,
  RecentlyViewed,
  ChevronLeft,
} from "@carbon/icons-react";
import "./SolverLayout.scss";

/** Tab definition for statement panel */
export interface StatementTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface SolverLayoutProps {
  menuPanel?: React.ReactNode;
  /** Render function for statement content, receives activeTabIndex */
  renderStatementContent: (activeTabIndex: number) => React.ReactNode;
  /** Custom tabs configuration, defaults to 題目/繳交記錄 */
  statementTabs?: StatementTab[];
  editorPanel: React.ReactNode;
  resultPanel: React.ReactNode;
  /** Controlled statement collapsed state */
  statementCollapsed?: boolean;
  /** Callback when statement collapsed state changes */
  onStatementCollapsedChange?: (collapsed: boolean) => void;
  resultCollapsed?: boolean;
}

// Collapsed size in pixels
const COLLAPSED_SIZE_PX = 48;
const MIN_STATEMENT_WIDTH = 200;
const MIN_EDITOR_HEIGHT = 100;
const MIN_RESULT_HEIGHT = 100;

// LocalStorage key for statement width
const STATEMENT_WIDTH_STORAGE_KEY = "solver-layout:statement-width";
const DEFAULT_STATEMENT_WIDTH_PERCENT = 35; // 50% of available width

// Default statement tabs configuration
const DEFAULT_STATEMENT_TABS: StatementTab[] = [
  { id: "problem", icon: DocumentBlank, label: "題目" },
  { id: "submissions", icon: RecentlyViewed, label: "繳交記錄" },
];

/**
 * SolverLayout - IDE-style layout for problem solving
 *
 * Layout structure:
 * ┌────┬──────────────┬─────────────────────────┐
 * │    │              │      Editor (Top)       │
 * │Menu│  Statement   ├─────────────────────────┤
 * │48px│   (Left)     │    Result (Bottom)      │
 * │    │  可收合48px  │    可收合48px           │
 * └────┴──────────────┴─────────────────────────┘
 */
export const SolverLayout: React.FC<SolverLayoutProps> = ({
  menuPanel,
  renderStatementContent,
  statementTabs = DEFAULT_STATEMENT_TABS,
  editorPanel,
  resultPanel,
  statementCollapsed: statementCollapsedProp,
  onStatementCollapsedChange,
  resultCollapsed: resultCollapsedProp,
}) => {
  // Internal state for uncontrolled mode
  const [statementCollapsedInternal, setStatementCollapsedInternal] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Use controlled state if provided, otherwise use internal state
  const isControlled = statementCollapsedProp !== undefined;
  const statementCollapsed = isControlled ? statementCollapsedProp : statementCollapsedInternal;

  // Update collapsed state (works for both controlled and uncontrolled)
  const setStatementCollapsed = (collapsed: boolean) => {
    if (isControlled) {
      onStatementCollapsedChange?.(collapsed);
    } else {
      setStatementCollapsedInternal(collapsed);
    }
  };

  // Use prop for result collapsed state
  const resultCollapsed = resultCollapsedProp ?? false;

  // Resize state - initialize from localStorage using lazy initializer
  const [statementWidth, setStatementWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 500; // SSR fallback
    const savedWidth = localStorage.getItem(STATEMENT_WIDTH_STORAGE_KEY);
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= MIN_STATEMENT_WIDTH) {
        return parsed;
      }
    }
    // Default: estimate 50% of typical viewport (will be recalculated on mount)
    return Math.max(MIN_STATEMENT_WIDTH, window.innerWidth * 0.35);
  });
  const statementWidthRef = useRef(statementWidth);
  const [editorHeightPercent, setEditorHeightPercent] = useState(50); // %
  const layoutRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const hasInitializedWidth = useRef(false);

  // Dragging state
  const isDraggingHorizontal = useRef(false);
  const isDraggingVertical = useRef(false);

  // Recalculate 50% width on first render if no saved width
  useEffect(() => {
    if (hasInitializedWidth.current) return;
    hasInitializedWidth.current = true;

    const savedWidth = localStorage.getItem(STATEMENT_WIDTH_STORAGE_KEY);
    if (savedWidth) return; // Already loaded from localStorage

    // Calculate 50% of available width on mount
    if (layoutRef.current) {
      const layoutWidth = layoutRef.current.getBoundingClientRect().width;
      const menuWidth = menuPanel ? 48 : 0;
      const availableWidth = layoutWidth - menuWidth;
      const defaultWidth = Math.max(
        MIN_STATEMENT_WIDTH,
        availableWidth * (DEFAULT_STATEMENT_WIDTH_PERCENT / 100)
      );
      setStatementWidth(defaultWidth);
    }
  }, [menuPanel]);

  useEffect(() => {
    statementWidthRef.current = statementWidth;
  }, [statementWidth]);

  // Save statement width to localStorage when it changes (debounced via resize handler)
  const saveStatementWidth = useCallback((width: number) => {
    if (width >= MIN_STATEMENT_WIDTH) {
      localStorage.setItem(
        STATEMENT_WIDTH_STORAGE_KEY,
        String(Math.round(width))
      );
    }
  }, []);

  // Handle tab click - expand if collapsed and switch tab
  const handleTabClick = (index: number) => {
    if (statementCollapsed) {
      setStatementCollapsed(false);
    }
    setActiveTabIndex(index);
  };

  // Horizontal resize (statement width)
  const handleHorizontalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHorizontal.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Vertical resize (editor/result height)
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVertical.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingHorizontal.current && layoutRef.current) {
        const layoutRect = layoutRef.current.getBoundingClientRect();
        const menuWidth = menuPanel ? 48 : 0;
        const newWidth = e.clientX - layoutRect.left - menuWidth;
        const maxWidth = layoutRect.width - menuWidth - 300; // Leave 300px for right column
        setStatementWidth(
          Math.max(MIN_STATEMENT_WIDTH, Math.min(newWidth, maxWidth))
        );
      }

      if (isDraggingVertical.current && rightColumnRef.current) {
        const columnRect = rightColumnRef.current.getBoundingClientRect();
        const relativeY = e.clientY - columnRect.top;
        const totalHeight = columnRect.height;
        const percent = (relativeY / totalHeight) * 100;
        const minEditorPercent = (MIN_EDITOR_HEIGHT / totalHeight) * 100;
        const maxEditorPercent = 100 - (MIN_RESULT_HEIGHT / totalHeight) * 100;
        setEditorHeightPercent(
          Math.max(minEditorPercent, Math.min(percent, maxEditorPercent))
        );
      }
    };

    const handleMouseUp = () => {
      // Save to localStorage when done dragging horizontal
      if (isDraggingHorizontal.current) {
        saveStatementWidth(statementWidthRef.current);
      }
      isDraggingHorizontal.current = false;
      isDraggingVertical.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [menuPanel, saveStatementWidth]);

  return (
    <div className="solver-layout" ref={layoutRef}>
      {/* Optional Menu Panel - Fixed 48px */}
      {menuPanel && <div className="solver-layout__menu">{menuPanel}</div>}

      {/* Statement Panel */}
      <div
        className={`solver-layout__statement ${
          statementCollapsed ? "solver-layout__statement--collapsed" : ""
        }`}
        style={{
          width: statementCollapsed
            ? `${COLLAPSED_SIZE_PX}px`
            : `${statementWidth}px`,
        }}
      >
        {statementCollapsed ? (
          // Collapsed: show icon entries vertically (no selection state)
          <div className="solver-layout__collapsed-bar">
            {statementTabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  kind="ghost"
                  hasIconOnly
                  renderIcon={() => <Icon size={20} />}
                  iconDescription={tab.label}
                  onClick={() => handleTabClick(index)}
                />
              );
            })}
          </div>
        ) : (
          // Expanded: show tabs header and content
          <div className="solver-layout__statement-content">
            <div className="solver-layout__statement-header">
              <div className="solver-layout__statement-tabs">
                {statementTabs.map((tab, index) => {
                  const Icon = tab.icon;
                  return (
                    <Tooltip key={tab.id} label={tab.label} align="bottom">
                      <Button
                        kind={activeTabIndex === index ? "tertiary" : "ghost"}
                        hasIconOnly
                        renderIcon={() => <Icon size={20} />}
                        iconDescription={tab.label}
                        onClick={() => setActiveTabIndex(index)}
                      />
                    </Tooltip>
                  );
                })}
              </div>
              <Button
                kind="ghost"
                hasIconOnly
                renderIcon={ChevronLeft}
                iconDescription="收合"
                onClick={() => setStatementCollapsed(true)}
              />
            </div>
            <div className="solver-layout__statement-body">
              {renderStatementContent(activeTabIndex)}
            </div>
          </div>
        )}
      </div>

      {/* Horizontal Resize Handle */}
      {!statementCollapsed && (
        <div
          className="solver-layout__resize-handle solver-layout__resize-handle--horizontal"
          onMouseDown={handleHorizontalMouseDown}
        />
      )}

      {/* Right Column: Editor + Result */}
      <div className="solver-layout__right" ref={rightColumnRef}>
        {/* Editor Panel */}
        <div
          className="solver-layout__editor"
          style={{
            height: resultCollapsed
              ? `calc(100% - ${COLLAPSED_SIZE_PX}px)`
              : `calc(${editorHeightPercent}% - 1px)`, // -1px for resize handle
            flex: "none",
          }}
        >
          {editorPanel}
        </div>

        {/* Vertical Resize Handle */}
        {!resultCollapsed && (
          <div
            className="solver-layout__resize-handle solver-layout__resize-handle--vertical"
            onMouseDown={handleVerticalMouseDown}
          />
        )}

        {/* Result Panel */}
        <div
          className={`solver-layout__result ${
            resultCollapsed ? "solver-layout__result--collapsed" : ""
          }`}
          style={{
            height: resultCollapsed
              ? `${COLLAPSED_SIZE_PX}px`
              : `calc(${100 - editorHeightPercent}% - 1px)`,
            flex: "none",
          }}
        >
          {resultPanel}
        </div>
      </div>
    </div>
  );
};

export default SolverLayout;
