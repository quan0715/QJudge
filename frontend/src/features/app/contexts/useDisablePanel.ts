import { useEffect, useId } from "react";
import { useWorkspace } from "./WorkspaceContext";

type Side = "left" | "right";

/**
 * 宣告式禁用 workspace panel：mount 時加入禁用棧，unmount 時自動移除。
 *
 * 多個 caller 可同時禁用同一面板（例如競賽頁與全螢幕模式同時 mount），
 * 全部 unmount 後面板才回到原本的 user preference 狀態。
 *
 * @example
 * // 在 /chat 主畫面（右側 chat 已是主內容）禁用右側面板
 * useDisablePanel("right");
 *
 * @example
 * // 競賽進行中同時收掉左右
 * useDisablePanel(["left", "right"]);
 */
export function useDisablePanel(side: Side | Side[]) {
  const { left, right } = useWorkspace();
  const id = useId();

  // Capture the exact functions we depend on so effect deps are correct.
  const leftDisable = left.disable;
  const leftEnable = left.enable;
  const rightDisable = right.disable;
  const rightEnable = right.enable;

  // Derive a stable sorted CSV key so the effect re-runs only when the
  // set of targeted sides actually changes (not per-render array identity).
  const sides: Side[] = Array.isArray(side) ? side : [side];
  const sideKey = [...new Set(sides)].sort().join(",");

  useEffect(() => {
    const targets = sideKey.split(",") as Side[];
    targets.forEach(s => {
      (s === "left" ? leftDisable : rightDisable)(id);
    });
    return () => {
      targets.forEach(s => {
        (s === "left" ? leftEnable : rightEnable)(id);
      });
    };
  }, [sideKey, id, leftDisable, leftEnable, rightDisable, rightEnable]);
}
