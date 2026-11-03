import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import type { ParticipantActions } from "@/features/contest/hooks/useParticipantActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }, values?: Record<string, unknown>) =>
      (typeof fallback === "string" ? fallback : fallback?.defaultValue ?? key).replace(
        /{{(\w+)}}/g,
        (_, name) => String(values?.[name] ?? ""),
      ),
  }),
}));

import ParticipantSummaryHeader from "./ParticipantSummaryHeader";

const actions = (): ParticipantActions => ({
  busy: false,
  unlock: vi.fn().mockResolvedValue(undefined),
  reopen: vi.fn().mockResolvedValue(undefined),
  resetExamRecord: vi.fn().mockResolvedValue(undefined),
  lock: vi.fn().mockResolvedValue(true),
  updateStatus: vi.fn().mockResolvedValue(true),
  downloadReport: vi.fn().mockResolvedValue(undefined),
  startAssistedAttendance: vi.fn(),
  confirmModalProps: { open: false } as ParticipantActions["confirmModalProps"],
});

const dashboard = (
  examStatus: string,
  flags: Partial<ParticipantDashboard["actions"]> = {},
  participant: Record<string, unknown> = {},
) =>
  ({
    contestType: "paper_exam",
    participant: { userId: "7", username: "s7", displayName: "Amy", examStatus, violationCount: 0, ...participant },
    overview: { totalScore: 10, maxScore: 100 },
    actions: {
      canDownloadReport: true,
      canEditStatus: true,
      canUnlock: false,
      canReopenExam: false,
      canViewEvidence: true,
      canOpenGrading: true,
      ...flags,
    },
  }) as unknown as ParticipantDashboard;

const renderHeader = (d: ParticipantDashboard, a = actions(), attendanceEnabled = true) => {
  render(
    <ParticipantSummaryHeader
      dashboard={d}
      actions={a}
      showViolations
      attendanceEnabled={attendanceEnabled}
      onOpenGrading={vi.fn()}
    />,
  );
  return a;
};

beforeEach(() => vi.clearAllMocks());

describe("ParticipantSummaryHeader", () => {
  it("shows the name, username and lock reason", () => {
    renderHeader(dashboard("locked", { canUnlock: true }, { lockReason: "離開座位" }));
    expect(screen.getByRole("heading", { name: "Amy" })).toBeInTheDocument();
    expect(screen.getByText("@s7")).toBeInTheDocument();
    expect(screen.getByText(/離開座位/)).toBeInTheDocument();
  });

  it("uses unlock as the primary action when the student can be unlocked", () => {
    const a = renderHeader(dashboard("locked", { canUnlock: true, canReopenExam: true }));
    fireEvent.click(screen.getByRole("button", { name: "解除鎖定" }));
    expect(a.unlock).toHaveBeenCalledTimes(1);
  });

  it("uses reopen as the primary action for a finished student", () => {
    const a = renderHeader(dashboard("submitted", { canReopenExam: true }));
    fireEvent.click(screen.getByRole("button", { name: "重新開放考試" }));
    expect(a.reopen).toHaveBeenCalledTimes(1);
  });

  it("locks an in-progress student with the entered reason", () => {
    const a = renderHeader(dashboard("in_progress"));
    fireEvent.click(screen.getByRole("button", { name: "鎖定" }));
    const dialog = screen.getByRole("dialog", { name: "鎖定參賽者" });
    fireEvent.change(within(dialog).getByLabelText("鎖定原因"), { target: { value: "作弊" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "鎖定" }));
    expect(a.lock).toHaveBeenCalledWith("作弊");
  });

  it("keeps the lock dialog and reason open when locking fails", () => {
    const a = actions();
    vi.mocked(a.lock).mockResolvedValue(false);
    renderHeader(dashboard("in_progress"), a);
    fireEvent.click(screen.getByRole("button", { name: "鎖定" }));
    const dialog = screen.getByRole("dialog", { name: "鎖定參賽者" });
    fireEvent.change(within(dialog).getByLabelText("鎖定原因"), { target: { value: "作弊" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "鎖定" }));
    return waitFor(() => expect(a.lock).toHaveBeenCalled()).then(() => {
      expect(screen.getByRole("dialog", { name: "鎖定參賽者" })).toBeVisible();
      expect(within(screen.getByRole("dialog", { name: "鎖定參賽者" })).getByLabelText("鎖定原因")).toHaveValue("作弊");
    });
  });

  it("renders the KPI strip", () => {
    renderHeader(dashboard("in_progress"));
    expect(screen.getByText("10.00 / 100.00 分")).toBeInTheDocument();
    expect(screen.getByText("違規次數")).toBeInTheDocument();
  });

  it("hides assisted attendance in more actions when attendance is disabled", () => {
    renderHeader(dashboard("in_progress"), actions(), false);
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("menuitem", { name: "下載報告" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "人工簽到" })).toBeNull();
  });
});
