import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createMockContest } from "@/shared/mocks/contest.mock";
import { ContestSettingsOverlay } from "./AdminContestSettingsScreen";

const mocks = vi.hoisted(() => ({
  saveField: vi.fn(),
  debouncedSaveField: vi.fn(),
}));

vi.mock("@/features/contest/contexts/ContestContext", () => ({
  useContest: () => ({
    contest: createMockContest({ startTime: "", endTime: "" }),
    refreshContest: vi.fn(),
  }),
}));

vi.mock("@/features/contest/components/admin/examEditor/hooks/useExamAutoSave", () => ({
  useExamAutoSave: () => ({
    fieldStates: {},
    retrySave: vi.fn(),
    saveField: mocks.saveField,
    debouncedSaveField: mocks.debouncedSaveField,
  }),
}));

vi.mock("@/shared/ui/modal", () => ({
  ConfirmModal: () => null,
  useConfirmModal: () => ({ confirm: vi.fn(), modalProps: {} }),
}));

vi.mock("@/features/contest/components/admin/settings", () => ({
  ContestSettingsModal: (props: {
    startMeridiem: string;
    onStartMeridiemChange: (value: string) => void;
  }) => (
    <div>
      <output data-testid="start-meridiem">{props.startMeridiem}</output>
      <button type="button" onClick={() => props.onStartMeridiemChange("PM")}>PM</button>
    </div>
  ),
}));

describe("ContestSettingsOverlay", () => {
  it("keeps a selected meridiem even before a complete date-time can be saved", () => {
    render(
      <MemoryRouter initialEntries={["/contests/contest-001/settings"]}>
        <Routes>
          <Route
            path="/contests/:contestId/settings"
            element={<ContestSettingsOverlay open onClose={vi.fn()} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "PM" }));

    expect(screen.getByTestId("start-meridiem")).toHaveTextContent("PM");
    expect(mocks.debouncedSaveField).not.toHaveBeenCalled();
  });
});
