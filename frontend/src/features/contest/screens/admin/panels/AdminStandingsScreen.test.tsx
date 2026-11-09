import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({ location: { search: "" } }));

vi.mock("@/features/contest/screens/ContestStandingsScreen", () => ({
  default: ({ onSelectParticipant }: { onSelectParticipant: (userId: string, problemId?: string) => void }) => (
    <>
      <button type="button" onClick={() => onSelectParticipant("7", "p2")}>cell</button>
      <button type="button" onClick={() => onSelectParticipant("8")}>row</button>
    </>
  ),
}));

import AdminStandingsScreen from "./AdminStandingsScreen";

const LocationProbe = () => {
  mocks.location.search = useLocation().search;
  return null;
};

const renderStandings = () =>
  render(
    <MemoryRouter initialEntries={["/admin?panel=overview&tab=standings"]}>
      <AdminStandingsScreen contestId="c1" contest={null} embedded />
      <LocationProbe />
    </MemoryRouter>,
  );

describe("AdminStandingsScreen", () => {
  it("navigates a problem cell to the participants panel with user and problem", () => {
    renderStandings();
    fireEvent.click(screen.getByRole("button", { name: "cell" }));
    const params = new URLSearchParams(mocks.location.search);
    expect(params.get("panel")).toBe("participants");
    expect(params.get("user")).toBe("7");
    expect(params.get("problem")).toBe("p2");
    expect(params.has("tab")).toBe(false);
  });

  it("navigates a participant row without a problem", () => {
    renderStandings();
    fireEvent.click(screen.getByRole("button", { name: "row" }));
    const params = new URLSearchParams(mocks.location.search);
    expect(params.get("user")).toBe("8");
    expect(params.has("problem")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
