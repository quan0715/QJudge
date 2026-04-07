import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  buildClassroomMonthSchedule,
  localDateKeyFromMs,
} from "@/features/classroom/domain/classroomActivityTimeline";
import { ClassroomMonthSchedule } from "./ClassroomMonthSchedule";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      if (key === "activitySchedule.moreEvents")
        return `+${options?.count ?? ""}`;
      return fallback ?? key;
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

const baseContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "Future exam",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "coding",
  deliveryMode: "exam",
  contestStartTime: new Date(2026, 5, 16, 10).toISOString(),
  contestEndTime: new Date(2026, 5, 16, 12).toISOString(),
  contestOwnerUsername: "teacher",
  participantCount: 0,
  boundAt: new Date(2026, 5, 1).toISOString(),
  ...overrides,
});

const renderSchedule = (
  contests: BoundContest[],
  selectedDateKey = localDateKeyFromMs(new Date(2026, 5, 15, 12).getTime()),
) => {
  const nowMs = new Date(2026, 5, 15, 12).getTime();
  const monthAnchor = new Date(2026, 5, 1);
  const onOpenContest = vi.fn();
  const onSelectDate = vi.fn();
  const onViewModeChange = vi.fn();
  const cells = buildClassroomMonthSchedule(contests, monthAnchor, nowMs);

  render(
    <ClassroomMonthSchedule
      cells={cells}
      rangeAnchor={monthAnchor}
      viewMode="month"
      selectedDateKey={selectedDateKey}
      onViewModeChange={onViewModeChange}
      onSelectDate={onSelectDate}
      onOpenContest={onOpenContest}
      onPreviousRange={vi.fn()}
      onNextRange={vi.fn()}
    />,
  );

  return { onOpenContest, onSelectDate, onViewModeChange };
};

describe("ClassroomMonthSchedule", () => {
  it("renders contest event pills and opens contests", () => {
    const contest = baseContest({});
    const { onOpenContest } = renderSchedule([contest]);

    fireEvent.click(screen.getByRole("button", { name: "Future exam" }));

    expect(screen.getByText("Future exam")).toBeInTheDocument();
    expect(onOpenContest).toHaveBeenCalledWith("c1");
  });

  it("selects a date when clicking an event date badge", () => {
    const contest = baseContest({});
    const { onSelectDate } = renderSchedule([contest]);

    fireEvent.click(screen.getByRole("button", { name: "16" }));

    expect(onSelectDate).toHaveBeenCalledWith(
      localDateKeyFromMs(new Date(2026, 5, 16, 10).getTime()),
    );
  });

  it("selects empty dates without implying they are event cards", () => {
    const contest = baseContest({});
    const { onSelectDate } = renderSchedule([contest]);

    fireEvent.click(screen.getByRole("button", { name: "17" }));

    expect(onSelectDate).toHaveBeenCalledWith(
      localDateKeyFromMs(new Date(2026, 5, 17, 10).getTime()),
    );
  });

  it("shows an empty state when the month has no contests", () => {
    renderSchedule([]);

    expect(screen.getByText("本月沒有考試或競賽")).toBeInTheDocument();
  });

  it("exposes week and month view switching", () => {
    const { onViewModeChange } = renderSchedule([]);

    fireEvent.click(screen.getByRole("tab", { name: "週" }));

    expect(onViewModeChange).toHaveBeenCalledWith("week");
  });
});
