import React from "react";
import { Group, Panel } from "react-resizable-panels";
import { ResizeHandle } from "@/shared/ui/resize";
import "./EditorLayout.scss";

interface EditorLayoutProps {
  /** Left panel content (SideNav) */
  leftPanel: React.ReactNode;
  /** Center panel content */
  centerPanel: React.ReactNode;
  /** Right panel content */
  rightPanel: React.ReactNode;
  /** Whether left panel is collapsed (rail mode) */
  leftCollapsed?: boolean;
  /** Whether right panel is collapsed */
  rightCollapsed?: boolean;
  /** ID for persisting panel sizes to localStorage (Disabled) */
  autoSaveId?: string;
}

/**
 * Three-column editor layout designed for Carbon SideNav Rail.
 * Left panel: SideNav Rail (48px collapsed, 256px expanded)
 * Center + Right: Resizable split using react-resizable-panels
 */
export const EditorLayout: React.FC<EditorLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
  leftCollapsed = false,
  rightCollapsed = false,
  // autoSaveId = "editor-layout", // Disabled due to type issues with Group
}) => {
  // SideNav Rail widths: 48px when collapsed, 256px when expanded
  const sideNavWidth = leftCollapsed ? "48px" : "256px";

  return (
    <div className="editor-layout">
      {/* Left Panel - SideNav Container */}
      <aside
        className="editor-layout__left"
        style={{ width: sideNavWidth, minWidth: sideNavWidth }}
      >
        {leftPanel}
      </aside>

      {/* Center + Right: Resizable Split */}
      <Group 
        orientation="horizontal" 
        className="editor-layout__main"
      >
        {/* Center Panel */}
        <Panel id="center" defaultSize={50} minSize={30} className="editor-layout__center">
          {centerPanel}
        </Panel>

        {/* Right Panel (collapsible) */}
        {!rightCollapsed && (
          <>
            <ResizeHandle orientation="vertical" />
            <Panel id="right" defaultSize={50} minSize={20} className="editor-layout__right">
              {rightPanel}
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
};

export default EditorLayout;
