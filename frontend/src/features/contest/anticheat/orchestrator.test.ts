import { afterEach, describe, expect, it } from "vitest";
import {
  beginAnticheatTermination,
  getAnticheatPhase,
  markAnticheatTerminal,
  resetAnticheatOrchestrator,
  syncAnticheatPhaseWithExamStatus,
} from "./orchestrator";

const CONTEST_ID = "contest-10";

describe("anticheat phase store", () => {
  afterEach(() => resetAnticheatOrchestrator(CONTEST_ID));

  it("keeps all monitored exam states active", () => {
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "in_progress")).toBe("ACTIVE");
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "paused")).toBe("ACTIVE");
    expect(syncAnticheatPhaseWithExamStatus(CONTEST_ID, "locked")).toBe("ACTIVE");
  });

  it("moves through termination into terminal", () => {
    beginAnticheatTermination(CONTEST_ID);
    expect(getAnticheatPhase(CONTEST_ID)).toBe("TERMINATING");
    markAnticheatTerminal(CONTEST_ID);
    expect(getAnticheatPhase(CONTEST_ID)).toBe("TERMINAL");
  });
});
