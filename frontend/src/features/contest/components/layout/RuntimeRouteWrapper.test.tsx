import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RuntimeRouteWrapper from "./RuntimeRouteWrapper";
import { clearExamPrecheckPassed, markExamPrecheckPassed } from "@/features/contest/anticheat/examPrecheckGate";

const mocks = vi.hoisted(() => ({
  contest: null as Record<string, unknown> | null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@/features/contest/contexts/ContestContext", () => ({
  useContest: () => ({
    contest: mocks.contest,
    loading: false,
    refreshContest: vi.fn(),
  }),
}));

vi.mock("@/features/app/contexts/useDisablePanel", () => ({
  useDisablePanel: () => {},
}));

vi.mock("@/features/contest/hooks/useContestExamActions", () => ({
  useContestExamActions: () => ({
    submissionProgress: {
      state: { open: false, steps: [] },
      close: vi.fn(),
    },
  }),
}));

const SOLVE_PATH = "/classrooms/classroom-1/contest/contest-1/solve";
const PRECHECK_PATH = "/classrooms/classroom-1/contest/contest-1/exam-precheck";

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route
          path="/classrooms/:classroomId/contest/:contestId/solve"
          element={
            <RuntimeRouteWrapper>
              <div data-testid="answering" />
            </RuntimeRouteWrapper>
          }
        />
        <Route
          path="/classrooms/:classroomId/contest/:contestId/exam-precheck"
          element={<div data-testid="precheck" />}
        />
      </Routes>
    </MemoryRouter>,
  );

const baseContest = (overrides: Record<string, unknown> = {}) => ({
  id: "contest-1",
  contestType: "coding",
  cheatDetectionEnabled: true,
  examStatus: "in_progress",
  boundClassroomId: "classroom-1",
  endTime: "2099-01-01T00:00:00Z",
  problems: [],
  ...overrides,
});

describe("RuntimeRouteWrapper precheck gate", () => {
  beforeEach(() => {
    clearExamPrecheckPassed("contest-1");
    mocks.contest = null;
  });

  it("sends a coding contest back to precheck when the gate was never passed", async () => {
    mocks.contest = baseContest();
    renderAt(SOLVE_PATH);

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe(PRECHECK_PATH),
    );
  });

  it("lets a coding contest through once the gate is passed", async () => {
    markExamPrecheckPassed("contest-1");
    mocks.contest = baseContest();
    renderAt(SOLVE_PATH);

    await waitFor(() => expect(screen.getByTestId("answering")).toBeTruthy());
    expect(screen.getByTestId("pathname").textContent).toBe(SOLVE_PATH);
  });

  it("sends a paused exam back to precheck even with a passed gate", async () => {
    markExamPrecheckPassed("contest-1");
    mocks.contest = baseContest({ examStatus: "paused" });
    renderAt(SOLVE_PATH);

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe(PRECHECK_PATH),
    );
  });

  it("stays out of the way when cheat detection is off", async () => {
    mocks.contest = baseContest({ cheatDetectionEnabled: false });
    renderAt(SOLVE_PATH);

    await waitFor(() => expect(screen.getByTestId("answering")).toBeTruthy());
    expect(screen.getByTestId("pathname").textContent).toBe(SOLVE_PATH);
  });

  it("applies the same gate to a paper exam", async () => {
    mocks.contest = baseContest({ contestType: "paper_exam" });
    renderAt(SOLVE_PATH);

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe(PRECHECK_PATH),
    );
  });
});
