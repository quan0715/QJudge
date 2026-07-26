import type { ExamStatusType } from "@/core/entities/contest.entity";

export type AnticheatPhase =
  | "PRECHECK"
  | "ACTIVE"
  | "TERMINATING"
  | "TERMINAL";

const contestPhases = new Map<string, AnticheatPhase>();

export const setAnticheatPhase = (contestId: string, phase: AnticheatPhase) => {
  contestPhases.set(contestId, phase);
};

export const getAnticheatPhase = (contestId: string): AnticheatPhase =>
  contestPhases.get(contestId) ?? "PRECHECK";

export const resetAnticheatOrchestrator = (contestId: string) => {
  contestPhases.delete(contestId);
};

export const syncAnticheatPhaseWithExamStatus = (
  contestId: string,
  examStatus?: ExamStatusType | null,
): AnticheatPhase => {
  const phase: AnticheatPhase =
    examStatus === "in_progress" ||
    examStatus === "paused" ||
    examStatus === "locked"
      ? "ACTIVE"
      : examStatus === "submitted"
        ? "TERMINAL"
        : "PRECHECK";
  setAnticheatPhase(contestId, phase);
  return phase;
};

export const beginAnticheatTermination = (contestId: string) => {
  setAnticheatPhase(contestId, "TERMINATING");
};

export const markAnticheatTerminal = (contestId: string) => {
  setAnticheatPhase(contestId, "TERMINAL");
};
