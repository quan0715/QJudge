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
});
