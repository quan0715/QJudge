import type { ExamStatusType } from "@/core/entities/contest.entity";

export type AnticheatPhase =
  | "PRECHECK"
  | "ACTIVE"
  | "DEGRADED"
  | "TERMINATING"
  | "TERMINAL";

export type AnticheatSignalPriority =
  | "TERMINAL_GUARD"
  | "HARD_SECURITY"
  | "WARNING"
  | "INFO";

export interface AnticheatSignal {
  eventType: string;
  source: string;
  severity?: "info" | "warning" | "violation";
  reason?: string;
}

export interface AnticheatDecision {
  accepted: boolean;
  phase: AnticheatPhase;
  priority: AnticheatSignalPriority;
  decision: "accepted" | "terminal_guard" | "dedupe_hit" | "lower_priority";
  reasonCode: string;
  dedupeHit: boolean;
  eventIdempotencyKey: string;
  incidentFamily: string | null;
}

interface ArbitrationWindow {
  startedAt: number;
  topPriority: number;
}

interface ContestOrchestratorState {
  phase: AnticheatPhase;
  lastPhaseUpdatedAt: number;
  window: ArbitrationWindow | null;
  dedupe: Map<string, number>;
}

const ARBITRATION_WINDOW_MS = 1500;
const DEDUPE_WINDOW_MS = 2000;
const MAX_DEDUPE_ENTRIES = 256;

const contestStates = new Map<string, ContestOrchestratorState>();

const priorityRank: Record<AnticheatSignalPriority, number> = {
  INFO: 1,
  WARNING: 2,
  HARD_SECURITY: 3,
  TERMINAL_GUARD: 4,
};

// ---------------------------------------------------------------------------
// Incident families — mirrors backend INCIDENT_FAMILY in constants.py.
// Same family within the dedup window produces only one penalty.
// ---------------------------------------------------------------------------
const INCIDENT_FAMILY: Record<string, string> = {
  screen_share_stopped: "capture_loss",
  webcam_stopped: "capture_loss",
  exit_fullscreen: "display_escape",
  multiple_displays: "display_escape",
  split_view_detected: "display_escape",
  forbidden_focus_event: "display_escape",
  mouse_leave: "pointer_escape",
  viewport_stopped: "viewport_loss",
  // Critical events keep independent families for arbitration/dedup.
  heartbeat_timeout: "heartbeat_timeout",
  listener_tampered: "listener_tampered",
};

export const getIncidentFamily = (eventType: string): string | null =>
  INCIDENT_FAMILY[eventType] ?? null;

const HARD_SECURITY_EVENTS = new Set(["screen_share_stopped"]);
const WARNING_EVENTS = new Set([
  "exit_fullscreen",
  "multiple_displays",
  "mouse_leave",
  "forbidden_focus_event",
  "viewport_stopped",
]);

const TERMINAL_BLOCK_EVENTS = new Set([...HARD_SECURITY_EVENTS, ...WARNING_EVENTS]);

const nowMs = () => Date.now();

const getOrCreateState = (contestId: string): ContestOrchestratorState => {
  const existing = contestStates.get(contestId);
  if (existing) return existing;

  const next: ContestOrchestratorState = {
    phase: "PRECHECK",
    lastPhaseUpdatedAt: nowMs(),
    window: null,
    dedupe: new Map(),
  };
  contestStates.set(contestId, next);
  return next;
};

const hashKey = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const compactDedupeMap = (map: Map<string, number>, now: number) => {
  for (const [key, ts] of map.entries()) {
    if (now - ts > DEDUPE_WINDOW_MS) {
      map.delete(key);
    }
  }

  if (map.size <= MAX_DEDUPE_ENTRIES) return;

  const entries = [...map.entries()].sort((a, b) => a[1] - b[1]);
  const overflow = entries.length - MAX_DEDUPE_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    map.delete(entries[i][0]);
  }
};

export const classifyAnticheatPriority = (
  signal: AnticheatSignal,
  phase: AnticheatPhase
): AnticheatSignalPriority => {
  if (phase === "TERMINATING" || phase === "TERMINAL") {
    if (TERMINAL_BLOCK_EVENTS.has(signal.eventType)) {
      return "TERMINAL_GUARD";
    }
  }

  if (HARD_SECURITY_EVENTS.has(signal.eventType)) return "HARD_SECURITY";
  if (WARNING_EVENTS.has(signal.eventType)) return "WARNING";
  if (signal.severity === "violation") return "HARD_SECURITY";
  if (signal.severity === "warning") return "WARNING";
  return "INFO";
};

