import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExamPrecheckScreen from "./ExamPrecheckScreen";

// The screen re-runs effects when these change identity, so keep them stable.
const mocks = vi.hoisted(() => ({
  startSession: vi.fn(async () => true),
  navigate: vi.fn(),
  clearError: vi.fn(),
  refresh: vi.fn(),
  contest: {
    id: "contest-1",
    contestType: "paper_exam",
    cheatDetectionEnabled: true,
    examStatus: "not_started",
    allowMultipleJoins: false,
    boundClassroomId: "room-1",
  },
  config: { webcamRequired: false },
  params: { classroomId: "room-1" },
}));

// The global mock hands out a new `t` per render, which loops this screen's effects.
vi.mock("react-i18next", () => {
  const t = (key: string, defaultOrOptions?: unknown) =>
    typeof defaultOrOptions === "string" ? defaultOrOptions : key;
  const value = { t, i18n: { language: "zh-TW" } };
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: () => value,
  };
});

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
}));

// Like the real hook: a new `startSession` on every render, and starting re-renders.
vi.mock("@/features/contest/hooks/useExamSessionFlow", async () => {
  const { useState } = await import("react");
  return {
    useExamSessionFlow: () => {
      const [, setLoading] = useState(false);
      return {
        contestId: "contest-1",
        contest: mocks.contest,
        loading: false,
        error: null,
        clearError: mocks.clearError,
        startSession: async (payload: unknown) => {
          setLoading(true);
          const started = await mocks.startSession(payload);
          setLoading(false);
          return started;
        },
      };
    },
  };
});

vi.mock("@/infrastructure/browser/fullscreen", () => ({
  isFullscreen: () => true,
  requestFullscreen: async () => true,
}));

vi.mock("./precheckEnvironment", async (importActual) => ({
  ...(await importActual<typeof import("./precheckEnvironment")>()),
  runStartPreflightValidation: async () => ({ failure: null, observation: { fullscreen: true } }),
  runEnvChecks: async ({
    setEnvChecks,
    setEnvTestDone,
    setEnvTestRunning,
  }: {
    setEnvChecks: (fn: (items: { status: string }[]) => unknown) => void;
    setEnvTestDone: (done: boolean) => void;
    setEnvTestRunning: (running: boolean) => void;
  }) => {
    setEnvChecks((items) => items.map((item) => ({ ...item, status: "pass" })));
    setEnvTestDone(true);
    setEnvTestRunning(false);
  },
}));

vi.mock("@/features/contest/hooks/useContestAnticheatConfig", () => ({
  useContestAnticheatConfig: () => ({
    config: mocks.config,
    refresh: mocks.refresh,
  }),
}));

const openEnvironmentStep = () => {
  fireEvent.click(screen.getByTestId("precheck-step1-next-btn"));
};

describe("ExamPrecheckScreen on a browser that cannot share its screen", () => {
  beforeEach(() => {
    mocks.startSession.mockReset();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("tells the student to use a computer and offers no way to start", () => {
    render(<ExamPrecheckScreen />);

    openEnvironmentStep();

    expect(
      screen.getByText("嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）。請改用電腦重新進入。"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("precheck-step2-primary-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("precheck-confirm-start-btn")).not.toBeInTheDocument();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("lets a browser that can share its screen run the environment check", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(), getDisplayMedia: vi.fn() },
    });
    render(<ExamPrecheckScreen />);

    openEnvironmentStep();

    expect(screen.getByTestId("precheck-step2-primary-btn")).toBeInTheDocument();
    expect(
      screen.queryByText("嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）。請改用電腦重新進入。"),
    ).not.toBeInTheDocument();
  });
});

describe("ExamPrecheckScreen starting the exam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.startSession.mockClear();
    mocks.navigate.mockClear();
    // The real request takes a while, and the screen re-renders meanwhile.
    mocks.startSession.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 500)),
    );
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(), getDisplayMedia: vi.fn() },
    });
  });

  afterEach(() => {
    mocks.startSession.mockImplementation(async () => true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("records one start for one confirmation, however often the screen re-renders", async () => {
    render(<ExamPrecheckScreen />);

    fireEvent.click(screen.getByTestId("precheck-step1-next-btn"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("precheck-step2-primary-btn"));
    });
    fireEvent.click(screen.getByTestId("precheck-step2-next-btn"));
    fireEvent.click(screen.getByTestId("precheck-confirm-start-btn"));

    // Three seconds of countdown, then the (slow) start request, then a margin.
    for (let second = 0; second < 6; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(mocks.startSession).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});

describe("ExamPrecheckScreen keeps the checklist short", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(), getDisplayMedia: vi.fn() },
    });
  });

  afterEach(() => {
    mocks.config.webcamRequired = false;
    vi.unstubAllGlobals();
  });

  const rows = (container: HTMLElement) => container.querySelectorAll("[class*=\"checkLabelRow\"]").length;

  it("lists one eligibility row and four environment rows", () => {
    const { container } = render(<ExamPrecheckScreen />);
    expect(rows(container)).toBe(1);

    fireEvent.click(screen.getByTestId("precheck-step1-next-btn"));

    expect(rows(container)).toBe(4);
  });

  it("adds a fifth row when the contest requires a webcam", () => {
    mocks.config.webcamRequired = true;
    const { container } = render(<ExamPrecheckScreen />);

    fireEvent.click(screen.getByTestId("precheck-step1-next-btn"));

    expect(rows(container)).toBe(5);
  });

  it("keeps the exam instructions to three points", async () => {
    render(<ExamPrecheckScreen />);

    fireEvent.click(screen.getByTestId("precheck-step1-next-btn"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("precheck-step2-primary-btn"));
    });
    fireEvent.click(screen.getByTestId("precheck-step2-next-btn"));

    const points = screen.getByText("precheck.instruction.title").parentElement!.querySelectorAll("li");
    expect(points).toHaveLength(3);
  });
});
