import { existsSync, readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DefaultCopilotTranslations,
  type CopilotUISlots,
} from "@copilot";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "@copilot/testing";
import { QJudgeCopilotBoundary } from "@/features/chatbot/contexts/QJudgeCopilotProvider";

import { QJudgeChatPanel } from "./QJudgeChatPanel";
import { qJudgeCopilotSlots } from "./qJudgeCopilotSlots";
import appSource from "@/App.tsx?raw";
import chatFullPageSource from "../ChatFullPage.tsx?raw";
import workspaceShellSource from "../workspace/WorkspaceShell.tsx?raw";

const chatContainerStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/ChatContainer.module.scss",
  "utf8",
);
const artifactContextSource = readFileSync(
  "src/features/chatbot/contexts/ArtifactPanelContext.tsx",
  "utf8",
);
const qJudgeTransportSource = readFileSync(
  "src/infrastructure/copilot/qJudgeCopilotTransport.ts",
  "utf8",
);
const messageListStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/MessageList.module.scss",
  "utf8",
);
const messageBubbleStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/MessageBubble.module.scss",
  "utf8",
);
const composerStyles = readFileSync(
  "src/features/chatbot/components/chat-ui/ComposerBar.module.scss",
  "utf8",
);
const chatFullPageStyles = readFileSync(
  "src/features/chatbot/components/ChatFullPage.module.scss",
  "utf8",
);

function scssRule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? "";
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

vi.mock(
  "@/infrastructure/api/repositories/artifact.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/infrastructure/api/repositories/artifact.repository")
    >()),
    listArtifacts: vi.fn().mockResolvedValue([]),
  }),
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
});

const renderPanel = (
  transport: MemoryCopilotTransport,
  sessionId: string | null,
  panel: ReactNode,
  modelCatalog = new MemoryCopilotModelCatalog(),
  location = new MemoryCopilotSessionLocation(sessionId),
) =>
  render(
    <QJudgeCopilotBoundary
      enabled
      transport={transport}
      location={location}
      storage={new MemoryCopilotStorage()}
      translations={new DefaultCopilotTranslations()}
      modelCatalog={modelCatalog}
      fallbackModels={[]}
    >
      {panel}
    </QJudgeCopilotBoundary>,
  );

