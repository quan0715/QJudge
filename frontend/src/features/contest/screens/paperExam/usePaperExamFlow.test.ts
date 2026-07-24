import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaperExamFlow } from "./usePaperExamFlow";

const mocks = vi.hoisted(() => ({
  endExam: vi.fn(),
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
  registerContest: vi.fn(),
  startExam: vi.fn(),
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

describe("usePaperExamFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emit.mockRejectedValue(new Error("IndexedDB unavailable"));
    mocks.endExam.mockResolvedValue({});
    mocks.refreshContest.mockResolvedValue(undefined);
  });

  it("submits when the optional integrity lifecycle record cannot be appended", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => usePaperExamFlow());

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
