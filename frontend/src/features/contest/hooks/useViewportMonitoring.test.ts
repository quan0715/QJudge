import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewportMonitoring } from "./useViewportMonitoring";

const triggerMock = vi.fn();
const recoverMock = vi.fn();

vi.mock("./useViolationPipeline", () => ({
  useViolationPipeline: () => ({
    trigger: triggerMock,
    recover: recoverMock,
    recoveryCountdown: null,
    isInterrupted: false,
  }),
}));

let resizeListeners: Array<() => void> = [];
const viewportState = {
  width: 1024,
  height: 768,
  scale: 1,
  offsetTop: 0,
};

const installVisualViewportMock = () => {
  resizeListeners = [];
  const visualViewport = {
    get width() {
      return viewportState.width;
    },
    get height() {
      return viewportState.height;
    },
    get scale() {
      return viewportState.scale;
    },
    get offsetTop() {
      return viewportState.offsetTop;
    },
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "resize") resizeListeners.push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      if (event !== "resize") return;
      resizeListeners = resizeListeners.filter((fn) => fn !== cb);
    }),
  };

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: visualViewport,
  });

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: viewportState.width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: viewportState.height,
  });

  Object.defineProperty(window, "screen", {
    configurable: true,
    writable: true,
    value: {
      width: 1024,
      height: 768,
    },
  });
};

describe("useViewportMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    viewportState.width = 1024;
    viewportState.height = 768;
    viewportState.scale = 1;
    viewportState.offsetTop = 0;
    installVisualViewportMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not trigger split-view violation for tablet keyboard resize", () => {
    // Simulate a text input being focused (keyboard is open because student is typing)
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useViewportMonitoring({
        contestId: "contest-1",
        enabled: true,
        examSubmitted: false,
        recoveryGraceMs: 3000,
        isTablet: true,
        primarySourceModule: "webcam",
        requestForceSubmit: vi.fn(),
        onViolation: vi.fn(),
      }),
    );

    act(() => {
      viewportState.height = 520; // keyboard opened — takes ~32% of screen
      viewportState.width = 1024; // width unchanged
      resizeListeners.forEach((listener) => listener());
      vi.advanceTimersByTime(1100);
    });

    expect(triggerMock).not.toHaveBeenCalled();

    input.blur();
    document.body.removeChild(input);
  });

  it("triggers split-view violation when tablet width is reduced", () => {
    renderHook(() =>
      useViewportMonitoring({
        contestId: "contest-1",
        enabled: true,
        examSubmitted: false,
        recoveryGraceMs: 3000,
        isTablet: true,
        primarySourceModule: "webcam",
        requestForceSubmit: vi.fn(),
        onViolation: vi.fn(),
      }),
    );

    act(() => {
      viewportState.width = 700; // split view style narrow viewport
      viewportState.height = 768;
      // getViewportSnapshot reads window.innerWidth/innerHeight
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 700 });
      Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 768 });
      resizeListeners.forEach((listener) => listener());
      vi.advanceTimersByTime(1100);
    });

    expect(triggerMock).toHaveBeenCalled();
  });
});