describe("QJudgeChatPanel", () => {
  it("contains no retired feature compatibility leftovers", () => {
    expect(
      existsSync("src/features/chatbot/hooks/useChatScrollToBottom.ts"),
    ).toBe(false);
    expect(artifactContextSource).not.toContain("@deprecated");
    expect(artifactContextSource).not.toContain("sessionId?:");
    for (const selector of [
      ".splitRow",
      ".chatBody",
      ".messagesArea",
      ".composerFloat",
      ".loading",
    ]) {
      expect(chatContainerStyles).not.toContain(selector);
    }
    expect(qJudgeTransportSource).not.toContain("legacyRuns");
  });

  it("keeps padded chat content inside an embedded panel", () => {
    const container = scssRule(chatContainerStyles, ".container");
    const chatOnlyRow = scssRule(chatContainerStyles, ".chatOnlyRow");
    const wrapper = scssRule(messageListStyles, ".wrapper");
    const skeletonContent = scssRule(messageListStyles, ".skeletonContent");
    const composer = scssRule(composerStyles, ".bar");

    expect(container).toContain("min-width: 0");
    expect(container).toContain("max-width: 100%");
    expect(chatOnlyRow).toContain("min-width: 0");
    expect(chatOnlyRow).toContain("overflow: hidden");
    expect(wrapper).toContain("min-width: 0");
    expect(wrapper).toContain("max-width: 100%");
    expect(messageListStyles).toContain("box-sizing: border-box");
    expect(skeletonContent).toContain("min-width: 0");
    expect(skeletonContent).not.toContain("min-width: 10rem");
    expect(messageBubbleStyles).toContain("overflow-wrap: anywhere");
    expect(messageBubbleStyles).toContain("overflow-x: auto");
    expect(composer).toContain("min-width: 0");
    expect(composer).toContain("box-sizing: border-box");
  });

  it("keeps full-page width and scroll overrides scoped to the full-page shell", () => {
    const container = scssRule(chatContainerStyles, ".container");
    const fullPage = scssRule(chatFullPageStyles, ".fullPage");
    const fullPageMessageItems = scssRule(
      messageListStyles,
      ":global(.copilot-full-page) .list > *",
    );
    const fullPageAssistantContent = scssRule(
      messageBubbleStyles,
      ":global(.copilot-full-page) .ai .content",
    );
    const fullPageComposer = scssRule(
      composerStyles,
      ":global(.copilot-full-page) .bar",
    );

    expect(container).toContain("min-height: 0");
    expect(container).toContain("overflow: hidden");
    expect(fullPage).toContain("min-height: 0");
    expect(fullPage).toContain("overflow: hidden");
    expect(messageListStyles).toContain("$chat-content-max-width");
    expect(messageBubbleStyles).toContain("max-width: min(95%, 860px)");
    expect(fullPageMessageItems).toContain("max-width: 100%");
    expect(fullPageAssistantContent).toContain("width: 100%");
    expect(fullPageAssistantContent).toContain("max-width: 100%");
    expect(fullPageComposer).toContain("max-width: 100%");
  });

  it("shows message and title skeletons while session bootstrap is pending", async () => {
    const transport = new MemoryCopilotTransport();
    const pendingList = deferred<Awaited<ReturnType<typeof transport.listSessions>>>();
    vi.spyOn(transport, "listSessions").mockReturnValueOnce(pendingList.promise);
    const { container } = renderPanel(
      transport,
      null,
      <QJudgeChatPanel mode="sidebar" />,
    );

    expect(screen.getByTestId("chat-title-skeleton")).toBeInTheDocument();
    expect(
      container.querySelector('[class*="skeletonStack"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/welcome|歡迎/i)).not.toBeInTheDocument();

    await act(async () => {
      pendingList.resolve([]);
      await pendingList.promise;
    });
    await waitFor(() =>
      expect(screen.queryByTestId("chat-title-skeleton")).not.toBeInTheDocument(),
    );
  });

  it("keeps the skeleton visible while a located session is loading after refresh", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Loaded chat" });
    const pendingSession = deferred<
      Awaited<ReturnType<typeof transport.getSession>>
    >();
    const originalGetSession = transport.getSession.bind(transport);
    const getSession = vi
      .spyOn(transport, "getSession")
      .mockImplementation((id, options) =>
        id === session.id
          ? pendingSession.promise
          : originalGetSession(id, options),
      );
    const location = new MemoryCopilotSessionLocation(session.id);
    const { container } = renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="full" />,
      new MemoryCopilotModelCatalog(),
      location,
    );

    await waitFor(() =>
      expect(getSession).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(screen.getByTestId("chat-title-skeleton")).toBeInTheDocument();
    expect(
      container.querySelector('[class*="skeletonStack"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/welcome|歡迎/i)).not.toBeInTheDocument();

    await act(async () => {
      pendingSession.resolve(session);
      await pendingSession.promise;
    });
    await waitFor(() =>
      expect(screen.queryByTestId("chat-title-skeleton")).not.toBeInTheDocument(),
    );
  });

  it("does not create from the new-task button and creates on first send", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const createSession = vi.spyOn(transport, "createSession");
    const startRun = vi.spyOn(transport, "startRun");
    const location = new MemoryCopilotSessionLocation(existing.id);
    const { container } = renderPanel(
      transport,
      existing.id,
      <QJudgeChatPanel mode="full" />,
      new MemoryCopilotModelCatalog(),
      location,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /addComment|新增/i }),
    );
    expect(createSession).not.toHaveBeenCalled();
    await waitFor(() => expect(location.get()).toBeNull());
    expect(
      container.querySelector('input[class*="renameInput"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ui.newTask" })).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: /message|輸入/i });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "First embedded message" } });
    fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({ text: "First embedded message" }),
      ),
    );
  });

  it("sends a message through the full-page Copilot panel", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    renderPanel(transport, session.id, <QJudgeChatPanel mode="full" />);

    const input = await screen.findByRole("textbox", { name: /message|輸入/i });
    expect(screen.getByRole("button", { name: /new|新增/i })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));

    await waitFor(() =>
      expect(transport.getActiveRun(session.id)).resolves.not.toBeNull(),
    );
  });

  it("closes the sidebar through the header slot", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const onClose = vi.fn();
    renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="sidebar" onClose={onClose} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /close|關閉/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects and manages existing sessions from the sidebar header", async () => {
    const transport = new MemoryCopilotTransport();
    const earlier = await transport.createSession({ title: "Earlier chat" });
    const current = await transport.createSession({ title: "Current chat" });
    const location = new MemoryCopilotSessionLocation(current.id);
    renderPanel(
      transport,
      current.id,
      <QJudgeChatPanel mode="sidebar" />,
      new MemoryCopilotModelCatalog(),
      location,
    );

    const sessionMenu = await screen.findByRole("button", {
      name: "Current chat",
    });
    fireEvent.click(sessionMenu);
    fireEvent.click(screen.getByRole("option", { name: /Earlier chat/ }));

    await waitFor(() => expect(location.get()).toBe(earlier.id));
    fireEvent.click(
      screen.getByRole("button", { name: /moreOptions|更多|選項/i }),
    );
    expect(
      await screen.findByText(/ui\.rename|rename|重新命名/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ui\.delete|delete|刪除/i),
    ).toBeInTheDocument();
  });

  it("controls model selection and pending attachments through Copilot hooks", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const catalog = new MemoryCopilotModelCatalog([
      { id: "fast", displayName: "Fast model", isDefault: true },
      { id: "deep", displayName: "Deep model" },
    ]);
    const { container } = renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="sidebar" />,
      catalog,
    );

    const modelButton = await screen.findByRole("button", {
      name: /model|模型/i,
    });
    await waitFor(() => expect(modelButton).toHaveTextContent("Fast model"));
    fireEvent.click(modelButton);
    fireEvent.click(screen.getByRole("option", { name: "Deep model" }));
    expect(modelButton).toHaveTextContent("Deep model");

    const file = new File(["row,value"], "grade.csv", { type: "text/csv" });
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [file] } });
    expect(await screen.findByText("grade.csv")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /removeAttachment|移除附件/i }),
    );
    expect(screen.queryByText("grade.csv")).not.toBeInTheDocument();
  });

  it("locks general composer controls while an approval is pending", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="sidebar" />,
      new MemoryCopilotModelCatalog([
        { id: "fast", displayName: "Fast model", isDefault: true },
      ]),
    );

    const input = await screen.findByRole("textbox", { name: /message|輸入/i });
    fireEvent.change(input, { target: { value: "Change it" } });
    fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));
    let run = null;
    await waitFor(async () => {
      run = await transport.getActiveRun(session.id);
      expect(run).not.toBeNull();
    });
    act(() => {
      transport.emit(run!.id, {
        type: "awaiting-approval",
        runId: run!.id,
        sessionId: session.id,
        sequence: 1,
        request: {
          actions: [{ name: "write" }],
          allowedDecisions: ["approve", "reject"],
        },
      });
    });

    await waitFor(() => expect(input).toBeDisabled());
    expect(
      screen.getByRole("button", { name: /addAttachment|新增附件/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /model|模型/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /send|送出/i }),
    ).toBeDisabled();
  });

  it("locks the full composer while its captured request is sending", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const uploadResult = deferred<{
      type: "attachment";
      id: string;
      name: string;
    }>();
    vi.spyOn(transport, "uploadAttachment").mockReturnValue(uploadResult.promise);
    const { container } = renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="sidebar" />,
      new MemoryCopilotModelCatalog([
        { id: "fast", displayName: "Fast model", isDefault: true },
      ]),
    );
    const input = await screen.findByRole("textbox", { name: /message|輸入/i });
    fireEvent.change(input, { target: { value: "Grade it" } });
    const file = new File(["row,value"], "grade.csv", { type: "text/csv" });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput!, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /send|送出/i }));

    await waitFor(() => expect(input).toBeDisabled());
    expect(screen.getByRole("button", { name: /model|模型/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /addAttachment|新增附件/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /removeAttachment|移除附件/i }),
    ).toBeDisabled();

    await act(async () => {
      uploadResult.resolve({
        type: "attachment",
        id: "attachment-1",
        name: file.name,
      });
    });
    await waitFor(() => expect(input).toBeEnabled());
  });

  it("exports one stable component for every public panel slot", () => {
    const keys = Object.keys(qJudgeCopilotSlots).sort();
    const expected = [
      "approval",
      "composer",
      "emptyState",
      "errorState",
      "header",
      "history",
      "message",
      "messageList",
      "question",
      "suggestions",
    ] satisfies Array<keyof CopilotUISlots>;

    expect(keys).toEqual(expected.sort());
    expect(Object.values(qJudgeCopilotSlots).every(Boolean)).toBe(true);
  });

  it("routes both modes through shells without a children bypass", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const { rerender } = renderPanel(
      transport,
      session.id,
      <QJudgeChatPanel mode="full" />,
    );

    expect(await screen.findByTestId("copilot-full-page")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message|輸入/i })).toBeInTheDocument();

    rerender(
      <QJudgeCopilotBoundary
        enabled
        transport={transport}
        location={new MemoryCopilotSessionLocation(session.id)}
        storage={new MemoryCopilotStorage()}
        translations={new DefaultCopilotTranslations()}
        modelCatalog={new MemoryCopilotModelCatalog()}
        fallbackModels={[]}
      >
        <QJudgeChatPanel mode="sidebar" />
      </QJudgeCopilotBoundary>,
    );

    expect(await screen.findByTestId("copilot-embed")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message|輸入/i })).toBeInTheDocument();
  });

  it("mounts one production runtime and routes every QJudge chat surface through the panel", () => {
    expect(appSource).toContain("<QJudgeCopilotProvider>");
    expect(appSource).not.toContain("ChatbotProvider");

    expect(chatFullPageSource).toContain('<QJudgeChatPanel mode="full"');
    expect(chatFullPageSource).not.toContain("ChatContainer");
    expect(chatFullPageSource).not.toContain("CopilotFullPageShell");

    expect(workspaceShellSource.match(/<QJudgeChatPanel mode="sidebar"/g)).toHaveLength(2);
    expect(workspaceShellSource).not.toContain("ChatContainer");
    expect(workspaceShellSource).not.toContain("CopilotWorkspaceShell");
  });
});
