import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ContestScoreboard from "./ContestScoreboard";

const problems = [{ id: "binding-1", problem_id: "21", title: "A+B", label: "A", order: 0 }];
const standings = [{ rank: 1, user: { id: 468, username: "Student" }, solved: 1, total_score: 100, time: 10,
  problems: { "binding-1": { status: "AC" as const, tries: 1, time: 10, pending: false, score: 100 } } }];

describe("scoreboard participant navigation", () => {
  it("keeps participant names left aligned without a full-width button", () => {
    render(<ContestScoreboard problems={problems} standings={standings} onSelectParticipant={vi.fn()} />);
    const name = screen.getByRole("button", { name: "Student" });
    expect(name).toHaveStyle({ width: "auto", padding: "0px", alignItems: "center" });
    expect(name.closest("td")).toHaveStyle({ textAlign: "left" });
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveStyle({ textAlign: "center" });
    expect(headers[1]).toHaveStyle({ textAlign: "left" });
    expect(headers[2]).toHaveStyle({ textAlign: "center" });
  });

  it.each([true, false])("colors the entire result cell without an inset (interactive=%s)", (interactive) => {
    render(<ContestScoreboard problems={problems} standings={standings} onSelectParticipant={interactive ? vi.fn() : undefined} />);
    const cell = screen.getByText("AC").closest("td");
    expect(cell).toHaveStyle({ padding: "0px", backgroundColor: "rgba(36, 161, 72, 0.2)" });
    if (interactive) expect(screen.getByRole("button", { name: /Student.*A/ })).toHaveStyle({ padding: "0px" });
  });

  it("opens a student or problem history using stable IDs, not rank", () => {
    const onSelectParticipant = vi.fn();
    render(<ContestScoreboard problems={problems} standings={standings} onSelectParticipant={onSelectParticipant} />);
    fireEvent.click(screen.getByRole("button", { name: "Student" }));
    expect(onSelectParticipant).toHaveBeenLastCalledWith("468");
    fireEvent.click(screen.getByRole("button", { name: /Student.*A/ }));
    expect(onSelectParticipant).toHaveBeenLastCalledWith("468", "21");
  });

  it("does not expose participant actions on the student scoreboard", () => {
    render(<ContestScoreboard problems={problems} standings={standings} />);
    expect(screen.queryByRole("button", { name: "Student" })).not.toBeInTheDocument();
  });
});
