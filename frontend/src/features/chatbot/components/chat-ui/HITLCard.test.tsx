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

    expect(screen.getByRole("button", { name: /ui.confirmAction/ })).toBeDisabled();
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

    expect(screen.getByText("deploy")).toBeInTheDocument();
    expect(screen.getByText(/staging/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(retainedError.message!);
    expect(screen.queryByRole("button", { name: /ui.confirmAction/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ui.cancelAction/ }));
    fireEvent.click(screen.getByRole("button", { name: /ui.cancelAction/ }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenNthCalledWith(1, "reject");
    expect(onSubmit).toHaveBeenNthCalledWith(2, "reject");
  });
});
