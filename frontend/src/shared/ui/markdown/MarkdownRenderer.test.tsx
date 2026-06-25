import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import MarkdownRenderer from "./MarkdownRenderer";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg data-testid="mock-mermaid-svg" viewBox="0 0 100 40"></svg>',
  })),
}));

vi.mock("mermaid", () => ({
  default: mermaidMocks,
}));

describe("MarkdownRenderer", () => {
  beforeEach(() => {
    mermaidMocks.initialize.mockClear();
    mermaidMocks.render.mockClear();
  });

  it("keeps mermaid fences as code unless diagram rendering is enabled", () => {
    render(
      <MarkdownRenderer>
        {"```mermaid\nflowchart LR\n  A --> B\n```"}
      </MarkdownRenderer>,
    );

    expect(screen.getByText(/flowchart LR/)).toBeInTheDocument();
    expect(mermaidMocks.render).not.toHaveBeenCalled();
  });

  it("renders mermaid fences as diagrams when enabled", async () => {
    render(
      <MarkdownRenderer enableMermaid>
        {"```mermaid\nflowchart LR\n  A --> B\n```"}
      </MarkdownRenderer>,
    );

    await waitFor(() => {
      expect(mermaidMocks.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mermaid-/),
        "flowchart LR\n  A --> B",
      );
    });

    expect(await screen.findByTestId("mermaid-diagram")).toBeInTheDocument();
    expect(screen.getByTestId("mock-mermaid-svg")).toBeInTheDocument();
  });
});
