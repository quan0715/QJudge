import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  DashboardToolbar,
} from "./index";

function renderTabs(active: string, onChange = vi.fn()) {
  render(
    <DashboardTabs activeId={active} onChange={onChange}>
      <DashboardTabBar
        tabs={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
        toolbar={
          <DashboardToolbar>
            <DashboardToolbar.Search
              value=""
              onChange={() => undefined}
              placeholder="search"
            />
          </DashboardToolbar>
        }
      />
      <DashboardTabPanel tabId="a">PANEL_A</DashboardTabPanel>
      <DashboardTabPanel tabId="b">PANEL_B</DashboardTabPanel>
    </DashboardTabs>,
  );
  return { onChange };
}

describe("Dashboard tabs", () => {
  it("only renders active panel", () => {
    renderTabs("a");
    expect(screen.getByText("PANEL_A")).toBeInTheDocument();
    expect(screen.queryByText("PANEL_B")).not.toBeInTheDocument();
  });

  it("renders toolbar slot", () => {
    renderTabs("a");
    expect(screen.getByPlaceholderText("search")).toBeInTheDocument();
  });

  it("fires onChange when clicking another tab", () => {
    const { onChange } = renderTabs("a");
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("switches panel when active id changes", () => {
    renderTabs("b");
    expect(screen.queryByText("PANEL_A")).not.toBeInTheDocument();
    expect(screen.getByText("PANEL_B")).toBeInTheDocument();
  });
});
