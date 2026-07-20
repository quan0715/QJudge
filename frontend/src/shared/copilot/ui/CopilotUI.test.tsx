import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage, CopilotRun } from "@/core/copilot";
import {
  CopilotApprovalCard,
  type CopilotApprovalCardProps,
} from "./CopilotApprovalCard";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotMessageView } from "./CopilotMessageView";
import { CopilotPanel } from "./CopilotPanel";
import {
  CopilotQuestionCard,
  type CopilotQuestionCardProps,
} from "./CopilotQuestionCard";
import type { CopilotSuggestionsProps } from "./copilotUI.types";
import { CopilotProvider } from "../react/CopilotProvider";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotTransport,
} from "../testing";

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
    render(<CopilotProvider transport={new MemoryCopilotTransport()} enabled={false}><CopilotComposer disabled placeholder="Ask" /></CopilotProvider>);
    expect(screen.getByLabelText("Ask")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("renders available models and sends with the provider selection", async () => {
    const transport = new MemoryCopilotTransport();
    await transport.createSession();
    const startRun = vi.spyOn(transport, "startRun");
    const models = new MemoryCopilotModelCatalog([
      { id: "fast", displayName: "Fast", isDefault: true },
      { id: "deep", displayName: "Deep" },
    ]);
    render(
      <CopilotProvider
        transport={transport}
        modelCatalog={models}
        initialSession="first"
      >
        <CopilotComposer />
      </CopilotProvider>,
    );

    const modelControl = await screen.findByRole("combobox", { name: "Model" });
    fireEvent.change(modelControl, { target: { value: "deep" } });
    fireEvent.change(screen.getByLabelText("Message AI Copilot"), {
      target: { value: "Help" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: "deep", text: "Help" }),
      ),
    );
  });

  it("does not render a model control when the catalog is unavailable", () => {
    render(
      <CopilotProvider
        transport={new MemoryCopilotTransport()}
        fallbackModels={[{ id: "fallback", displayName: "Fallback" }]}
        enabled={false}
      >
        <CopilotComposer />
      </CopilotProvider>,
    );

    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
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

  it("renders history, list, suggestions and composer slots", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const History = vi.fn(() => <div data-testid="history-slot" />);
    const List = vi.fn(() => <div data-testid="list-slot" />);
    const Suggestions = vi.fn(() => <div data-testid="suggestions-slot" />);
    const Composer = vi.fn(() => <div data-testid="composer-slot" />);

    render(
      <CopilotProvider transport={transport} initialSession="first">
        <CopilotPanel
          showHistory
          slots={{
            history: History,
            messageList: List,
            suggestions: Suggestions,
            composer: Composer,
          }}
        />
      </CopilotProvider>,
    );

    expect(await screen.findByTestId("history-slot")).toBeInTheDocument();
    expect(screen.getByTestId("list-slot")).toBeInTheDocument();
    expect(screen.getByTestId("composer-slot")).toBeInTheDocument();
    expect(History).toHaveBeenCalled();
    expect(List.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ activeSessionId: session.id }),
    );
  });

  it("shows next-turn suggestions only after the run is ready", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const getSession = transport.getSession.bind(transport);
    vi.spyOn(transport, "getSession").mockImplementation(async (id) => ({
      ...(await getSession(id)),
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          parts: [
            {
              type: "data-next-turn-options",
              data: [
                { label: "Explain", message: "Explain more" },
                { label: "Continue", message: "Continue" },
              ],
            },
          ],
        },
      ],
    }));
    const run = await transport.startRun({
      sessionId: session.id,
      text: "start",
    });
    const subscribe = vi.spyOn(transport, "subscribeRun");
    const startRun = vi.spyOn(transport, "startRun");
    const Suggestions = vi.fn(({ options, onSelect }: CopilotSuggestionsProps) => (
      <button
        type="button"
        data-testid="suggestions-slot"
        onClick={() => onSelect(options[0].message)}
      >
        Suggested reply
      </button>
    ));

    render(
      <CopilotProvider transport={transport} initialSession="first">
        <CopilotPanel slots={{ suggestions: Suggestions }} />
      </CopilotProvider>,
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    expect(screen.queryByTestId("suggestions-slot")).not.toBeInTheDocument();

    act(() => {
      transport.emit(run.id, {
        type: "run-status",
        runId: run.id,
        sessionId: session.id,
        sequence: 1,
        status: "completed",
      });
    });

    expect(await screen.findByTestId("suggestions-slot")).toBeInTheDocument();
    expect(Suggestions.mock.calls.at(-1)?.[0].options).toEqual([
      { label: "Explain", message: "Explain more" },
      { label: "Continue", message: "Continue" },
    ]);
    fireEvent.click(screen.getByTestId("suggestions-slot"));
    await waitFor(() =>
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Explain more" }),
      ),
    );
  });

  it("filters invalid next-turn suggestions instead of casting arbitrary data", async () => {
    const transport = new MemoryCopilotTransport();
    await transport.createSession();
    const getSession = transport.getSession.bind(transport);
    vi.spyOn(transport, "getSession").mockImplementation(async (id) => ({
      ...(await getSession(id)),
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          parts: [
            {
              type: "data-next-turn-options",
              data: [
                { label: "Valid", message: "Send this" },
                { label: "Missing message" },
                "not-an-option",
              ],
            },
          ],
        },
      ],
    }));
    const Suggestions = vi.fn(() => <div data-testid="suggestions-slot" />);

    render(
      <CopilotProvider transport={transport} initialSession="first">
        <CopilotPanel slots={{ suggestions: Suggestions }} />
      </CopilotProvider>,
    );

    expect(await screen.findByTestId("suggestions-slot")).toBeInTheDocument();
    expect(Suggestions.mock.calls.at(-1)?.[0].options).toEqual([
      { label: "Valid", message: "Send this" },
    ]);
  });

  it("shows approval submission errors and keeps the request retryable", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const started = await transport.startRun({
      sessionId: session.id,
      text: "deploy",
    });
    const awaiting = {
      ...started,
      status: "awaiting-approval" as const,
      approvalRequest: {
        actions: [{ name: "deploy" }],
        allowedDecisions: ["approve", "reject"] as const,
      },
    } satisfies CopilotRun;
    vi.spyOn(transport, "getActiveRun").mockResolvedValue(awaiting);
    vi.spyOn(transport, "submitApproval").mockRejectedValue(
      new Error("Approval failed"),
    );
    const Approval = vi.fn((props: CopilotApprovalCardProps) => (
      <CopilotApprovalCard {...props} />
    ));

    render(
      <CopilotProvider transport={transport} initialSession="first">
        <CopilotPanel slots={{ approval: Approval }} />
      </CopilotProvider>,
    );
    const approve = await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(approve);

    expect(await screen.findByText("Approval failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Approval required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(Approval.mock.calls.at(-1)?.[0].interactionError).toEqual(
      expect.objectContaining({ message: "Approval failed" }),
    );
  });

  it("shows answer submission errors and keeps the question retryable", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const started = await transport.startRun({
      sessionId: session.id,
      text: "ask",
    });
    const awaiting = {
      ...started,
      status: "awaiting-answer" as const,
      questionRequest: {
        question: "Pick one",
        input: "choice" as const,
        options: ["A"],
      },
    } satisfies CopilotRun;
    vi.spyOn(transport, "getActiveRun").mockResolvedValue(awaiting);
    vi.spyOn(transport, "submitAnswer").mockRejectedValue(
      new Error("Answer failed"),
    );
    const Question = vi.fn((props: CopilotQuestionCardProps) => (
      <CopilotQuestionCard {...props} />
    ));

    render(
      <CopilotProvider transport={transport} initialSession="first">
        <CopilotPanel slots={{ question: Question }} />
      </CopilotProvider>,
    );
    const answer = await screen.findByRole("button", { name: "A" });
    fireEvent.click(answer);

    expect(await screen.findByText("Answer failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A" })).toBeEnabled();
    expect(Question.mock.calls.at(-1)?.[0].interactionError).toEqual(
      expect.objectContaining({ message: "Answer failed" }),
    );
  });
});
