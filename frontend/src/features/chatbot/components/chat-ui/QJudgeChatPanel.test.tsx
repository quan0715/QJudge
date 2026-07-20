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
  sessionId: string,
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
