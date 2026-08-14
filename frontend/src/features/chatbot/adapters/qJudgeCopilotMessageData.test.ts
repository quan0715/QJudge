import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";

import {
  selectFinishedArtifactToolIds,
  selectLatestNextTurnOptions,
  selectLatestTodoItems,
} from "./qJudgeCopilotMessageData";

function assistantMessage(
  id: string,
  parts: CopilotMessage["parts"],
): CopilotMessage {
  return {
    id,
    role: "assistant",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    parts,
  };
}

describe("QJudge Copilot message data", () => {
  it("selects the latest valid todo data while ignoring malformed newer data", () => {
    const messages: CopilotMessage[] = [
      assistantMessage("older", [
        {
          type: "data-todo-items",
          data: [
            { id: "todo-1", label: "Grade", status: "in_progress" },
            { id: "todo-2", label: "Invalid", status: "cancelled" },
          ],
        },
      ]),
      assistantMessage("newer-malformed", [
        { type: "data-todo-items", data: "invalid" },
        { type: "data-todos", data: [{ id: "wrong", label: "Wrong", status: "success" }] },
      ]),
    ];

    expect(selectLatestTodoItems(messages)).toEqual([
      { id: "todo-1", label: "Grade", status: "in_progress" },
    ]);
  });

  it("requires both next-turn strings and falls back past malformed newer data", () => {
    const messages: CopilotMessage[] = [
      assistantMessage("older", [
        {
          type: "data-next-turn-options",
          data: [
            { label: "Continue", message: "continue" },
            { label: "Missing message" },
          ],
        },
      ]),
      assistantMessage("newer-malformed", [
        { type: "data-next-turn-options", data: [{ label: "No message" }] },
      ]),
    ];

    expect(selectLatestNextTurnOptions(messages)).toEqual([
      { label: "Continue", message: "continue" },
    ]);
  });

  it("collects terminal artifact tool ids from assistant messages newest first", () => {
    const messages: CopilotMessage[] = [
      assistantMessage("older", [
        {
          type: "tool",
          toolCallId: "tool-old",
          toolName: "artifact_write",
          state: "output-ready",
          output: {},
        },
        {
          type: "tool",
          toolCallId: "tool-unfinished",
          toolName: "artifact_read",
          state: "input-ready",
        },
      ]),
      {
        ...assistantMessage("newer", [
          {
            type: "tool",
            toolCallId: "tool-error",
            toolName: "artifact_read",
            state: "error",
            error: { code: "failed", message: "failed", recoverable: false },
          },
          {
            type: "tool",
            toolCallId: "tool-other",
            toolName: "search",
            state: "output-ready",
          },
        ]),
      },
      {
        ...assistantMessage("user", [
          {
            type: "tool",
            toolCallId: "tool-user",
            toolName: "artifact_write",
            state: "output-ready",
          },
        ]),
        role: "user",
      },
    ];

    expect(selectFinishedArtifactToolIds(messages)).toEqual([
      "tool-error",
      "tool-old",
    ]);
  });

  it("returns empty results when no runtime-valid data exists", () => {
    const messages: CopilotMessage[] = [
      assistantMessage("malformed", [
        { type: "data-todo-items", data: [{ id: 1, label: "No", status: "pending" }] },
        { type: "data-next-turn-options", data: null },
        {
          type: "tool",
          toolCallId: 1,
          toolName: null,
          state: "output-ready",
        } as unknown as CopilotMessage["parts"][number],
        {
          type: "tool",
          toolCallId: "tool-streaming",
          toolName: "artifact_write",
          state: "input-streaming",
        },
      ]),
    ];

    expect(selectLatestTodoItems(messages)).toEqual([]);
    expect(selectLatestNextTurnOptions(messages)).toEqual([]);
    expect(selectFinishedArtifactToolIds(messages)).toEqual([]);
  });
});
