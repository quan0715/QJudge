import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  beginAnticheatTermination,
  decideAnticheatSignal,
  getAnticheatPhase,
  markAnticheatTerminal,
  resetAnticheatOrchestrator,
  setAnticheatPhase,
  syncAnticheatPhaseWithExamStatus,
} from "./orchestrator";

const CONTEST_ID = "10";

describe("anticheat orchestrator", () => {
  beforeEach(() => {
    resetAnticheatOrchestrator(CONTEST_ID);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAnticheatOrchestrator(CONTEST_ID);
  });

  it("maps exam status to phases", () => {
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "in_progress")).toBe("ACTIVE");
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "paused")).toBe("DEGRADED");
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "submitted")).toBe("TERMINAL");
  });

  it("blocks escalating events in terminal phases", () => {
    beginAnticheatTermination(CONTEST_ID);
    const d = decideAnticheatSignal(CONTEST_ID, {
      eventType: "screen_share_stopped",
      source: "stream",
      severity: "violation",
    });

    expect(d.accepted).toBe(false);
    expect(d.decision).toBe("terminal_guard");
  });

  it("deduplicates same signal in short window", () => {
    setAnticheatPhase(CONTEST_ID, "ACTIVE");

    const d1 = decideAnticheatSignal(CONTEST_ID, {
      eventType: "window_blur",
      source: "detector:focus",
      severity: "violation",
    });
    const d2 = decideAnticheatSignal(CONTEST_ID, {
      eventType: "window_blur",
      source: "detector:focus",
      severity: "violation",
    });

    expect(d1.accepted).toBe(true);
    expect(d2.accepted).toBe(false);
    expect(d2.decision).toBe("dedupe_hit");
  });

  it("suppresses lower-priority events in arbitration window", () => {
    setAnticheatPhase(CONTEST_ID, "ACTIVE");

    const first = decideAnticheatSignal(CONTEST_ID, {
      eventType: "screen_share_stopped",
      source: "stream",
      severity: "violation",
    });
    const second = decideAnticheatSignal(CONTEST_ID, {
      eventType: "forbidden_action",
      source: "detector:shortcut",
      severity: "info",
    });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.decision).toBe("lower_priority");
  });

  it("allows signal after arbitration window elapsed", () => {
    setAnticheatPhase(CONTEST_ID, "ACTIVE");

    const first = decideAnticheatSignal(CONTEST_ID, {
      eventType: "screen_share_stopped",
      source: "stream",
      severity: "violation",
    });

    vi.advanceTimersByTime(2000);

    const second = decideAnticheatSignal(CONTEST_ID, {
      eventType: "forbidden_action",
      source: "detector:shortcut",
      severity: "info",
    });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
  });

  it("sets terminal phase helper", () => {
    markAnticheatTerminal(CONTEST_ID);
    expect(getAnticheatPhase(CONTEST_ID)).toBe("TERMINAL");
  });
});
