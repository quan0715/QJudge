import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StickyTabs } from "./StickyTabs";

describe("StickyTabs", () => {
  it("reports the selected tab index", () => {
    const onChange = vi.fn();
    render(
      <StickyTabs
        items={[
          { key: "overview", label: "Overview" },
          { key: "submissions", label: "Submissions" },
        ]}
        selectedIndex={0}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Submissions" }));

    expect(onChange).toHaveBeenCalledWith(1);
  });
});
