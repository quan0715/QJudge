import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";

import { useSessionBadgeSummary } from "./SessionBadges";

describe("useSessionBadgeSummary", () => {
  it("derives todos from validated Copilot data parts", () => {
    const messages: CopilotMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        parts: [
          {
            type: "data-todo-items",
            data: [{ id: "todo-1", label: "Grade", status: "pending" }],
          },
        ],
      },
    ];

    const { result } = renderHook(() => useSessionBadgeSummary(messages));

    expect(result.current).toEqual({
      hasTodos: true,
      hasArtifacts: false,
      hasAny: true,
    });
  });

  it("retains transitional structural todo messages until ComposerBar migrates", () => {
    const messages = [
      {
        todoItems: [{ id: "todo-1", label: "Grade", status: "in_progress" as const }],
      },
    ] as unknown as Parameters<typeof useSessionBadgeSummary>[0];

    const { result } = renderHook(() => useSessionBadgeSummary(messages));

    expect(result.current.hasTodos).toBe(true);
  });
});
