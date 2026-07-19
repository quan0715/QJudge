import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotError, CopilotSubscription } from "@/core/copilot";
import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotRun } from "../hooks/useCopilotRun";
import { MemoryCopilotTransport } from "../testing";
import { CopilotProvider } from "./CopilotProvider";

function wrapper(transport: MemoryCopilotTransport) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CopilotProvider transport={transport} initialSession="create">
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

  it("retains an approval request when submission fails", async () => {
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

    await expect(result.current.run.submitApproval("approve")).rejects.toBe(failure);
    expect(result.current.run.state.status).toBe("awaiting-approval");
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
