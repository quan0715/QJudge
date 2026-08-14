import { act, renderHook, waitFor } from "@testing-library/react";
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
  useCopilotModels,
  useCopilotSessions,
} from "@copilot";
import { useArtifactPanel } from "./ArtifactPanelContext";
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
      expect(result.current.sessions.activeSession.status).toBe("empty");
      expect(result.current.sessions.sessions).toHaveLength(0);
    },
  );

  it.each([
    "/chat",
    "/classrooms/classroom-1/contest/contest-1/admin?panel=ai-grading",
  ])("bootstraps the QJudge runtime when route %s requires Copilot", async (route) => {
    authState.user = { role: "teacher" };
    const listModels = vi.spyOn(qJudgeCopilotModelCatalog, "list");
    const listSessions = vi.spyOn(qJudgeCopilotTransport, "listSessions");
    const wrapper = createQJudgeProviderWrapper(route);

    renderHook(() => useCopilotSessions(), { wrapper });

    await waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
  });

  it("is exported with its dependency-injected boundary", () => {
    expect(chatbotFeature.QJudgeCopilotProvider).toBe(QJudgeCopilotProvider);
    expect(chatbotFeature.QJudgeCopilotBoundary).toBe(QJudgeCopilotBoundary);
  });
});
