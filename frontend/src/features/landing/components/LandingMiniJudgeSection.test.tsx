import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LandingMiniJudgeSection from "./LandingMiniJudgeSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (typeof options?.defaultValue === "string") {
        return options.defaultValue
          .replace("{{passed}}", String(options.passed ?? ""))
          .replace("{{total}}", String(options.total ?? ""));
      }
      return key;
    },
  }),
}));

describe("LandingMiniJudgeSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders initial problem/editor/result state", () => {
    render(<LandingMiniJudgeSection />);

    expect(screen.getByText("費氏數列第 n 項")).toBeInTheDocument();
    expect(screen.getByLabelText("mini-judge-code-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模擬提交" })).toBeInTheDocument();
    expect(screen.getByTestId("mini-judge-status")).toHaveTextContent("尚未提交");
  });

  it("transitions from running to completed result state after submit", () => {
    render(<LandingMiniJudgeSection />);

    fireEvent.click(screen.getByRole("button", { name: "模擬提交" }));
    expect(screen.getByTestId("mini-judge-status")).toHaveTextContent("Preparing...");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("mini-judge-status")).toHaveTextContent("Running...");

    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(screen.getByTestId("mini-judge-status")).toHaveTextContent("Passed");
  });

  it("renders four result rows after demo execution completes", () => {
    render(<LandingMiniJudgeSection />);

    fireEvent.click(screen.getByRole("button", { name: "模擬提交" }));

    act(() => {
      vi.advanceTimersByTime(1301);
    });

    expect(screen.getAllByTestId("mini-judge-result-row")).toHaveLength(4);
  });

  it("does not execute user code or call backend APIs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<LandingMiniJudgeSection />);

    fireEvent.change(screen.getByLabelText("mini-judge-code-input"), {
      target: { value: "alert('xss')\nreturn 1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "模擬提交" }));
    act(() => {
      vi.advanceTimersByTime(1301);
    });

    expect(screen.getByTestId("mini-judge-status")).toHaveTextContent("Passed");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("does not render raw i18n keys", () => {
    const { container } = render(<LandingMiniJudgeSection />);
    expect(container.textContent).not.toContain("landing.miniJudge.");
  });
});
