import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentBlank } from "@carbon/icons-react";
import { SolverLayout } from "./SolverLayout";
const props = {
  statementTitle: "Question",
  statementTabs: [{ id: "question", label: "Question", icon: DocumentBlank }],
  renderStatementContent: () => <p>Read this question</p>,
  editorPanel: <textarea aria-label="Answer" defaultValue="draft" />,
};
describe("SolverLayout answer workspaces", () => {
  it("omits results for paper answers and preserves the editor when the statement is collapsed", () => {
    const { container } = render(<SolverLayout {...props} />);
    expect(container.querySelector(".solver-layout__result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "workspaceTopNav.closeInfoPanel" }));
    expect(screen.queryByText("Read this question")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Answer" })).toHaveValue("draft");
    fireEvent.click(screen.getByRole("button", { name: "Question" }));
    expect(screen.getByText("Read this question")).toBeInTheDocument();
  });
  it("keeps exam questions visible even when a stale collapsed state is supplied", () => {
    render(<SolverLayout {...props} allowStatementCollapse={false} statementCollapsed />);
    expect(screen.getByText("Read this question")).toBeVisible();
    expect(screen.queryByRole("button", { name: "workspaceTopNav.closeInfoPanel" })).not.toBeInTheDocument();
  });
  it("keeps coding results when provided", () => {
    const { container } = render(<SolverLayout {...props} resultPanel={<p>Test results</p>} />);
    expect(screen.getByText("Test results")).toBeInTheDocument();
    const separator = screen.getByRole("separator");
    Object.defineProperty(container.firstElementChild, "clientWidth", { value: 1000 });
    const width = Number(separator.getAttribute("aria-valuenow"));
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(width);
  });
});
