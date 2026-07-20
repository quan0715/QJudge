import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/infrastructure/api/repositories/artifact.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/infrastructure/api/repositories/artifact.repository")
    >()),
    listArtifacts: vi.fn(),
  }),
);

import { DefaultCopilotTranslations, useCopilotSessions } from "@copilot";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "@copilot/testing";
import { listArtifacts } from "@/infrastructure/api/repositories/artifact.repository";
import { useArtifactPanel } from "./ArtifactPanelContext";
import { QJudgeCopilotBoundary } from "./QJudgeCopilotProvider";

function withCompletedArtifact(
  transport: MemoryCopilotTransport,
  completedSessionId: string,
) {
  const getSession = transport.getSession.bind(transport);
  vi.spyOn(transport, "getSession").mockImplementation(async (id, options) => {
    const session = await getSession(id, options);
    if (id !== completedSessionId) return session;
    return {
      ...session,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          parts: [
            {
              type: "tool",
              toolCallId: "artifact-tool-1",
              toolName: "artifact_write",
              state: "output-ready",
              output: { ok: true },
            },
          ],
        },
      ],
    };
  });
}

function createWrapper(
  transport: MemoryCopilotTransport,
  location: MemoryCopilotSessionLocation,
) {
  return ({ children }: PropsWithChildren) => (
    <QJudgeCopilotBoundary
      enabled
      transport={transport}
      location={location}
      storage={new MemoryCopilotStorage()}
      translations={new DefaultCopilotTranslations()}
      modelCatalog={new MemoryCopilotModelCatalog()}
      fallbackModels={[]}
    >
      {children}
    </QJudgeCopilotBoundary>
  );
}

describe("ArtifactPanelProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listArtifacts).mockResolvedValue([]);
  });

  it("refreshes artifacts after a completed artifact tool part loads", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    withCompletedArtifact(transport, session.id);

    renderHook(() => useArtifactPanel(), {
      wrapper: createWrapper(
        transport,
        new MemoryCopilotSessionLocation(session.id),
      ),
    });

    await waitFor(
      () => expect(listArtifacts).toHaveBeenCalledTimes(2),
      { timeout: 1_000 },
    );
    expect(listArtifacts).toHaveBeenLastCalledWith({ sessionId: session.id });
  });

  it("does not refresh twice for the same completed tool call", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    withCompletedArtifact(transport, session.id);
    const { result } = renderHook(
      () => ({ artifacts: useArtifactPanel(), sessions: useCopilotSessions() }),
      {
        wrapper: createWrapper(
          transport,
          new MemoryCopilotSessionLocation(session.id),
        ),
      },
    );

    await waitFor(() => expect(listArtifacts).toHaveBeenCalledTimes(2), {
      timeout: 1_000,
    });
    await act(async () => result.current.sessions.select(session.id));
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(listArtifacts).toHaveBeenCalledTimes(2);
  });

  it("cancels a stale completed-tool refresh when the session changes", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession();
    const second = await transport.createSession();
    withCompletedArtifact(transport, first.id);
    const { result } = renderHook(
      () => ({ artifacts: useArtifactPanel(), sessions: useCopilotSessions() }),
      {
        wrapper: createWrapper(
          transport,
          new MemoryCopilotSessionLocation(first.id),
        ),
      },
    );

    await waitFor(() =>
      expect(result.current.sessions.activeSession.status).toBe("ready"),
    );
    await act(async () => result.current.sessions.select(second.id));
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(vi.mocked(listArtifacts).mock.calls).toEqual([
      [{ sessionId: first.id }],
      [{ sessionId: second.id }],
    ]);
  });
});
