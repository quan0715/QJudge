import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PaperExamAnsweringScreen from "./PaperExamAnsweringScreen";

const mocks = vi.hoisted(() => ({
  refreshContest: vi.fn().mockResolvedValue(undefined),
  setPageHeaderActions: vi.fn(),
  submitExam: vi.fn().mockResolvedValue(true),
  flushAll: vi.fn().mockResolvedValue(undefined),
  flushPendingUploads: vi.fn().mockResolvedValue(undefined),
  deferMonitoringUploads: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: unknown) => typeof fallback === "string" ? fallback : _key,
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
    submitExam: mocks.submitExam,
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
    items: [{ kind: "question", data: { id: "q1", order: 0, questionType: "true_false",
      contestId: "contest-1", prompt: "Is 1 equal to 1?", options: [], score: 1,
      explanation: "", createdAt: "2026-07-26T00:00:00Z", updatedAt: "2026-07-26T00:00:00Z" } }],
    sections: [],
    answers: {},
    setAnswers: vi.fn(),
    answeredIds: new Set<string>(),
    loadingQuestions: false,
  }),
  usePaperExamSaveOnLeave: () => ({
    markDirty: vi.fn(),
    saveIfDirty: vi.fn().mockResolvedValue(undefined),
    flushAll: mocks.flushAll,
    saveStatus: "idle",
  }),
}));

vi.mock("@/features/contest/contexts/ExamCaptureContext", () => ({
  useExamCapture: () => ({
    uploadSessionId: "",
    flushPendingUploads: mocks.flushPendingUploads,
    deferMonitoringUploads: mocks.deferMonitoringUploads,
    forceStopCapture: vi.fn(),
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
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    vi.useFakeTimers();
    mocks.refreshContest.mockClear();
    mocks.setPageHeaderActions.mockClear();
    mocks.submitExam.mockClear();
    mocks.flushAll.mockClear();
    mocks.flushPendingUploads.mockReset().mockResolvedValue(undefined);
    mocks.deferMonitoringUploads = false;
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

  it.each([true, false])("preserves submission upload policy (resident=%s)", async (resident) => {
    mocks.deferMonitoringUploads = resident;
    let resolveMonitoring!: () => void;
    const monitoringRequest = new Promise<void>((resolve) => { resolveMonitoring = resolve; });
    mocks.flushPendingUploads.mockReturnValue(monitoringRequest);
    render(<MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/solve"]}>
      <Routes><Route path="/classrooms/:classroomId/contest/:contestId/solve" element={<PaperExamAnsweringScreen />} />
        <Route path="/classrooms/:classroomId/contest/:contestId" element={<p>Submitted</p>} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByTestId("paper-exam-open-submit-review-btn"));
    fireEvent.click(screen.getByTestId("paper-exam-submit-confirm-btn"));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(mocks.flushAll).toHaveBeenCalledTimes(2);
    if (!resident) {
      expect(mocks.submitExam).not.toHaveBeenCalled();
      expect(mocks.flushPendingUploads).toHaveBeenCalledOnce();
      await act(async () => { resolveMonitoring(); await vi.advanceTimersByTimeAsync(4000); });
    }
    expect(mocks.submitExam).toHaveBeenCalledOnce();
    if (resident) expect(mocks.flushPendingUploads).not.toHaveBeenCalled();
    expect(mocks.flushAll.mock.invocationCallOrder[0]).toBeLessThan(mocks.submitExam.mock.invocationCallOrder[0]);
  });
});
