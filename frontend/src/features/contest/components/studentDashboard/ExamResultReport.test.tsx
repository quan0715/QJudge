import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExamResultReport, type ExamResultTile } from "./ExamResultReport";

const tiles: ExamResultTile[] = [
  { key: "q1", label: "1", state: "full", detail: "20 / 20 分" },
  { key: "q2", label: "2", state: "zero", detail: "0 / 20 分" },
  { key: "q3", label: "3", state: "unanswered", detail: "未作答" },
];
const format = (value: number) => String(Math.round(value * 100) / 100);

describe("ExamResultReport", () => {
  it("names every question's result and opens the details", () => {
    const onOpenDetails = vi.fn();
    render(<ExamResultReport tiles={tiles} onOpenDetails={onOpenDetails} formatScore={format} />);
    expect(screen.getByText("第 2 題，0 / 20 分")).toBeInTheDocument();
    expect(screen.getByText("第 3 題，未作答")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看詳情" }));
    expect(onOpenDetails).toHaveBeenCalled();
  });

  it("marks the student's band and compares with the class average when it is shared", () => {
    const distribution = [0, 0, 0, 0, 1, 2, 3, 1, 0, 0];
    render(<ExamResultReport tiles={tiles} formatScore={format} classStanding={{ average: 56, max: 100, score: 72, distribution }} />);
    expect(screen.getByText("高於平均 16 分")).toBeInTheDocument();
    expect(screen.getByText(/70–79%，1 人，你在這裡/)).toBeInTheDocument();
  });

  it("stands on its own when the class average is kept private", () => {
    render(<ExamResultReport tiles={tiles} formatScore={format} />);
    expect(screen.queryByRole("heading", { name: "班級表現" })).not.toBeInTheDocument();
    expect(screen.queryByText("班平均")).not.toBeInTheDocument();
  });
});
