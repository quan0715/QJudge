import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotMessageViewProps, CopilotMessageListSlotProps } from "@copilot";

const { useCopilotScroll } = vi.hoisted(() => ({
  useCopilotScroll: vi.fn(() => ({
    scrollToBottom: vi.fn(),
    showScrollButton: false,
  })),
}));

vi.mock("@copilot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@copilot")>()),
  useCopilotScroll,
}));

import { MessageList } from "./MessageList";

function TestMessage({ message }: CopilotMessageViewProps) {
  return <div data-testid="custom-message">{message.id}</div>;
}

const readyProps: CopilotMessageListSlotProps = {
  messages: [
    {
      id: "message-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      parts: [{ type: "text", text: "Answer" }],
    },
  ],
  activeSessionId: "session-1",
  activeSession: {
    status: "ready",
    id: "session-1",
    data: {
      id: "session-1",
      title: "Session",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      messages: [],
    },
    error: null,
  },
  run: { status: "ready", run: null },
  messageComponent: TestMessage,
};

describe("MessageList", () => {
  it("delegates every message to the provided public slot renderer", () => {
    render(<MessageList {...readyProps} />);

    expect(screen.getByTestId("custom-message")).toHaveTextContent("message-1");
    expect(useCopilotScroll).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSessionId: "session-1",
        loading: false,
        messages: readyProps.messages,
      }),
    );
  });

  it("shows history skeleton only while an active session is loading", () => {
    const { container, rerender } = render(
      <MessageList
        {...readyProps}
        messages={[]}
        activeSession={{ status: "loading", id: "session-1", data: null, error: null }}
      />,
    );

    expect(container.querySelector('[class*="skeletonStack"]')).toBeInTheDocument();

    rerender(<MessageList {...readyProps} messages={[]} />);
    expect(container.querySelector('[class*="skeletonStack"]')).not.toBeInTheDocument();
  });
});
