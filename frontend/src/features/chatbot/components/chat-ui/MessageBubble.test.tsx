import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";

import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders text, reasoning and tool parts", () => {
    const message: CopilotMessage = {
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [
        { type: "reasoning", text: "Checking", state: "complete" },
        {
          type: "tool",
          toolCallId: "tool-1",
          toolName: "lookup",
          state: "output-ready",
          input: { id: 1 },
          output: "done",
        },
        { type: "text", text: "Answer" },
      ],
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText(/lookup/)).toBeInTheDocument();
    expect(screen.queryByText("ui.processing")).not.toBeInTheDocument();
  });

  it("derives assistant output only from public message parts", () => {
    const message = {
      id: "assistant-legacy-shadow",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [{ type: "text", text: "Public answer" }],
      content: "unsafe legacy answer",
      runStatus: "failed",
      runError: "unsafe legacy error",
    } as CopilotMessage & Record<string, unknown>;

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Public answer")).toBeInTheDocument();
    expect(screen.queryByText("unsafe legacy answer")).not.toBeInTheDocument();
    expect(screen.queryByText("unsafe legacy error")).not.toBeInTheDocument();
  });

  it("renders an in-progress tool part as one chain step", () => {
    const message: CopilotMessage = {
      id: "assistant-active-tool",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [
        {
          type: "tool",
          toolCallId: "tool-active",
          toolName: "active_lookup",
          state: "input-ready",
          input: { id: 1 },
        },
      ],
    };

    render(<MessageBubble message={message} />);

    expect(screen.getAllByText(/active_lookup/)).toHaveLength(1);
    expect(screen.getByText("ui.processing")).toBeInTheDocument();
  });
});
