import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExamShell } from "./ExamShell";

describe("ExamShell", () => {
  it("keeps the answer mounted when navigation collapses or tools open", () => {
    const surface = (collapsed: boolean, tools = false) => <ExamShell header="考試" navigation="題目" navigationCollapsed={collapsed} auxiliary={tools ? "公式表" : undefined}>
      <textarea aria-label="答案" defaultValue="" />
    </ExamShell>;
    const { rerender } = render(surface(false));
    const answer = screen.getByRole("textbox", { name: "答案" });
    fireEvent.change(answer, { target: { value: "推導過程" } });
    rerender(surface(true, true));
    expect(screen.getByRole("textbox", { name: "答案" })).toBe(answer);
    expect(answer).toHaveValue("推導過程");
    expect(screen.getByRole("complementary", { name: "題目導覽" })).toHaveAttribute("data-collapsed", "true");
    rerender(surface(false));
    expect(screen.getByRole("textbox", { name: "答案" })).toBe(answer);
    expect(screen.queryByRole("complementary", { name: "考試輔助工具" })).not.toBeInTheDocument();
  });
});
