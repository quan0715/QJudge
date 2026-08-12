import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import ContestSettingsModal from "./ContestSettingsModal";

vi.mock("@/shared/ui/modal/SettingsModal", () => ({
  SettingsModal: ({
    navItems,
    renderPanel,
  }: {
    navItems: Array<{ id: string; label: string }>;
    renderPanel: (activeId: string) => ReactNode;
  }) => (
    <div>
      {navItems.map((item) => <button key={item.id}>{item.label}</button>)}
      {renderPanel("integrity")}
    </div>
  ),
}));

vi.mock("@/features/contest/components/admin/IntegrityRunControlCard", () => ({
  default: ({ contestId, contestName }: { contestId: string; contestName: string }) => (
    <div data-testid="integrity-run-control" data-contest-id={contestId}>
      {contestName}
    </div>
  ),
}));

const contest = { ...createMockContest(), id: "contest-1", name: "Integrity exam" };
const t = stubT as ContestSettingsPanelProps["t"];
const tc = stubT as ContestSettingsPanelProps["tc"];

describe("ContestSettingsModal", () => {
  it("places Integrity Worker lifecycle controls in contest settings", () => {
    render(
      <ContestSettingsModal
        open
        onRequestClose={() => {}}
        t={t}
        tc={tc}
        contest={contest}
        form={{}}
        getState={() => undefined}
        onRetry={() => {}}
        onChange={() => {}}
        onConfirmedChange={() => {}}
        startDateInput={null}
        endDateInput={null}
        startTimeInput=""
        endTimeInput=""
        startMeridiem="AM"
        endMeridiem="AM"
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
        onStartTimeChange={() => {}}
        onEndTimeChange={() => {}}
        onStartMeridiemChange={() => {}}
        onEndMeridiemChange={() => {}}
        onArchive={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Integrity Worker" })).toBeVisible();
    expect(screen.getByTestId("integrity-run-control")).toHaveAttribute(
      "data-contest-id",
      "contest-1",
    );
  });
});
