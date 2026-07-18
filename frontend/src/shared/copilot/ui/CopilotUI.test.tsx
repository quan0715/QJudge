import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage } from "@/core/copilot";
import { CopilotApprovalCard } from "./CopilotApprovalCard";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotMessageView } from "./CopilotMessageView";
import { CopilotQuestionCard } from "./CopilotQuestionCard";
import { CopilotProvider } from "../react/CopilotProvider";
import { MemoryCopilotTransport } from "../testing";

const message: CopilotMessage = {
  id: "one",
  role: "assistant",
  createdAt: new Date(),
  parts: [{ type: "text", text: "Hello" }],
};

describe("Copilot UI primitives", () => {
  it("renders a semantic message without exposing hidden errors", () => {
    render(<CopilotMessageView message={message} />);
    expect(screen.getByRole("article")).toHaveAttribute("data-role", "assistant");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders composer semantics and disabled submit", () => {
    render(<CopilotProvider transport={new MemoryCopilotTransport()}><CopilotComposer disabled placeholder="Ask" /></CopilotProvider>);
    expect(screen.getByLabelText("Ask")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("submits approval and choice answers", () => {
    const approve = vi.fn();
    const answer = vi.fn();
    render(
      <>
        <CopilotApprovalCard
          request={{ actions: [{ name: "write" }], allowedDecisions: ["approve"] }}
          onSubmit={approve}
        />
        <CopilotQuestionCard
          request={{ question: "Pick", input: "choice", options: ["A"] }}
          onSubmit={answer}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(approve).toHaveBeenCalledWith("approve");
    expect(answer).toHaveBeenCalledWith("A");
  });
});
