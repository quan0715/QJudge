import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createMockContest } from "@/shared/mocks/contest.mock";
import { ContestSettingsOverlay } from "./AdminContestSettingsScreen";

const mocks = vi.hoisted(() => ({
  saveField: vi.fn(),
  debouncedSaveField: vi.fn(),
  confirm: vi.fn(),
  getExamPaper: vi.fn(),
}));

vi.mock("@/features/contest/contexts/ContestContext", () => ({
  useContest: () => ({
    contest: createMockContest({ startTime: "", endTime: "", contestType: "paper_exam", status: "draft" }),
    refreshContest: vi.fn(),
  }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  deleteContest: vi.fn(),
  getExamPaper: mocks.getExamPaper,
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
  useConfirmModal: () => ({ confirm: mocks.confirm, modalProps: {} }),
}));

vi.mock("@/features/contest/components/admin/settings", () => ({
  ContestSettingsModal: (props: {
    startMeridiem: string;
    onStartMeridiemChange: (value: string) => void;
    onConfirmedChange: (field: string, value: unknown, message: string) => void;
  }) => (
    <div>
      <output data-testid="start-meridiem">{props.startMeridiem}</output>
      <button type="button" onClick={() => props.onStartMeridiemChange("PM")}>PM</button>
      <button
        type="button"
        onClick={() => props.onConfirmedChange("status", "published", "Publish?")}
      >
        Publish
      </button>
    </div>
  ),
}));

const renderOverlay = () =>
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

describe("ContestSettingsOverlay", () => {
  it("keeps a selected meridiem even before a complete date-time can be saved", () => {
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "PM" }));

    expect(screen.getByTestId("start-meridiem")).toHaveTextContent("PM");
    expect(mocks.debouncedSaveField).not.toHaveBeenCalled();
  });

  it("warns about unset answers and placeholder questions before publishing", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.getExamPaper.mockResolvedValue({
      questions: [
        { questionType: "single_choice", prompt: "New question", options: ["Option A", "Option B"], correctAnswer: null, order: 0 },
        { questionType: "single_choice", prompt: "Capital?", options: ["Taipei", "Tainan"], correctAnswer: 0, order: 1 },
      ],
    });
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    const { body } = mocks.confirm.mock.calls[0][0] as { body: ReactNode };
    render(<>{body}</>);
    expect(screen.getByText(/settings\.publishCheck\.missingAnswer|第 1 題尚未設定正確答案|Question 1: no correct answer set/)).toBeInTheDocument();
    expect(screen.getByText(/settings\.publishCheck\.defaultContent|第 1 題仍是新增時的預設內容|Question 1: still has placeholder content/)).toBeInTheDocument();
    expect(mocks.saveField).toHaveBeenCalledWith("status", "published");
  });
});
