import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotError, CopilotQuestionRequest } from "@copilot";

import { QuestionCard } from "./QuestionCard";

describe("QuestionCard", () => {
  it("uses the public input discriminator and retains submission errors", () => {
    const request: CopilotQuestionRequest = {
      question: "Which environment?",
      input: "choice",
      options: ["staging", "production"],
    };
    const interactionError: CopilotError = {
      code: "transport-error",
      operation: "submit-answer",
      message: "Answer could not be submitted",
      recoverable: true,
    };
    const onSubmit = vi.fn();

    render(
      <QuestionCard
        request={request}
        interactionError={interactionError}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(interactionError.message!);
    expect(screen.queryByRole("button", { name: "ui.skipQuestion" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "staging" }));
    fireEvent.click(screen.getByRole("button", { name: "staging" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenNthCalledWith(1, "staging");
    expect(onSubmit).toHaveBeenNthCalledWith(2, "staging");
  });
});
