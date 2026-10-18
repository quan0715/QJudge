import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import { EditTestCasesPanel } from "./EditTestCasesPanel";

const mixedOrderCases: TestCaseItem[] = [
  {
    id: "custom-1",
    source: "custom",
    input: "custom input",
    output: "custom output",
  },
  {
    id: "sample-1",
    source: "public",
    isSample: true,
    input: "sample input",
    output: "sample output",
  },
];

function renderPanel() {
  const props = {
    testCases: mixedOrderCases,
    selectedCaseId: null,
    onSelectCase: vi.fn(),
    onAddTestCase: vi.fn(),
    onDeleteTestCase: vi.fn(),
    onUpdateTestCase: vi.fn(),
  };

  render(<EditTestCasesPanel {...props} />);
  return props;
}

describe("EditTestCasesPanel", () => {
  it("keeps the canonical sample/custom display order mapped to the correct case id", () => {
    const { onSelectCase } = renderPanel();

    fireEvent.click(screen.getByText("Sample 1"));

    expect(onSelectCase).toHaveBeenCalledWith("sample-1");
  });

  it("updates the selected custom case instead of the original array index", () => {
    const { onUpdateTestCase } = renderPanel();

    fireEvent.click(screen.getByText("Custom 1"));
    fireEvent.change(screen.getByPlaceholderText("輸入測試資料..."), {
      target: { value: "updated input" },
    });

    expect(onUpdateTestCase).toHaveBeenCalledWith(
      "custom-1",
      "updated input",
      "custom output",
    );
  });

  it("focuses the new case's input after it renders", () => {
    const onUpdateTestCase = vi.fn();
    const Harness = () => {
      const [testCases, setTestCases] = useState<TestCaseItem[]>(mixedOrderCases);
      const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
      return (
        <EditTestCasesPanel
          testCases={testCases}
          selectedCaseId={selectedCaseId}
          onSelectCase={setSelectedCaseId}
          onAddTestCase={(input, output) => setTestCases((previous) => [...previous, { id: "custom-new", source: "custom", input, output }])}
          onDeleteTestCase={vi.fn()}
          onUpdateTestCase={onUpdateTestCase}
        />
      );
    };
    render(<Harness />);

    fireEvent.click(screen.getByText("Custom 1"));
    screen.getByPlaceholderText("輸入測試資料...").focus();
    const add = screen.getByRole("button", { name: "新增測資" });
    add.focus();
    fireEvent.click(add);

    const input = screen.getByPlaceholderText("輸入測試資料...");
    expect(input).toHaveValue("");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "7" } });
    expect(onUpdateTestCase).toHaveBeenLastCalledWith("custom-new", "7", "");
  });
});
