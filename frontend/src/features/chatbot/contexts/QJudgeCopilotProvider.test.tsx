import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "@copilot/testing";
import { DefaultCopilotTranslations, useCopilotSessions } from "@copilot";
import { useArtifactPanel } from "./ArtifactPanelContext";
import {
  QJudgeCopilotBoundary,
  QJudgeCopilotProvider,
} from "./QJudgeCopilotProvider";
import * as chatbotFeature from "../index";

const authState = vi.hoisted(() => ({ user: null as object | null }));

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
    QJUDGE_FALLBACK_MODELS: [],
  };
});

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
        fallbackModels={[]}
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
        fallbackModels={[]}
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
});

describe("QJudgeCopilotProvider", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("keeps the QJudge runtime disabled without an authenticated user", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QJudgeCopilotProvider>{children}</QJudgeCopilotProvider>
    );

    const { result } = renderHook(() => useCopilotSessions(), { wrapper });

    await act(async () => undefined);

    expect(result.current.listStatus).toBe("idle");
    expect(result.current.activeSession.status).toBe("empty");
    expect(result.current.sessions).toHaveLength(0);
  });

  it("enables the QJudge runtime for an authenticated user", async () => {
    authState.user = {};
    const wrapper = ({ children }: PropsWithChildren) => (
      <QJudgeCopilotProvider>{children}</QJudgeCopilotProvider>
    );

    const { result } = renderHook(() => useCopilotSessions(), { wrapper });

    await waitFor(() =>
      expect(result.current.activeSession.status).toBe("empty"),
    );
    expect(result.current.sessions).toHaveLength(0);
  });

  it("is exported with its dependency-injected boundary", () => {
    expect(chatbotFeature.QJudgeCopilotProvider).toBe(QJudgeCopilotProvider);
    expect(chatbotFeature.QJudgeCopilotBoundary).toBe(QJudgeCopilotBoundary);
  });
});
