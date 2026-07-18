import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "../testing";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { useCopilotStateContext } from "./copilotContexts";
import { CopilotProvider } from "./CopilotProvider";

function createWrapper(
  props: Omit<React.ComponentProps<typeof CopilotProvider>, "children">,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CopilotProvider {...props}>{children}</CopilotProvider>;
  };
}

describe("CopilotProvider session lifecycle", () => {
  it("does not make requests while disabled", () => {
    const transport = new MemoryCopilotTransport();
    const listSessions = vi.spyOn(transport, "listSessions");
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, enabled: false }),
    });

    expect(result.current.listStatus).toBe("idle");
    expect(result.current.activeSession.status).toBe("empty");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("prefers a valid location ID over stored selection", async () => {
    const transport = new MemoryCopilotTransport();
    const stored = await transport.createSession({ title: "Stored" });
    const located = await transport.createSession({ title: "Located" });
    const location = new MemoryCopilotSessionLocation(located.id);
    const storage = new MemoryCopilotStorage([
      ["copilot:last-session-id", stored.id],
    ]);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        storage,
        initialSession: "first",
      }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.activeSession.id).toBe(located.id);
  });

  it("clears an invalid location and falls back to a valid stored ID", async () => {
    const transport = new MemoryCopilotTransport();
    const stored = await transport.createSession({ title: "Stored" });
    const location = new MemoryCopilotSessionLocation("missing");
    const storage = new MemoryCopilotStorage([
      ["copilot:last-session-id", stored.id],
    ]);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location, storage }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.activeSession.id).toBe(stored.id);
    expect(location.get()).toBe(stored.id);
  });

  it.each(["first", "none"] as const)(
    "applies the %s initial selection policy",
    async (initialSession) => {
      const transport = new MemoryCopilotTransport();
      const first = await transport.createSession({ title: "First" });
      const { result } = renderHook(() => useCopilotSessions(), {
        wrapper: createWrapper({ transport, initialSession }),
      });

      await waitFor(() => expect(result.current.listStatus).toBe("ready"));
      if (initialSession === "first") {
        await waitFor(() =>
          expect(result.current.activeSession.status).toBe("ready"),
        );
        expect(result.current.activeSession.id).toBe(first.id);
      } else {
        expect(result.current.activeSession.status).toBe("empty");
      }
    },
  );

  it("creates a session for the create policy", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "create" }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.sessions).toHaveLength(1);
  });

  it("restores an active run from its last sequence", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "Hi" });
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: session.id,
      sequence: 9,
      status: "running",
    });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const location = new MemoryCopilotSessionLocation(session.id);
    const { result } = renderHook(
      () => ({ sessions: useCopilotSessions(), state: useCopilotStateContext() }),
      {
        wrapper: createWrapper({ transport, sessionLocation: location }),
      },
    );

    await waitFor(() => expect(result.current.sessions.activeSession.status).toBe("ready"));
    await waitFor(() => expect(result.current.state.run.status).toBe("streaming"));
    expect(subscribeRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id }),
      expect.any(Object),
      expect.objectContaining({ fromSequence: 9 }),
    );
  });

  it("only commits the latest fast session selection", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const originalGet = transport.getSession.bind(transport);
    let releaseFirst = () => {};
    vi.spyOn(transport, "getSession").mockImplementation(async (id) => {
      if (id === first.id) await new Promise<void>((resolve) => (releaseFirst = resolve));
      return originalGet(id);
    });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "none" }),
    });
    await waitFor(() => expect(result.current.listStatus).toBe("ready"));

    let slowSelection: Promise<void>;
    act(() => {
      slowSelection = result.current.select(first.id);
    });
    await act(() => result.current.select(second.id));
    releaseFirst();
    await act(() => slowSelection!);

    expect(result.current.activeSession.id).toBe(second.id);
  });

  it("responds to external location changes", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(first.id));

    act(() => location.set(second.id));

    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
  });

  it("renames and removes sessions through the transport", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));

    await act(() => result.current.rename(first.id, "Renamed"));
    expect(result.current.sessions.find((item) => item.id === first.id)?.title).toBe(
      "Renamed",
    );
    await act(() => result.current.remove(first.id));

    expect(result.current.sessions.map((item) => item.id)).toEqual([second.id]);
    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
  });

  it("closes a restored subscription when unmounted", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    await transport.startRun({ sessionId: session.id, text: "Hi" });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result, unmount } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: new MemoryCopilotSessionLocation(session.id),
      }),
    });
    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    await waitFor(() => expect(subscribeRun).toHaveBeenCalled());
    const subscription = subscribeRun.mock.results[0].value;

    unmount();

    expect(subscription.closed).toBe(true);
  });
});
