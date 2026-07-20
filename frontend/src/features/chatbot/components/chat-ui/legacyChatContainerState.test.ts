import { describe, expect, it } from "vitest";
import type {
  ApprovalRequest,
  ChatRun,
  QuestionRequest,
} from "@/core/types/chatbot.types";

import {
  clearCapturedLegacyDraft,
  createLegacyChatContainerState,
  removeCapturedLegacyAttachments,
} from "./legacyChatContainerState";

function run(overrides: Partial<ChatRun> = {}): ChatRun {
  return {
    id: "run-current",
    sessionId: "session-current",
    status: "running",
    kind: "chat",
    modelId: "model-1",
    lastEventSeq: 7,
    ...overrides,
  };
}

const approval: ApprovalRequest = {
  actionRequests: [{ name: "deploy", args: { environment: "staging" } }],
};
const question: QuestionRequest = {
  question: "Continue?",
  inputType: "choice",
  options: ["yes", "no"],
};

describe("createLegacyChatContainerState", () => {
  it("maps the current session active run into the public run state", () => {
    const state = createLegacyChatContainerState({
      currentSessionId: "session-current",
      activeRuns: [
        run({ id: "run-other", sessionId: "session-other", status: "awaiting_approval" }),
        run({ status: "running", lastEventSeq: 12 }),
      ],
      pendingApproval: null,
      pendingQuestion: null,
      nextTurnOptions: null,
      isSessionLoading: false,
      isStreaming: true,
    });

    expect(state.run).toEqual({
      status: "streaming",
      run: expect.objectContaining({
        id: "run-current",
        sessionId: "session-current",
        lastSequence: 12,
      }),
    });
  });

  it("maps awaiting interactions and gates stale interaction UI while loading", () => {
    const ready = createLegacyChatContainerState({
      currentSessionId: "session-current",
      activeRuns: [run({ status: "awaiting_user_answer" })],
      pendingApproval: approval,
      pendingQuestion: question,
      nextTurnOptions: [{ label: "Next", message: "Continue" }],
      isSessionLoading: false,
      isStreaming: false,
    });

    expect(ready.run).toEqual(expect.objectContaining({
      status: "awaiting-answer",
      request: { question: "Continue?", input: "choice", options: ["yes", "no"] },
    }));
    expect(ready.question).toEqual({
      question: "Continue?",
      input: "choice",
      options: ["yes", "no"],
    });
    expect(ready.approval).toEqual(expect.objectContaining({
      actions: [{ name: "deploy", arguments: { environment: "staging" } }],
    }));

    const loading = createLegacyChatContainerState({
      currentSessionId: "session-current",
      activeRuns: [run({ status: "awaiting_user_answer" })],
      pendingApproval: approval,
      pendingQuestion: question,
      nextTurnOptions: [{ label: "Next", message: "Continue" }],
      isSessionLoading: true,
      isStreaming: false,
    });

    expect(loading.approval).toBeNull();
    expect(loading.question).toBeNull();
    expect(loading.suggestions).toEqual([]);
  });
});

describe("legacy composer snapshot cleanup", () => {
  it("preserves draft and attachments added after send capture", () => {
    expect(clearCapturedLegacyDraft("later draft", "captured draft")).toBe(
      "later draft",
    );
    expect(clearCapturedLegacyDraft("captured draft", "captured draft")).toBe(
      "",
    );
    expect(
      removeCapturedLegacyAttachments(
        [{ id: "captured" }, { id: "later" }],
        new Set(["captured"]),
      ),
    ).toEqual([{ id: "later" }]);
  });
});
