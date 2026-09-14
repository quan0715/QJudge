import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExamSessionFlow } from "./useExamSessionFlow";

const mocks = vi.hoisted(() => ({
  endExam: vi.fn(),
  startExam: vi.fn(),
  emit: vi.fn(),
  refreshContest: vi.fn(),
  beginAnticheatTermination: vi.fn(),
  markAnticheatTerminal: vi.fn(),
  syncAnticheatPhaseWithExamStatus: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ contestId: "contest-1" }),
}));

vi.mock("@/features/contest/contexts/ContestContext", () => ({
  useContest: () => ({
    contest: {
      id: "contest-1",
      cheatDetectionEnabled: true,
      anticheatDevicePolicy: undefined,
      examStatus: "in_progress",
    },
    refreshContest: mocks.refreshContest,
    loading: false,
  }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  endExam: mocks.endExam,
  startExam: mocks.startExam,
  isSubmittedExamSessionResponse: () => true,
}));

vi.mock("@/features/contest/anticheat/orchestrator", () => ({
  beginAnticheatTermination: mocks.beginAnticheatTermination,
  markAnticheatTerminal: mocks.markAnticheatTerminal,
  resetAnticheatOrchestrator: vi.fn(),
  syncAnticheatPhaseWithExamStatus: mocks.syncAnticheatPhaseWithExamStatus,
}));

vi.mock("@/features/contest/anticheat/integrity/IntegrityRuntimeContext", () => ({
  useIntegritySignalEmitter: () => ({ emit: mocks.emit }),
}));

vi.mock("@/features/contest/domain/anticheatModulePolicy", () => ({
  detectAnticheatCapability: vi.fn(),
  resolveDeviceMonitoringPlan: () => ({
    primarySourceModule: "screen_share",
    sources: {
      screenShare: { role: "primary" },
      webcam: { role: "secondary" },
    },
  }),
}));

describe("useExamSessionFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emit.mockRejectedValue(new Error("IndexedDB unavailable"));
    mocks.endExam.mockResolvedValue({});
    mocks.refreshContest.mockResolvedValue(undefined);
  });

  it("submits when the optional integrity lifecycle record cannot be appended", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useExamSessionFlow());

    await act(async () => {
      expect(await result.current.submitExam()).toBe(true);
    });

    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "exam_submit_initiated" }),
    );
    expect(mocks.endExam).toHaveBeenCalledWith(
      "contest-1",
      expect.objectContaining({ source_module: "screen_share" }),
    );
    expect(warn).toHaveBeenCalled();
  });
});


describe("startSession pre-check payload", () => {
  beforeEach(() => {
    mocks.startExam.mockReset();
    mocks.startExam.mockResolvedValue({ status: "started" });
    mocks.refreshContest.mockResolvedValue(undefined);
  });

  it("forwards the pre-check observation to the exam start endpoint", async () => {
    const { result } = renderHook(() => useExamSessionFlow());
    const precheck = {
      precheck: { fullscreen: true, screen_count: 1, display_surface: "monitor" },
      precheck_client_occurred_at_ms: 1_785_000_000_000,
    };

    await act(async () => {
      await result.current.startSession(precheck);
    });

    expect(mocks.startExam).toHaveBeenCalledWith("contest-1", precheck);
  });

  it("still starts the exam when no pre-check payload is supplied", async () => {
    const { result } = renderHook(() => useExamSessionFlow());

    await act(async () => {
      await result.current.startSession();
    });

    expect(mocks.startExam).toHaveBeenCalledWith("contest-1", undefined);
  });
});
