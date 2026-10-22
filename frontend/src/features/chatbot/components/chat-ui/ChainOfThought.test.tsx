import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CopilotToolPart } from "@copilot";

import { ChainOfThought } from "./ChainOfThought";

const task = (overrides: Partial<CopilotToolPart> = {}): CopilotToolPart => ({
  type: "tool",
  toolCallId: "T1",
  toolName: "task",
  state: "output-ready",
  input: { description: "批改 Q3 TCP 三向交握\n細節：逐份閱讀作答" },
  ...overrides,
});

const child: CopilotToolPart = {
  type: "tool",
  toolCallId: "C1",
  toolName: "echo_tool",
  state: "output-ready",
  parentToolCallId: "T1",
};

describe("ChainOfThought subagents", () => {
  it("renders task as a subagent card titled by description", () => {
    render(<ChainOfThought steps={[task()]} isProcessing={false} />);

    expect(screen.getByText("批改 Q3 TCP 三向交握")).toBeInTheDocument();
    expect(screen.queryByText(/細節/)).not.toBeInTheDocument();
  });

  it("truncates long descriptions", () => {
    const description = "批".repeat(50);
    render(<ChainOfThought steps={[task({ input: { description } })]} isProcessing={false} />);

    expect(screen.getByText(`${"批".repeat(40)}…`)).toBeInTheDocument();
  });

  it("nests child tool steps inside the subagent card", () => {
    render(<ChainOfThought steps={[task(), child]} isProcessing={false} />);

    const card = screen.getByText("批改 Q3 TCP 三向交握").closest("li");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("echo_tool #1")).toBeInTheDocument();
    const topLevelItems = screen
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.closest("li") === null);
    expect(topLevelItems).toHaveLength(1);
  });

  it("renders legacy tools without parent as flat steps", () => {
    const legacy: CopilotToolPart = {
      type: "tool",
      toolCallId: "L1",
      toolName: "lookup",
      state: "output-ready",
    };
    render(<ChainOfThought steps={[legacy]} isProcessing={false} />);

    expect(screen.getByText("lookup #1")).toBeVisible();
  });

  it("shows subagent result after completion", () => {
    render(
      <ChainOfThought steps={[task({ output: "Q3 完成 36 份" })]} isProcessing={false} />,
    );

    fireEvent.click(screen.getByText("批改 Q3 TCP 三向交握"));
    expect(screen.getByText("ui.subagentResult")).toBeVisible();
    expect(screen.getByText("Q3 完成 36 份")).toBeVisible();
  });

  it("opens the running subagent with its activity and todos", () => {
    render(
      <ChainOfThought
        steps={[child]}
        isProcessing
        activeStep={task({
          state: "input-ready",
          activity: {
            text: "正在讀取作答",
            todos: [{ id: "1", label: "建立 rubric", status: "in_progress" }],
          },
        })}
      />,
    );

    expect(screen.getByText("正在讀取作答")).toBeVisible();
    expect(screen.getByText("建立 rubric")).toBeVisible();
    expect(screen.getByText(/echo_tool/)).toBeVisible();
  });
});
