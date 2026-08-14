import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopilotProvider } from "../react/CopilotProvider";
import { MemoryCopilotSessionLocation, MemoryCopilotTransport } from "../testing";
import { CopilotEmbedShell } from "./CopilotEmbedShell";
import { CopilotFullPageShell } from "./CopilotFullPageShell";
import { CopilotWorkspaceShell } from "./CopilotWorkspaceShell";

const copilotStyles = readFileSync("src/shared/copilot/ui/copilot.css", "utf8");

function cssRule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Copilot shells", () => {
  it("composes workspace panel chrome and supports disabled mode", () => {
    const transport = new MemoryCopilotTransport();
    const { rerender } = render(
      <CopilotProvider transport={transport} enabled={false}>
        <CopilotWorkspaceShell defaultOpen side="left"><main>Main</main></CopilotWorkspaceShell>
      </CopilotProvider>,
    );
    expect(screen.getByTestId("copilot-workspace")).toHaveAttribute("data-side", "left");
    expect(screen.getByTestId("copilot-panel")).toBeInTheDocument();
    rerender(<CopilotProvider transport={transport} enabled={false}><CopilotWorkspaceShell disabled><main>Main</main></CopilotWorkspaceShell></CopilotProvider>);
    expect(screen.queryByTestId("copilot-panel")).not.toBeInTheDocument();
  });

  it("supports full-page history modes and container-safe embed flags", () => {
    const transport = new MemoryCopilotTransport();
    render(
      <CopilotProvider transport={transport} sessionLocation={new MemoryCopilotSessionLocation()} enabled={false}>
        <CopilotFullPageShell history="sidebar" />
        <CopilotEmbedShell showHeader={false} showHistory={false} />
      </CopilotProvider>,
    );
    expect(screen.getByTestId("copilot-full-page")).toHaveAttribute("data-history", "sidebar");
    expect(screen.getByTestId("copilot-embed")).toHaveAttribute("data-container-safe", "true");
  });

  it("keeps the workspace main area inside the shell height", () => {
    const workspaceMainRule = copilotStyles.match(/\.copilot-workspace-main\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(workspaceMainRule).toContain("min-height: 0");
    expect(workspaceMainRule).toContain("overflow: hidden");
  });

  it("contains embed width at every shared shell boundary", () => {
    const root = cssRule(copilotStyles, ".copilot-root");
    const embed = cssRule(copilotStyles, ".copilot-embed");
    const body = cssRule(copilotStyles, ".copilot-panel-body");
    const conversation = cssRule(copilotStyles, ".copilot-conversation");

    expect(root).toContain("min-width: 0");
    expect(root).toContain("max-width: 100%");
    expect(embed).toContain("width: 100%");
    expect(embed).toContain("overflow: hidden");
    expect(body).toContain("min-width: 0");
    expect(body).toContain("overflow: hidden");
    expect(conversation).toContain("min-width: 0");
    expect(conversation).toContain("overflow: hidden");
  });
});
