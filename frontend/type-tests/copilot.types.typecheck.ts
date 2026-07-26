import type { CopilotActiveSessionState } from "@/core/copilot";

const sessionFixture = {
  id: "session-1",
  title: "Session",
  messages: [],
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};

const ready: CopilotActiveSessionState = {
  status: "ready",
  id: "session-1",
  data: sessionFixture,
  error: null,
};
void ready;

const initializing: CopilotActiveSessionState = {
  status: "initializing",
  id: null,
  data: null,
  error: null,
};
void initializing;

// @ts-expect-error initializing cannot carry a persisted session id
const invalidInitializing: CopilotActiveSessionState = {
  status: "initializing",
  id: "session-1",
  data: null,
  error: null,
};
void invalidInitializing;

// @ts-expect-error ready requires a concrete session
const invalidReady: CopilotActiveSessionState = {
  status: "ready",
  id: "session-1",
  data: null,
  error: null,
};
void invalidReady;

// @ts-expect-error empty cannot carry a session id
const invalidEmpty: CopilotActiveSessionState = {
  status: "empty",
  id: "session-1",
  data: null,
  error: null,
};
void invalidEmpty;
