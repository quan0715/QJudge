import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";

import {
  batchKickoffDisplayText,
  selectFinishedArtifactToolIds,
  selectLatestNextTurnOptions,
  selectLatestSubagentItems,
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
  it("shows a batch request as the teacher's words, without its units line", () => {
    expect(batchKickoffDisplayText('batch_units: [{"id":"u"}]\n請批改第 1 題。')).toBe("請批改第 1 題。");
    expect(batchKickoffDisplayText("請幫我批改")).toBe("請幫我批改");
  });

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
            toolName: "artifact_csv_patch",
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

  it("ignores read-only artifact tools but includes every artifact mutation", () => {
    const readTools = ["artifact_read", "artifact_list", "artifact_csv_search", "artifact_csv_to_json", "artifact_read_pdf", "submit_grading_unit"];
    const writeTools = ["artifact_write", "artifact_write_csv", "artifact_csv_from_json", "artifact_csv_patch"];
    const messages = [assistantMessage("tools", [...readTools, ...writeTools].map((toolName) => ({
      type: "tool" as const,
      toolCallId: toolName,
      toolName,
      state: "output-ready" as const,
    })))];

    expect(selectFinishedArtifactToolIds(messages)).toEqual([...writeTools].reverse());
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

  it("lists the latest run's subagents by their first description line and live status", () => {
    const task = (id: string, description: string, state: "input-ready" | "output-ready" | "error") => ({
      type: "tool" as const, toolCallId: id, toolName: "task", state, input: { description },
    });
    const messages = [
      assistantMessage("older", [task("old", "批改第 9 題", "output-ready")]),
      assistantMessage("latest", [
        task("t1", "批改第 1 題\n細節", "output-ready"),
        task("t2", "批改第 2 題", "input-ready"),
        task("t3", "批改第 3 題", "error"),
        { type: "tool", toolCallId: "c1", toolName: "save_grading_draft", state: "output-ready", parentToolCallId: "t2" },
      ]),
    ];
    expect(selectLatestSubagentItems(messages)).toEqual([
      { id: "t1", label: "批改第 1 題", status: "success" },
      { id: "t2", label: "批改第 2 題", status: "in_progress" },
      { id: "t3", label: "批改第 3 題", status: "fail" },
    ]);
  });
});
