import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "@copilot/testing";
import {
  DefaultCopilotTranslations,
  useCopilot,
  useCopilotModels,
  useCopilotSessions,
} from "@copilot";
import { AiAssistantNavButton } from "@/features/app/components/workspace/AiAssistantNavButton";
import { useArtifactPanel } from "./ArtifactPanelContext";
import { useRequestCopilot } from "./CopilotDemandContext";
import {
  QJudgeCopilotBoundary,
  QJudgeCopilotProvider,
} from "./QJudgeCopilotProvider";
import * as chatbotFeature from "../index";
import {
  qJudgeCopilotModelCatalog,
  qJudgeCopilotTransport,
} from "@/infrastructure/copilot/qJudgeCopilotDependencies";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/features/app/contexts/WorkspaceContext";

const authState = vi.hoisted(() => ({
  user: null as { role: "student" | "teacher" | "admin" } | null,
}));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("../adapters/reactRouterCopilotSessionLocation", async () => {
  const { MemoryCopilotSessionLocation } = await import("@copilot/testing");
  const location = new MemoryCopilotSessionLocation();
  return { useReactRouterCopilotSessionLocation: () => location };
});

vi.mock("@/infrastructure/copilot/qJudgeCopilotDependencies", async () => {
  const {
    MemoryCopilotModelCatalog,
    MemoryCopilotStorage,
    MemoryCopilotTransport,
  } = await import("@copilot/testing");
  return {
    qJudgeCopilotTransport: new MemoryCopilotTransport(),
    qJudgeCopilotModelCatalog: new MemoryCopilotModelCatalog(),
    qJudgeCopilotStorage: new MemoryCopilotStorage(),
  };
});

function createQJudgeProviderWrapper(initialEntry = "/dashboard") {
  return function QJudgeProviderWrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <WorkspaceProvider>
          <QJudgeCopilotProvider>{children}</QJudgeCopilotProvider>
        </WorkspaceProvider>
      </MemoryRouter>
    );
  };
}

describe("QJudgeCopilotBoundary", () => {
  it("keeps a new account empty until the first message is sent", async () => {
    const transport = new MemoryCopilotTransport();
    const createSession = vi.spyOn(transport, "createSession");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QJudgeCopilotBoundary
        enabled
        transport={transport}
        location={new MemoryCopilotSessionLocation()}
        storage={new MemoryCopilotStorage()}
        translations={new DefaultCopilotTranslations()}
        modelCatalog={new MemoryCopilotModelCatalog()}
      >
        {children}
      </QJudgeCopilotBoundary>
    );

    const { result } = renderHook(() => useCopilotSessions(), { wrapper });
    await waitFor(() =>
      expect(result.current.activeSession.status).toBe("empty"),
    );
    expect(result.current.sessions).toHaveLength(0);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("composes one Artifact panel owner inside the Copilot runtime", async () => {
    const transport = new MemoryCopilotTransport();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QJudgeCopilotBoundary
        enabled
        transport={transport}
        location={new MemoryCopilotSessionLocation()}
        storage={new MemoryCopilotStorage()}
        translations={new DefaultCopilotTranslations()}
        modelCatalog={new MemoryCopilotModelCatalog()}
      >
        {children}
      </QJudgeCopilotBoundary>
    );

    const { result } = renderHook(
      () => ({ sessions: useCopilotSessions(), artifacts: useArtifactPanel() }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.sessions.activeSession.status).toBe("empty"),
    );
    expect(result.current.sessions.sessions).toHaveLength(0);
    expect(result.current.artifacts.isOpen).toBe(false);
  });

  it("keeps the model list empty when the server catalog fails", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QJudgeCopilotBoundary
        enabled
        transport={new MemoryCopilotTransport()}
        location={new MemoryCopilotSessionLocation()}
        storage={new MemoryCopilotStorage()}
        translations={new DefaultCopilotTranslations()}
        modelCatalog={{ list: vi.fn().mockRejectedValue(new Error("unavailable")) }}
      >
        {children}
      </QJudgeCopilotBoundary>
    );

    const { result } = renderHook(() => useCopilotModels(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.models).toEqual([]);
    expect(result.current.selectedModelId).toBeNull();
  });
});

