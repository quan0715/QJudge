import { describe, expect, it, vi } from "vitest";
import type { CopilotRunEvent } from "@/core/copilot";
import {
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "./index";
import { runCopilotTransportContract } from "./copilotTransportContract";

runCopilotTransportContract(() => new MemoryCopilotTransport());

describe("MemoryCopilotTransport", () => {
  it("delivers events and completes terminal runs", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "Hello" });
    const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() };
    const subscription = transport.subscribeRun(run, observer);
    const completed: CopilotRunEvent = {
      type: "run-status",
      runId: run.id,
      sessionId: session.id,
      sequence: 1,
      status: "completed",
    };

    transport.emit(run.id, completed);

    expect(observer.next).toHaveBeenCalledWith(completed);
    expect(observer.complete).toHaveBeenCalledOnce();
    expect(subscription.closed).toBe(true);
    await expect(transport.getActiveRun(session.id)).resolves.toBeNull();
  });

  it("delivers failures and closes active subscribers", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "Hello" });
    const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() };
    const subscription = transport.subscribeRun(run, observer);
    const error = {
      code: "stream-disconnected" as const,
      operation: "subscribe-run" as const,
      recoverable: true,
    };

    transport.fail(run.id, error);

    expect(observer.error).toHaveBeenCalledWith(error);
    expect(subscription.closed).toBe(true);
  });
});

describe("MemoryCopilotSessionLocation", () => {
  it("notifies a copied listener set synchronously", () => {
    const location = new MemoryCopilotSessionLocation();
    const second = vi.fn();
    let unsubscribeSecond = () => {};
    const first = vi.fn(() => unsubscribeSecond());
    location.subscribe(first);
    unsubscribeSecond = location.subscribe(second);

    location.set("session-1");

    expect(first).toHaveBeenCalledWith("session-1");
    expect(second).toHaveBeenCalledWith("session-1");
    expect(location.get()).toBe("session-1");
  });
});

describe("MemoryCopilotStorage", () => {
  it("stores and removes string preferences", () => {
    const storage = new MemoryCopilotStorage();
    storage.set("model", "model-1");
    expect(storage.get("model")).toBe("model-1");
    storage.remove("model");
    expect(storage.get("model")).toBeNull();
  });
});
