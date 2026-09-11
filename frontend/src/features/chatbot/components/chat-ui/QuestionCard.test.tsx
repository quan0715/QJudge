import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotError, CopilotQuestionRequest } from "@copilot";

import { QuestionCard } from "./QuestionCard";

const styles = readFileSync(
  "src/features/chatbot/components/chat-ui/QuestionCard.module.scss",
  "utf8",
);

describe("QuestionCard", () => {
  it("disables answer choices while a submission is pending", () => {
    render(
      <QuestionCard
        request={{
          question: "Which environment?",
          input: "choice",
          options: ["staging"],
        }}
        pending
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "staging" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /ui\.submitAnswer|送出回答/ }),
    ).toBeDisabled();
  });

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

  it("contains long Ask User content inside narrow chat panels", () => {
    expect(styles).toMatch(/\.wrapper\s*\{[^}]*width:\s*100%/s);
    expect(styles).toMatch(/\.wrapper\s*\{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.optionBtn\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });
});
