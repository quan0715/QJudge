import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useCopilotScroll } from "./useCopilotScroll";

function element() {
  const node = document.createElement("div");
  Object.defineProperties(node, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 200, configurable: true },
    scrollTop: { value: 750, writable: true, configurable: true },
  });
  node.scrollTo = vi.fn();
  return node;
}

describe("useCopilotScroll", () => {
  it("forces a smooth scroll for a new user message", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const ref = createRef<HTMLElement>();
    const node = element();
    Object.defineProperty(ref, "current", { value: node });
    const { rerender } = renderHook(
      ({ messages }) =>
        useCopilotScroll({ containerRef: ref, messages, activeSessionId: "one", loading: false }),
      { initialProps: { messages: [] as Array<{ id: string; role: "user" | "assistant" | "system" }> } },
    );

    rerender({ messages: [{ id: "user-1", role: "user" }] });

    expect(node.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });
    vi.unstubAllGlobals();
  });

  it("shows the latest button while reading history and removes its listener", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const ref = createRef<HTMLElement>();
    const node = element();
    node.scrollTop = 100;
    Object.defineProperty(ref, "current", { value: node });
    const remove = vi.spyOn(node, "removeEventListener");
    const { result, unmount } = renderHook(() =>
      useCopilotScroll({ containerRef: ref, messages: [], activeSessionId: "one", loading: false }),
    );

    act(() => node.dispatchEvent(new Event("scroll")));
    expect(result.current.showScrollButton).toBe(true);
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    vi.unstubAllGlobals();
  });
});
