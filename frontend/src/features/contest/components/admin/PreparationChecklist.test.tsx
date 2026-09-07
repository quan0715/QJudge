import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreparationChecklistItem } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import PreparationChecklist from "./PreparationChecklist";

const items: PreparationChecklistItem[] = [
  {
    key: "schedule",
    level: "blocking",
    title: "考試時間",
    description: "尚未設定，發布前必填",
    actionLabel: "設定時間",
  },
  {
    key: "problems",
    level: "done",
    title: "題目準備",
    description: "已設定 2 題",
    actionLabel: "前往題目管理",
  },
];

describe("PreparationChecklist", () => {
  it("renders one row per item with its description", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    expect(screen.getByText("考試時間")).toBeInTheDocument();
    expect(screen.getByText("尚未設定，發布前必填")).toBeInTheDocument();
    expect(screen.getByText("已設定 2 題")).toBeInTheDocument();
  });

  it("calls onItemAction with the item key", async () => {
    const onItemAction = vi.fn();
    render(<PreparationChecklist items={items} onItemAction={onItemAction} />);

    await userEvent.click(screen.getByRole("button", { name: "設定時間" }));

    expect(onItemAction).toHaveBeenCalledWith("schedule");
  });

  it("supports keyboard activation of the whole card", async () => {
    const onItemAction = vi.fn();
    render(<PreparationChecklist items={items} onItemAction={onItemAction} />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "設定時間" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onItemAction).toHaveBeenCalledWith("schedule");
  });

  it("marks blocking rows for assistive technology", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    expect(screen.getByText("考試時間").closest("li")).toHaveAttribute(
      "data-level",
      "blocking",
    );
  });

  it("labels each row with its readiness level", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    expect(screen.getByText("待完成")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  it("keeps the status on each card for visual state styling", () => {
    render(<PreparationChecklist items={items} onItemAction={vi.fn()} />);

    expect(screen.getByText("待完成").closest("[data-level]")).toHaveAttribute(
      "data-level",
      "blocking",
    );
    expect(screen.getByText("已完成").closest("[data-level]")).toHaveAttribute(
      "data-level",
      "done",
    );
  });
});
