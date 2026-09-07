import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PaperExamAnsweringScreen from "./PaperExamAnsweringScreen";
import { IntegrityUploadProvider, useIntegrityUploadOwner } from "../../contexts/IntegrityUploadProvider";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";
import type { ExamRuntimeState } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({
  refreshContest: vi.fn().mockResolvedValue(undefined),
  setPageHeaderActions: vi.fn(),
  submitExam: vi.fn().mockResolvedValue(true),
  flushAll: vi.fn().mockResolvedValue(undefined),
  flushPendingUploads: vi.fn().mockResolvedValue(undefined),
  deferMonitoringUploads: false,
  cheatDetectionEnabled: false,
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
      cheatDetectionEnabled: mocks.cheatDetectionEnabled,
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
    mocks.cheatDetectionEnabled = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("delivers the screen entry after runtime admission arrives later than the answering screen", async () => {
    vi.useRealTimers();
    mocks.cheatDetectionEnabled = true;
    vi.mocked(localStorage.getItem).mockReturnValue("device-delayed");
    vi.spyOn(OpfsEvidenceStore, "open").mockRejectedValue(new Error("media unavailable"));
    const requests: Array<{ upload_scope?: { attempt_id: string }; observations?: { records: Array<{ event_type: string }> } }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ acked_through_seq: 100, processed_through_seq: 100,
        pending_commands: [], release_evidence_before_ms: 0, upload_status: "pending" }), { status: 200 });
    }));
    const runId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const run = { id: runId, participantId: 44, sessionState: "active", health: "healthy",
      registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {}, devicePolicy: {} as never };
    let state: ExamRuntimeState | null = null;
    const CaptureRegistration = () => {
      const upload = useIntegrityUploadOwner();
      useLayoutEffect(() => {
        upload?.configure({ enabled: true, contestId: "contest-1", integrityRun: run,
          snapshotProvider: () => ({ pageVisible: true, online: true, fullscreen: false,
            screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
      }, [upload?.configure]);
      return null;
    };
    const tree = () => <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/solve"]}>
      <IntegrityUploadProvider contestId="contest-1" runtimeState={state}>
        <CaptureRegistration />
        <Routes><Route path="/classrooms/:classroomId/contest/:contestId/solve" element={<PaperExamAnsweringScreen />} /></Routes>
      </IntegrityUploadProvider>
    </MemoryRouter>;
    const { rerender, unmount } = render(tree());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("paper-exam-open-submit-review-btn")).toBeTruthy();
    expect(requests).toEqual([]);
    state = { server_now: new Date().toISOString(), serverOffsetMs: 0,
      start_time: null, end_time: new Date(Date.now() + 60000).toISOString(), schedule_revision: 1,
      participant_id: 44, exam_status: "in_progress", integrity_run: { id: runId,
        session_state: "active", schedule_revision: 1, health: "healthy", accept_until: null },
      session_identity: { active_device_matches: true, device_id: "device-delayed", attempt_id: attemptId, next_sequence: 1 }, integrity_upload: null };
    rerender(tree());
    await waitFor(() => expect(requests.some((request) => request.upload_scope?.attempt_id === attemptId &&
      request.observations?.records.some((record) => record.event_type === "exam_entered"))).toBe(true), { timeout: 6000 });
    unmount();
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
