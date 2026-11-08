import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HandInCheck } from "./HandInCheck";
import type { ExamResultTile } from "./ExamAnswerTiles";

const tiles: ExamResultTile[] = [
  { key: "q1", label: "1", state: "answered", detail: "已作答" },
  { key: "q2", label: "2", state: "unanswered", detail: "未作答", marked: true },
  { key: "q3", label: "3", state: "unanswered", detail: "未作答" },
];

describe("HandInCheck", () => {
  it("says what is still open and names marked questions", () => {
    render(<HandInCheck tiles={tiles} />);
    expect(screen.getByText("還有 2 題未作答")).toBeInTheDocument();
    expect(screen.getByText("1 題已標記")).toBeInTheDocument();
    expect(screen.getByText("第 2 題，未作答，已標記")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("jumps to a question when its tile is chosen", () => {
    const onSelect = vi.fn();
    render(<HandInCheck tiles={tiles} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "第 3 題，未作答" }));
    expect(onSelect).toHaveBeenCalledWith("q3");
  });
});
