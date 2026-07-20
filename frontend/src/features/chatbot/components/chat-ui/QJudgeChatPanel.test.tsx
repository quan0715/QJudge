import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { ArtifactPanelProvider } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { QJudgeCopilotBoundary } from "@/features/chatbot/contexts/QJudgeCopilotProvider";

import { QJudgeChatPanel } from "./QJudgeChatPanel";
import { qJudgeCopilotSlots } from "./qJudgeCopilotSlots";

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
) =>
  render(
    <QJudgeCopilotBoundary
      enabled
      transport={transport}
      location={new MemoryCopilotSessionLocation(sessionId)}
      storage={new MemoryCopilotStorage()}
      translations={new DefaultCopilotTranslations()}
      modelCatalog={modelCatalog}
      fallbackModels={[]}
    >
      <ArtifactPanelProvider sessionId={sessionId}>
        {panel}
      </ArtifactPanelProvider>
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
        <ArtifactPanelProvider sessionId={session.id}>
          <QJudgeChatPanel mode="sidebar" />
        </ArtifactPanelProvider>
      </QJudgeCopilotBoundary>,
    );

    expect(await screen.findByTestId("copilot-embed")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message|輸入/i })).toBeInTheDocument();
  });
});
