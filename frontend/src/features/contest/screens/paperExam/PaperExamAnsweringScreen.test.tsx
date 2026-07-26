import { act, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PaperExamAnsweringScreen from "./PaperExamAnsweringScreen";

const mocks = vi.hoisted(() => ({
  refreshContest: vi.fn().mockResolvedValue(undefined),
  setPageHeaderActions: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("./usePaperExamFlow", () => ({
  usePaperExamFlow: () => ({
    contestId: "contest-1",
    contest: {
      id: "contest-1",
      name: "Exam",
      contestType: "paper_exam",
      examStatus: "in_progress",
      cheatDetectionEnabled: false,
      boundClassroomId: "classroom-1",
      endTime: "2026-07-26T12:00:00Z",
    },
    submitExam: vi.fn().mockResolvedValue(true),
    refreshContest: mocks.refreshContest,
    loading: false,
  }),
}));

vi.mock("./hooks", () => ({
  getMarkedQuestionIds: () => new Set<string>(),
  saveMarkedQuestionIds: vi.fn(),
  hasExamPrecheckPassed: () => true,
  syncExamPrecheckGateByStatus: vi.fn(),
  usePaperExamAutoSave: () => ({
    saveStatus: "idle",
    handleAnswerChange: vi.fn(),
  }),
  usePaperExamQuestions: () => ({
    items: [],
    sections: [],
    answers: {},
    setAnswers: vi.fn(),
    answeredIds: new Set<string>(),
    loadingQuestions: false,
  }),
  usePaperExamSaveOnLeave: () => ({
    markDirty: vi.fn(),
    saveIfDirty: vi.fn().mockResolvedValue(undefined),
    flushAll: vi.fn().mockResolvedValue(undefined),
    saveStatus: "idle",
  }),
}));

vi.mock("@/features/contest/contexts/ExamCaptureContext", () => ({
  useExamCapture: () => ({
    uploadSessionId: "",
    flushPendingUploads: vi.fn().mockResolvedValue(undefined),
    forceStopCapture: vi.fn(),
  }),
}));

vi.mock("@/features/contest/hooks/useExamSubmissionProgress", () => ({
  default: () => ({
    state: { open: false, running: false, steps: [], errorMessage: null },
    run: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  }),
}));

vi.mock("@/features/app/contexts/PageHeaderActionsContext", () => ({
  usePageHeaderActions: () => mocks.setPageHeaderActions,
}));

vi.mock("@/features/contest/hooks", () => ({
  useContestRuntimeMode: () => ({ isRuntime: false }),
}));

vi.mock("@/features/contest/anticheat/integrity/IntegrityRuntimeContext", () => ({
  useIntegritySignalEmitter: () => ({ emit: vi.fn().mockResolvedValue(undefined) }),
}));

describe("PaperExamAnsweringScreen contest refresh ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.refreshContest.mockClear();
    mocks.setPageHeaderActions.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start a second contest poll while the workspace layout owns polling", () => {
    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/solve"]}>
        <Routes>
          <Route
            path="/classrooms/:classroomId/contest/:contestId/solve"
            element={<PaperExamAnsweringScreen />}
          />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mocks.refreshContest).not.toHaveBeenCalled();
  });
});
