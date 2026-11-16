import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExamIconButton } from "./ExamIconButton";
describe("ExamIconButton", () => {
  it("preserves the accessible name and selected state", () => {
    const onClick = vi.fn();
    render(<ExamIconButton label="題目列表" aria-pressed onClick={onClick}><span aria-hidden>+</span></ExamIconButton>);
    const button = screen.getByRole("button", {name: "題目列表"});
    act(() => button.focus());
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("does not activate disabled actions", () => {
    const onClick = vi.fn();
    render(<ExamIconButton label="下一題" disabled onClick={onClick}><span aria-hidden>+</span></ExamIconButton>);
    fireEvent.click(screen.getByRole("button", {name:"下一題"}));
    expect(onClick).not.toHaveBeenCalled();
  });
});
