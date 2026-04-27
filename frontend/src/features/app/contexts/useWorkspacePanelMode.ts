import { useEffect, useId } from "react";
import { type LeftPanelVisualMode, useWorkspace } from "@/features/app/contexts/WorkspaceContext";

/**
 * 宣告式註冊左側 panel 的顯示模式（full/mini）。
 *
 * @example
 * // 競賽管理頁保留 mini panel
 * useWorkspacePanelMode("mini");
 */
export function useWorkspacePanelMode(mode: LeftPanelVisualMode) {
  const { setLeftVisualMode, clearLeftVisualMode } = useWorkspace();
  const id = useId();

  useEffect(() => {
    if (mode === "full") return;
    setLeftVisualMode(id, mode);
    return () => {
      clearLeftVisualMode(id);
    };
  }, [mode, id, setLeftVisualMode, clearLeftVisualMode]);
}
