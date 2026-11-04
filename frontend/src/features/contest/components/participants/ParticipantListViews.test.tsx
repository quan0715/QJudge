import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContestParticipant } from "@/core/entities/contest.entity";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }, values?: Record<string, unknown>) =>
      (typeof fallback === "string" ? fallback : fallback?.defaultValue ?? key).replace(
        /{{(\w+)}}/g,
        (_, name) => String(values?.[name] ?? ""),
      ),
  }),
}));

import ParticipantTable from "./ParticipantTable";
import ParticipantCardGallery from "./ParticipantCardGallery";
import ParticipantRail from "./ParticipantRail";

const p = (overrides: Partial<ContestParticipant>): ContestParticipant => ({
  userId: "0",
  username: "student",
  displayName: "Student",
  score: 0,
  joinedAt: "2026-11-03T09:00:00Z",
  examStatus: "in_progress",
  violationCount: 0,
  connectionStatus: "online",
  ...overrides,
});

describe("ParticipantTable", () => {
  it("hides the violations column when disabled and selects a row on click", () => {
    const onSelect = vi.fn();
    render(
      <ParticipantTable participants={[p({ userId: "7", displayName: "Amy" })]} showViolations={false} onSelect={onSelect} />,
    );
    expect(screen.queryByRole("columnheader", { name: /違規/ })).toBeNull();
    fireEvent.click(screen.getByRole("row", { name: /Amy/ }));
    expect(onSelect).toHaveBeenCalledWith("7");
  });

  it("shows violations and selects with the keyboard", () => {
    const onSelect = vi.fn();
    render(
      <ParticipantTable participants={[p({ userId: "8", displayName: "Ben", violationCount: 3 })]} showViolations onSelect={onSelect} />,
    );
    expect(screen.getByRole("columnheader", { name: /違規/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("row", { name: /Ben/ }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("8");
  });

  it("sorts by score when the score header is clicked", () => {
    render(
      <ParticipantTable
        participants={[p({ userId: "1", displayName: "Low", score: 10 }), p({ userId: "2", displayName: "High", score: 90 })]}
        showViolations={false}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /分數/ }));
    fireEvent.click(screen.getByRole("button", { name: /分數/ }));
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(names).toEqual(["High", "Low"]);
  });
});

describe("ParticipantCardGallery", () => {
  it("puts violators in the needs-attention group and selects on click", () => {
    const onSelect = vi.fn();
    render(
      <ParticipantCardGallery
        loading={false}
        onSelect={onSelect}
        participants={[p({ userId: "7", displayName: "Amy", violationCount: 1 }), p({ userId: "8", displayName: "Ben" })]}
      />,
    );
    const attention = screen.getByRole("region", { name: /需要處理/ });
    expect(within(attention).getByRole("button", { name: /Amy/ })).toBeInTheDocument();
    expect(within(attention).queryByRole("button", { name: /Ben/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ben/ }));
    expect(onSelect).toHaveBeenCalledWith("8");
  });

  it("shows an empty state without participants", () => {
    render(<ParticipantCardGallery loading={false} onSelect={vi.fn()} participants={[]} />);
    expect(screen.getByText("目前沒有考生")).toBeInTheDocument();
  });
});

describe("ParticipantRail", () => {
  it("marks the selected participant and selects another", () => {
    const onSelect = vi.fn();
    render(
      <ParticipantRail
        selectedUserId="7"
        onSelect={onSelect}
        participants={[p({ userId: "7", displayName: "Amy" }), p({ userId: "8", displayName: "Ben", violationCount: 2 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Amy/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Ben/ })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: /Ben/ }));
    expect(onSelect).toHaveBeenCalledWith("8");
  });
});
