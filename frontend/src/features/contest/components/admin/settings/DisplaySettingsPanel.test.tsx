import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";
import DisplaySettingsPanel from "./DisplaySettingsPanel";

const props = () => ({
  t: stubT as ContestSettingsPanelProps["t"],
  tc: stubT as ContestSettingsPanelProps["tc"],
  contest: { ...createMockContest(), contestType: "paper_exam" as const },
  form: { expandQuestionNumbers: false },
  getState: () => undefined,
  onRetry: vi.fn(),
  onChange: vi.fn(),
  onConfirmedChange: vi.fn(),
});

describe("paper numbering setting", () => {
  it("changes one rule for the entire paper", () => {
    const p = props();
    render(<DisplaySettingsPanel {...p} />);
    fireEvent.change(screen.getByRole("combobox", { name: "題號" }), { target: { value: "expanded" } });
    expect(p.onChange).toHaveBeenCalledWith("expandQuestionNumbers", true);
  });
  it("keeps numbering fixed after students start", () => {
    const p = props();
    render(<DisplaySettingsPanel {...p} contest={{ ...p.contest, questionEditLocked: true }} />);
    expect(screen.getByRole("combobox", { name: "題號" })).toBeDisabled();
  });
  it("only offers paper numbering for paper exams", () => {
    const p = props();
    render(<DisplaySettingsPanel {...p} contest={{ ...p.contest, contestType: "coding" }} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
