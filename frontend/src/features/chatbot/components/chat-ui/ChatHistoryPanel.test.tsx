import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CopilotSessionSummary } from "@copilot";

import { ChatHistoryPanel } from "./ChatHistoryPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { id?: string }) =>
      key === "ui.defaultTaskTitle" ? `ui.defaultTaskTitle ${options?.id}` : key,
  }),
}));

function task(id: string, title: string, updatedAt: string): CopilotSessionSummary {
  return {
    id,
    title,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
  } as CopilotSessionSummary;
}

const props: ComponentProps<typeof ChatHistoryPanel> = {
  sessions: [],
  currentSessionId: null,
  onSelectSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onRenameSession: vi.fn(),
};

describe("ChatHistoryPanel", () => {
  it("renders a flat newest-first task list without time groups", () => {
    render(
      <ChatHistoryPanel
        {...props}
        sessions={[
          task("older", "Older task", "2026-07-19T08:00:00.000Z"),
          task("newest", "Newest task", "2026-07-21T08:00:00.000Z"),
        ]}
      />,
    );

    expect(screen.getByText("ui.tasks")).toBeInTheDocument();
    const newest = screen.getByText("Newest task").closest('[role="button"]');
    const older = screen.getByText("Older task").closest('[role="button"]');
    expect(newest?.compareDocumentPosition(older!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText("ui.groupToday")).not.toBeInTheDocument();
    expect(screen.queryByText("ui.groupOlder")).not.toBeInTheDocument();
  });

  it("places a new-task action before the task list and invokes it", () => {
    const onNewTask = vi.fn();
    const pendingTaskProps = {
      ...props,
      sessions: [task("task-1", "Current task", "2026-07-21T08:00:00.000Z")],
      onNewTask,
    } as unknown as ComponentProps<typeof ChatHistoryPanel>;

    render(<ChatHistoryPanel {...pendingTaskProps} />);

    const newTask = screen.getByRole("button", { name: "ui.newTask" });
    const currentTask = screen.getByText("Current task").closest('[role="button"]');
    expect(newTask.compareDocumentPosition(currentTask!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(newTask);
    expect(onNewTask).toHaveBeenCalledOnce();
  });

  it("does not prevent Space in the rename input or select the task", () => {
    const onSelectSession = vi.fn();
    render(
      <ChatHistoryPanel
        {...props}
        sessions={[task("task-1", "Current task", "2026-07-21T08:00:00.000Z")]}
        onSelectSession={onSelectSession}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.click(screen.getByText("ui.rename"));
    const input = screen.getByRole("textbox");
    onSelectSession.mockClear();
    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    fireEvent(input, event);

    expect(event.defaultPrevented).toBe(false);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("commits rename on Enter without selecting the task", () => {
    const onSelectSession = vi.fn();
    const onRenameSession = vi.fn();
    render(
      <ChatHistoryPanel
        {...props}
        sessions={[task("task-1", "Current task", "2026-07-21T08:00:00.000Z")]}
        onSelectSession={onSelectSession}
        onRenameSession={onRenameSession}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    fireEvent.click(screen.getByText("ui.rename"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed task" } });
    onSelectSession.mockClear();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRenameSession).toHaveBeenCalledWith("task-1", "Renamed task");
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("does not select the task for Enter or Space on the overflow trigger", () => {
    const onSelectSession = vi.fn();
    render(
      <ChatHistoryPanel
        {...props}
        sessions={[task("task-1", "Current task", "2026-07-21T08:00:00.000Z")]}
        onSelectSession={onSelectSession}
      />,
    );
    const overflow = screen.getByRole("button", { name: "Options" });

    fireEvent.keyDown(overflow, { key: "Enter" });
    fireEvent.keyDown(overflow, { key: " " });

    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("selects the task for Enter or Space on the row itself", () => {
    const onSelectSession = vi.fn();
    render(
      <ChatHistoryPanel
        {...props}
        sessions={[task("task-1", "Current task", "2026-07-21T08:00:00.000Z")]}
        onSelectSession={onSelectSession}
      />,
    );
    const row = screen.getByText("Current task").closest('[role="button"]');

    fireEvent.keyDown(row!, { key: "Enter" });
    fireEvent.keyDown(row!, { key: " " });

    expect(onSelectSession).toHaveBeenNthCalledWith(1, "task-1");
    expect(onSelectSession).toHaveBeenNthCalledWith(2, "task-1");
  });
});