describe("QJudgeCopilotProvider", () => {
  beforeEach(() => {
    authState.user = null;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the QJudge runtime disabled without an authenticated user", async () => {
    const wrapper = createQJudgeProviderWrapper();

    const { result } = renderHook(() => useCopilotSessions(), { wrapper });

    await act(async () => undefined);

    expect(result.current.listStatus).toBe("idle");
    expect(result.current.activeSession.status).toBe("empty");
    expect(result.current.sessions).toHaveLength(0);
  });

  it("does not bootstrap models or sessions for a student", async () => {
    authState.user = { role: "student" };
    const listModels = vi.spyOn(qJudgeCopilotModelCatalog, "list");
    const listSessions = vi.spyOn(qJudgeCopilotTransport, "listSessions");
    const wrapper = createQJudgeProviderWrapper();

    const { result } = renderHook(() => useCopilotSessions(), { wrapper });

    await act(async () => undefined);

    expect(result.current.listStatus).toBe("idle");
    expect(listModels).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
  });

  it.each(["teacher", "admin"] as const)(
    "waits to bootstrap the QJudge runtime until a %s opens Copilot",
    async (role) => {
      authState.user = { role };
      const listModels = vi.spyOn(qJudgeCopilotModelCatalog, "list");
      const listSessions = vi.spyOn(qJudgeCopilotTransport, "listSessions");
      const wrapper = createQJudgeProviderWrapper();

      const { result } = renderHook(
        () => ({ sessions: useCopilotSessions(), workspace: useWorkspace() }),
        { wrapper },
      );

      await act(async () => undefined);
      expect(result.current.sessions.listStatus).toBe("idle");
      expect(listModels).not.toHaveBeenCalled();
      expect(listSessions).not.toHaveBeenCalled();

      act(() => result.current.workspace.right.open());
      await waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(result.current.sessions.activeSession.status).toBe("empty");
        expect(result.current.sessions.sessions).toHaveLength(0);
      });
    },
  );

  it("bootstraps the QJudge runtime while a screen requests Copilot", async () => {
    authState.user = { role: "teacher" };
    const listModels = vi.spyOn(qJudgeCopilotModelCatalog, "list");
    const listSessions = vi.spyOn(qJudgeCopilotTransport, "listSessions");
    const wrapper = createQJudgeProviderWrapper();

    renderHook(
      () => {
        useRequestCopilot();
        return useCopilotSessions();
      },
      { wrapper },
    );

    await waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
  });

  it("suspends the runtime once the requesting screen unmounts", async () => {
    authState.user = { role: "teacher" };
    const listSessions = vi.spyOn(qJudgeCopilotTransport, "listSessions");
    const Wrapper = createQJudgeProviderWrapper();
    const probe: { listStatus: string | null } = { listStatus: null };
    function Requester() {
      useRequestCopilot();
      return null;
    }
    function Probe() {
      probe.listStatus = useCopilotSessions().listStatus;
      return null;
    }

    const view = render(
      <Wrapper>
        <Requester />
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));

    view.rerender(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    await waitFor(() => expect(probe.listStatus).toBe("idle"));
  });

  it("keeps monitoring a running session with the panel closed and releases it on completion", async () => {
    authState.user = { role: "teacher" };
    const transport = qJudgeCopilotTransport as MemoryCopilotTransport;
    const Wrapper = createQJudgeProviderWrapper();
    const { result } = renderHook(() => ({ copilot: useCopilot(), workspace: useWorkspace() }), {
      wrapper: ({ children }) => <Wrapper><AiAssistantNavButton />{children}</Wrapper>,
    });
    act(() => result.current.workspace.right.open());
    await waitFor(() => expect(result.current.copilot.activeSession.status).toBe("empty"));
    await act(async () => { await result.current.copilot.send({ text: "Test activity" }); });
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true"));
    const run = result.current.copilot.run.run!;
    act(() => result.current.workspace.right.close());
    expect(result.current.workspace.right.isOpen).toBe(false);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(result.current.copilot.activeSession.id).toBe(run.sessionId);

    act(() => transport.emit(run.id, {
      type: "run-status", runId: run.id, sessionId: run.sessionId,
      sequence: 1, status: "completed",
    }));
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false"));
    await waitFor(() => expect(result.current.copilot.activeSession.status).toBe("empty"));
  });

  it("is exported with its dependency-injected boundary", () => {
    expect(chatbotFeature.QJudgeCopilotProvider).toBe(QJudgeCopilotProvider);
    expect(chatbotFeature.QJudgeCopilotBoundary).toBe(QJudgeCopilotBoundary);
  });
});
