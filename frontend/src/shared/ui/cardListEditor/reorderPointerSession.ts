import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Begins a reorder drag from a handle: notifies optional listener (+1), then starts Motion drag.
 * Ends the session on window pointerup / pointercancel (-1).
 */
export function attachReorderPointerSession(
  onSessionChange: ((delta: 1 | -1) => void) | undefined,
  startDrag: (e: ReactPointerEvent<Element>) => void,
  e: ReactPointerEvent<Element>,
): void {
  onSessionChange?.(1);
  const end = () => {
    onSessionChange?.(-1);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  startDrag(e);
}
