import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotError, CopilotSubscription } from "@/core/copilot";
import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotRun } from "../hooks/useCopilotRun";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { MemoryCopilotTransport } from "../testing";
import { CopilotProvider } from "./CopilotProvider";
import type { CopilotInitialSessionStrategy } from "./copilotSessionBootstrap";

function wrapper(
  transport: MemoryCopilotTransport,
  initialSession: CopilotInitialSessionStrategy = "create",
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CopilotProvider transport={transport} initialSession={initialSession}>
        {children}
      </CopilotProvider>
    );
  };
}

describe("CopilotProvider run lifecycle", () => {
  it("moves from submitted through streaming to ready", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Hello"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    let sent!: Awaited<ReturnType<typeof result.current.composer.send>>;
    await act(async () => {
      sent = await result.current.composer.send();
    });

    expect(sent.accepted).toBe(true);
    expect(result.current.run.state.status).toBe("submitted");
    const sessionId = sent.sessionId;
    act(() =>
      transport.emit(sent.runId!, {
        type: "run-status",
        runId: sent.runId!,
        sessionId,
        sequence: 1,
        status: "running",
      }),
    );
    expect(result.current.run.state.status).toBe("streaming");
    act(() =>
      transport.emit(sent.runId!, {
        type: "run-status",
        runId: sent.runId!,
        sessionId,
        sequence: 2,
        status: "completed",
      }),
    );
    expect(result.current.run.state.status).toBe("ready");
  });

  it("closes the captured subscription before cancelling", async () => {
    const transport = new MemoryCopilotTransport();
    const order: string[] = [];
    const originalSubscribe = transport.subscribeRun.bind(transport);
    vi.spyOn(transport, "subscribeRun").mockImplementation((run, observer, options) => {
      const subscription = originalSubscribe(run, observer, options);
      return {
        get closed() {
          return subscription.closed;
        },
        close() {
          order.push("close");
          subscription.close();
        },
      } satisfies CopilotSubscription;
    });
    const originalCancel = transport.cancelRun.bind(transport);
    vi.spyOn(transport, "cancelRun").mockImplementation(async (id) => {
      order.push("cancel");
      return originalCancel(id);
    });
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Stop me"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    await act(() => result.current.composer.send());

    await act(() => result.current.run.stop());

    expect(order.slice(0, 2)).toEqual(["close", "cancel"]);
    expect(result.current.run.state.status).toBe("ready");
  });

  it("retains an approval request and interaction error when submission fails", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Change it"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());
    act(() =>
      transport.emit(sent.runId!, {
        type: "awaiting-approval",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 1,
        request: { actions: [{ name: "write" }], allowedDecisions: ["approve"] },
      }),
    );
    const failure: Error & CopilotError = Object.assign(new Error("offline"), {
      code: "transport-error" as const,
      operation: "submit-approval" as const,
      recoverable: true,
    });
    vi.spyOn(transport, "submitApproval").mockRejectedValueOnce(failure);

    await act(() => result.current.run.submitApproval("approve"));
    expect(result.current.run.state.status).toBe("awaiting-approval");
    if (result.current.run.state.status === "awaiting-approval") {
      expect(result.current.run.state.request.actions).toEqual([{ name: "write" }]);
      expect(result.current.run.state.interactionError).toBe(failure);
    }
  });

  it("subscribes to the run returned by submitApproval", async () => {
    const transport = new MemoryCopilotTransport();
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Change it"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());
    act(() =>
      transport.emit(sent.runId!, {
        type: "awaiting-approval",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 3,
        request: { actions: [{ name: "write" }], allowedDecisions: ["approve"] },
      }),
    );

    await act(() => result.current.run.submitApproval("approve"));

    expect(subscribeRun).toHaveBeenCalledTimes(2);
    expect(subscribeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: sent.runId, status: "running" }),
      expect.any(Object),
      expect.objectContaining({ fromSequence: 3 }),
    );
    expect(result.current.run.state.status).toBe("streaming");
  });

  it("re-subscribes to a run after submitting an answer", async () => {
    const transport = new MemoryCopilotTransport();
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Grade it"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());
    act(() =>
      transport.emit(sent.runId!, {
        type: "awaiting-answer",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 25,
        request: {
          question: "Which rubric should I use?",
          input: "text",
        },
      }),
    );
    expect(result.current.run.state.status).toBe("awaiting-answer");

    await act(() => result.current.run.submitAnswer("Use the existing rubric"));

    expect(subscribeRun).toHaveBeenCalledTimes(2);
    expect(subscribeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: sent.runId, status: "running" }),
      expect.any(Object),
      expect.objectContaining({ fromSequence: 25 }),
    );
    expect(result.current.run.state.status).toBe("streaming");
  });

  it("retains a question and interaction error when submission fails", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Grade it"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());
    act(() =>
      transport.emit(sent.runId!, {
        type: "awaiting-answer",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 1,
        request: { question: "Continue?", input: "text" },
      }),
    );
    vi.spyOn(transport, "submitAnswer").mockRejectedValueOnce(new Error("offline"));

    await act(() => result.current.run.submitAnswer("yes"));

    expect(result.current.run.state.status).toBe("awaiting-answer");
    if (result.current.run.state.status === "awaiting-answer") {
      expect(result.current.run.state.request.question).toBe("Continue?");
      expect(result.current.run.state.interactionError?.operation).toBe("submit-answer");
    }
  });

  it("exposes and clears the current run notice", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), run: useCopilotRun() }),
      { wrapper: wrapper(transport) },
    );
    act(() => result.current.composer.setDraft("Long conversation"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());

    act(() =>
      transport.emit(sent.runId!, {
        type: "run-notice",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 1,
        notice: "Summarizing",
      }),
    );
    expect(result.current.run.notice).toBe("Summarizing");

    act(() =>
      transport.emit(sent.runId!, {
        type: "run-notice",
        runId: sent.runId!,
        sessionId: sent.sessionId,
        sequence: 2,
        notice: null,
      }),
    );
    expect(result.current.run.notice).toBeNull();
  });

  it("reconnects a recoverable interruption from the last sequence", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "start" });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const getActiveRun = vi.spyOn(transport, "getActiveRun");
    const { result } = renderHook(() => useCopilotRun(), {
      wrapper: wrapper(transport, "first"),
    });
    await waitFor(() => expect(subscribeRun).toHaveBeenCalledTimes(1));
    act(() =>
      transport.emit(run.id, {
        type: "run-status",
        runId: run.id,
        sessionId: session.id,
        sequence: 8,
        status: "running",
      }),
    );
    getActiveRun.mockResolvedValueOnce({ ...run, status: "running" });
    vi.useFakeTimers();
    try {
      act(() =>
        transport.fail(run.id, {
          code: "stream-disconnected",
          operation: "subscribe-run",
          recoverable: true,
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      expect(subscribeRun).toHaveBeenCalledTimes(2);
      expect(subscribeRun).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: run.id, lastSequence: 8 }),
        expect.any(Object),
        expect.objectContaining({ fromSequence: 8 }),
      );
      expect(result.current.state.status).toBe("streaming");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reconnect a recoverable interruption while awaiting HITL", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "start" });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result } = renderHook(() => useCopilotRun(), {
      wrapper: wrapper(transport, "first"),
    });
    await waitFor(() => expect(subscribeRun).toHaveBeenCalledTimes(1));
    act(() =>
      transport.emit(run.id, {
        type: "awaiting-answer",
        runId: run.id,
        sessionId: session.id,
        sequence: 1,
        request: { question: "Continue?", input: "text" },
      }),
    );
    vi.useFakeTimers();
    try {
      act(() =>
        transport.fail(run.id, {
          code: "stream-disconnected",
          operation: "subscribe-run",
          recoverable: true,
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      expect(subscribeRun).toHaveBeenCalledTimes(1);
      expect(result.current.state.status).toBe("awaiting-answer");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let a reconnect timer subscribe after a session switch", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession();
    const run = await transport.startRun({ sessionId: first.id, text: "start" });
    const second = await transport.createSession();
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result } = renderHook(
      () => ({ run: useCopilotRun(), sessions: useCopilotSessions() }),
      { wrapper: wrapper(transport, "first") },
    );
    await waitFor(() => expect(subscribeRun).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    try {
      act(() =>
        transport.fail(run.id, {
          code: "stream-disconnected",
          operation: "subscribe-run",
          recoverable: true,
        }),
      );
      await act(() => result.current.sessions.select(second.id));
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      expect(result.current.sessions.activeSession.id).toBe(second.id);
      expect(subscribeRun).toHaveBeenCalledTimes(1);
      expect(result.current.run.state.status).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps failed attachments and draft for retry", async () => {
    const transport = new MemoryCopilotTransport();
    vi.spyOn(transport, "uploadAttachment").mockRejectedValueOnce(new Error("bad file"));
    const { result } = renderHook(() => useCopilotComposer(), {
      wrapper: wrapper(transport),
    });
    const file = new File(["x"], "bad.txt", { type: "text/plain" });
    act(() => result.current.setDraft("with file"));
    await waitFor(() => expect(result.current.canSend).toBe(true));
    await act(() => result.current.addAttachments([file]));

    const sent = await act(() => result.current.send());

    expect(sent.accepted).toBe(false);
    expect(result.current.draft).toBe("with file");
    expect(result.current.attachments[0].status).toBe("error");
  });
});
