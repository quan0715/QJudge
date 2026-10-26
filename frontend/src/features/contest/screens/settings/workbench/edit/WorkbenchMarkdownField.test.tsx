import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkbenchMarkdownField from "./WorkbenchMarkdownField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, string>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => values?.[key] ?? ""),
  }),
}));
vi.mock("@/shared/ui/markdown/markdownEditor", () => ({
  MarkdownField: ({ value, onChange, labelText, showPreview }: {
    value: string; onChange(value: string): void; labelText: string; showPreview: boolean;
  }) => <>
    {showPreview && <span>Nested preview tabs</span>}
    <textarea aria-label={labelText} value={value} onChange={(event) => onChange(event.target.value)} />
  </>,
}));

describe("Markdown source switching", () => {
  it("shows formatted content immediately and preserves changes when toggling source", () => {
    function Field() {
      const [value, setValue] = useState("**Original answer**");
      return <WorkbenchMarkdownField id="answer" labelText="詳解" value={value} onChange={setValue} />;
    }
    render(<Field />);
    expect(screen.getByText("Original answer").tagName).toBe("STRONG");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByText("Original answer"));
    expect(screen.queryByText("Nested preview tabs")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "詳解" }), { target: { value: "**Changed answer**" } });
    fireEvent.click(screen.getByRole("button", { name: "顯示排版：詳解" }));
    expect(screen.getByText("Changed answer").tagName).toBe("STRONG");
    fireEvent.keyDown(screen.getAllByRole("button", { name: "編輯文字：詳解" })[1], { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "詳解" })).toHaveValue("**Changed answer**");
  });
  it("renders locked content without an editing action", () => {
    render(<WorkbenchMarkdownField id="stem" labelText="題幹" value="Locked stem" onChange={vi.fn()} disabled />);
    expect(screen.getByText("Locked stem")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
