import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotApprovalRequest, CopilotError } from "@copilot";

import { HITLCard } from "./HITLCard";

const retainedError: CopilotError = {
  code: "transport-error",
  operation: "submit-approval",
  message: "Approval could not be submitted",
  recoverable: true,
};

describe("HITLCard", () => {
  it("shows a single action name heading and only the arguments needing confirmation", () => {
    render(
      <HITLCard
        request={{
          actions: [
            {
              name: "qjudge_grading",
              arguments: {
                action: "batch_grade",
                grades: [{ score: 2 }],
                options: { dry_run: false },
              },
            },
          ],
          allowedDecisions: ["approve", "reject"],
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByText("qjudge_grading")).not.toBeInTheDocument();
    expect(screen.queryByText("action")).not.toBeInTheDocument();
    expect(screen.getAllByText("batch_grade")).toHaveLength(1);
    expect(screen.getByText("grades")).toBeInTheDocument();
    expect(screen.getByText("ui.toolArrayItems")).toBeInTheDocument();
    expect(screen.getByText("options")).toBeInTheDocument();
    expect(screen.getByText("ui.toolObjectFields")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ui.toolTechnicalDetails" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("disables decisions while a submission is pending", () => {
    render(
      <HITLCard
        request={{
          actions: [{ name: "deploy" }],
          allowedDecisions: ["approve", "reject"],
        }}
        pending
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /ui.processing/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ui.cancelAction/ })).toBeDisabled();
  });

  it("renders action arguments and only the allowed decisions", () => {
    const request: CopilotApprovalRequest = {
      actions: [{ name: "deploy", arguments: { environment: "staging" } }],
      allowedDecisions: ["reject"],
    };
    const onSubmit = vi.fn();

    render(
      <HITLCard
        request={request}
        interactionError={retainedError}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByText("deploy")).toHaveLength(1);
    expect(screen.getAllByText(/staging/)).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent(retainedError.message!);
    expect(screen.queryByRole("button", { name: /ui.confirmAction/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ui.cancelAction/ }));
    fireEvent.click(screen.getByRole("button", { name: /ui.cancelAction/ }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenNthCalledWith(1, "reject");
    expect(onSubmit).toHaveBeenNthCalledWith(2, "reject");
  });
});
