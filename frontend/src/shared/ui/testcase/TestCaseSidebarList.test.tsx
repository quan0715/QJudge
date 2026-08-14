import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TestCaseSidebarList } from "./TestCaseSidebarList";

const groupedCases = {
  sample: [{ id: "sample-1", label: "Sample 1", isHidden: false }],
  custom: [{ id: "custom-1", label: "Custom 1" }],
};

describe("TestCaseSidebarList", () => {
  it("exposes case selection and add actions as buttons", () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(
      <TestCaseSidebarList
        selectedIndex={0}
        onSelect={onSelect}
        groupedCases={groupedCases}
        onAdd={onAdd}
        labels={{ addAction: "新增測資" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom 1" }));
    fireEvent.click(screen.getByRole("button", { name: "新增測資" }));

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
