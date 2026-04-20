import { useEffect, useId } from "react";
import { useWorkspace } from "./WorkspaceContext";

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
export function useDisablePanel(side: "left" | "right" | Array<"left" | "right">) {
  const { left, right } = useWorkspace();
  const id = useId();
  const sides = Array.isArray(side) ? side : [side];
  const sideKey = sides.join(",");

  useEffect(() => {
    const targets = sideKey.split(",") as Array<"left" | "right">;
    targets.forEach(s => {
      const panel = s === "left" ? left : right;
      panel.disable(id);
    });
    return () => {
      targets.forEach(s => {
        const panel = s === "left" ? left : right;
        panel.enable(id);
      });
    };
    // We re-run when sides string changes; panel methods are stable per-render of provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideKey, id]);
}