// Dedup key uses incident family so that e.g. exit_fullscreen + mouse_leave
// (both in "display_escape" / "pointer_escape" respectively) don't double-penalise,
// while truly different families can each fire.
const toDedupeKey = (signal: AnticheatSignal, phase: AnticheatPhase, time: number) => {
  const family = INCIDENT_FAMILY[signal.eventType] ?? signal.eventType;
  const bucket = Math.floor(time / DEDUPE_WINDOW_MS);
  return `${family}:${signal.source}:${phase}:${bucket}`;
};

export const setAnticheatPhase = (contestId: string, phase: AnticheatPhase) => {
  const state = getOrCreateState(contestId);
  state.phase = phase;
  state.lastPhaseUpdatedAt = nowMs();
  if (phase === "TERMINATING" || phase === "TERMINAL") {
    state.window = null;
  }
};

export const getAnticheatPhase = (contestId: string): AnticheatPhase => {
  return getOrCreateState(contestId).phase;
};

export const resetAnticheatOrchestrator = (contestId: string) => {
  contestStates.delete(contestId);
};

export const syncAnticheatPhaseWithExamStatus = (
  contestId: string,
  examStatus?: ExamStatusType | null
): AnticheatPhase => {
  const phase: AnticheatPhase = (() => {
    if (examStatus === "in_progress") return "ACTIVE";
    if (
      examStatus === "paused" ||
      examStatus === "locked"
    ) {
      return "DEGRADED";
    }
    if (examStatus === "submitted") return "TERMINAL";
    return "PRECHECK";
  })();

  setAnticheatPhase(contestId, phase);
  return phase;
};

export const beginAnticheatTermination = (contestId: string) => {
  setAnticheatPhase(contestId, "TERMINATING");
};

export const markAnticheatTerminal = (contestId: string) => {
  setAnticheatPhase(contestId, "TERMINAL");
};

export const decideAnticheatSignal = (
  contestId: string,
  signal: AnticheatSignal
): AnticheatDecision => {
  const state = getOrCreateState(contestId);
  const now = nowMs();
  const phase = state.phase;
  const priority = classifyAnticheatPriority(signal, phase);
  const incidentFamily = getIncidentFamily(signal.eventType);

  const dedupeKey = toDedupeKey(signal, phase, now);
  compactDedupeMap(state.dedupe, now);
  const existingTs = state.dedupe.get(dedupeKey);
  const eventIdempotencyKey = hashKey(`${contestId}:${dedupeKey}:${signal.reason || ""}`);

  if (existingTs && now - existingTs <= DEDUPE_WINDOW_MS) {
    return {
      accepted: false,
      phase,
      priority,
      decision: "dedupe_hit",
      reasonCode: "dedupe_window",
      dedupeHit: true,
      eventIdempotencyKey,
      incidentFamily,
    };
  }

  if (priority === "TERMINAL_GUARD") {
    return {
      accepted: false,
      phase,
      priority,
      decision: "terminal_guard",
      reasonCode: "terminal_phase_block",
      dedupeHit: false,
      eventIdempotencyKey,
      incidentFamily,
    };
  }

  if (!state.window || now - state.window.startedAt > ARBITRATION_WINDOW_MS) {
    state.window = {
      startedAt: now,
      topPriority: priorityRank[priority],
    };
  } else if (priorityRank[priority] < state.window.topPriority) {
    return {
      accepted: false,
      phase,
      priority,
      decision: "lower_priority",
      reasonCode: "arbitration_window",
      dedupeHit: false,
      eventIdempotencyKey,
      incidentFamily,
    };
  } else {
    state.window.topPriority = priorityRank[priority];
  }

  state.dedupe.set(dedupeKey, now);

  return {
    accepted: true,
    phase,
    priority,
    decision: "accepted",
    reasonCode: "accepted",
    dedupeHit: false,
    eventIdempotencyKey,
    incidentFamily,
  };
};

export const buildAnticheatMetadata = (
  decision: AnticheatDecision,
  extras?: Record<string, unknown>
): Record<string, unknown> => {
  return {
    phase: decision.phase,
    source: extras?.source,
    priority: decision.priority,
    decision: decision.decision,
    reason_code: decision.reasonCode,
    dedupe_hit: decision.dedupeHit,
    event_idempotency_key: decision.eventIdempotencyKey,
    incident_family: decision.incidentFamily,
    ...extras,
  };
};
