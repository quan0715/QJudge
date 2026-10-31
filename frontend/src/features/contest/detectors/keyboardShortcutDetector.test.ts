import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { KeyboardShortcutDetector } from "./keyboardShortcutDetector";

describe("KeyboardShortcutDetector", () => {
  it.each(["P", "I", "J", "U", "R"])("blocks uppercase modifier shortcut %s", (key) => {
    const detector = new KeyboardShortcutDetector(((key: string) => key) as TFunction);
    const report = vi.fn();
    detector.start(report);
    try {
      const event = new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ eventType: "forbidden_action" }));
    } finally { detector.stop(); }
  });
});
