import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCopilotTransportCapabilities,
  type CopilotError,
  type CopilotRunEvent,
  type CopilotTransport,
} from "@/core/copilot";

export interface CopilotTransportContractDriver {
  emit(runId: string, event: CopilotRunEvent): void;
  fail(runId: string, error: CopilotError): void;
}

export type CopilotTransportContractSubject = CopilotTransport &
  CopilotTransportContractDriver;

function isCopilotError(value: unknown): value is CopilotError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CopilotError>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.operation === "string" &&
    typeof candidate.recoverable === "boolean"
  );
}

export function runCopilotTransportContract(
  createTransport: () => CopilotTransportContractSubject,
): void {
  describe("CopilotTransport contract", () => {
    let transport: CopilotTransportContractSubject;

    beforeEach(() => {
      transport = createTransport();
    });

    it("normalizes session CRUD shapes, IDs and Dates", async () => {
      const created = await transport.createSession({ title: "Contract session" });
      expect(created.id).not.toBe("");
      expect(created.title).toBe("Contract session");
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);

      const listed = await transport.listSessions();
      const summary = listed.find((session) => session.id === created.id);
      expect(summary).toBeDefined();
      expect(summary?.createdAt).toEqual(created.createdAt);
      expect(summary?.updatedAt).toEqual(created.updatedAt);

      const loaded = await transport.getSession(created.id);
      expect(loaded.id).toBe(created.id);
      expect(loaded.createdAt).toEqual(created.createdAt);

      const renamed = await transport.renameSession(created.id, "Renamed session");
      expect(renamed.id).toBe(created.id);
      expect(renamed.title).toBe("Renamed session");
      expect(renamed.updatedAt).toBeInstanceOf(Date);

      await transport.deleteSession(created.id);
      expect(await transport.listSessions()).not.toContainEqual(
        expect.objectContaining({ id: created.id }),
      );
    });

    it("normalizes transport failures into CopilotError", async () => {
      const error = await transport.getSession("missing-session").then(
        () => null,
        (reason: unknown) => reason,
      );

      expect(isCopilotError(error)).toBe(true);
    });

    it("starts runs with stable run and session identifiers", async () => {
      const session = await transport.createSession();
      const run = await transport.startRun({
        sessionId: session.id,
        text: "Hello",
      });

      expect(run.id).not.toBe("");
      expect(run.sessionId).toBe(session.id);
      expect(run.status).toBe("queued");
    });

    it("closes subscriptions synchronously and suppresses later observers", async () => {
      const session = await transport.createSession();
      const run = await transport.startRun({
        sessionId: session.id,
        text: "Hello",
      });
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const subscription = transport.subscribeRun(run, observer);
      const firstEvent: CopilotRunEvent = {
        type: "text-delta",
        runId: run.id,
        sessionId: session.id,
        messageId: "assistant-1",
        sequence: 1,
        delta: "Hello",
      };

      expect(subscription).not.toBeInstanceOf(Promise);
      expect(subscription.closed).toBe(false);
      transport.emit(run.id, firstEvent);
      expect(observer.next).toHaveBeenCalledWith(
        expect.objectContaining({
          type: firstEvent.type,
          runId: firstEvent.runId,
          sessionId: firstEvent.sessionId,
          sequence: firstEvent.sequence,
          delta: firstEvent.delta,
        }),
      );

      subscription.close();
      expect(subscription.closed).toBe(true);
      subscription.close();
      transport.emit(run.id, { ...firstEvent, sequence: 2, delta: " world" });
      transport.fail(run.id, {
        code: "stream-disconnected",
        operation: "subscribe-run",
        recoverable: true,
      });

      expect(observer.next).toHaveBeenCalledTimes(1);
      expect(observer.error).not.toHaveBeenCalled();
      expect(observer.complete).not.toHaveBeenCalled();
    });

    it("keeps declared capabilities consistent with optional methods", () => {
      expect(() => assertCopilotTransportCapabilities(transport)).not.toThrow();

      const capabilityMethods = [
        ["resumableStreams", "getActiveRun"],
        ["cancellableRuns", "cancelRun"],
        ["attachments", "uploadAttachment"],
        ["approvals", "submitApproval"],
        ["questions", "submitAnswer"],
      ] as const;

      for (const [capability, method] of capabilityMethods) {
        expect(typeof transport[method] === "function").toBe(
          transport.capabilities[capability],
        );

        if (transport.capabilities[capability]) {
          const invalidTransport = Object.create(transport) as CopilotTransport;
          Object.defineProperty(invalidTransport, method, { value: undefined });
          let thrown: unknown;
          try {
            assertCopilotTransportCapabilities(invalidTransport);
          } catch (error) {
            thrown = error;
          }
          expect(thrown).toMatchObject({
            code: "unsupported-capability",
            recoverable: false,
          });
        }
      }
    });
  });
}
