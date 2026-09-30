import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExamPrecheckScreen from "./ExamPrecheckScreen";

// The screen re-runs effects when these change identity, so keep them stable.
const mocks = vi.hoisted(() => ({
  startSession: vi.fn(),
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

vi.mock("@/features/contest/hooks/useExamSessionFlow", () => ({
  useExamSessionFlow: () => ({
    contestId: "contest-1",
    contest: mocks.contest,
    loading: false,
    error: null,
    clearError: mocks.clearError,
    startSession: mocks.startSession,
  }),
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
