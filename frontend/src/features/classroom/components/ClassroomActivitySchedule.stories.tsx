import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import i18n from "@/i18n";
import { ClassroomMonthSchedule } from "./ClassroomMonthSchedule";
import {
  buildClassroomMonthSchedule,
  buildClassroomWeekSchedule,
  localDateKeyFromMs,
} from "@/features/classroom/domain/classroomActivityTimeline";
import type { ClassroomScheduleViewMode } from "./ClassroomMonthSchedule";

const DAY = 86_400_000;

const baseContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "Sample exam",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "coding",
  deliveryMode: "exam",
  contestStartTime: new Date(Date.now() + 2 * DAY).toISOString(),
  contestEndTime: new Date(Date.now() + 2 * DAY + 7_200_000).toISOString(),
  contestOwnerUsername: "teacher",
  participantCount: 3,
  boundAt: new Date().toISOString(),
  ...overrides,
});

interface DemoProps {
  contests: BoundContest[];
}

function ScheduleDemo({ contests }: DemoProps) {
  const [nowMs] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState<ClassroomScheduleViewMode>("week");
  const [rangeAnchor, setRangeAnchor] = useState(() => {
    const date = new Date(nowMs);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    localDateKeyFromMs(nowMs),
  );

  const cells = useMemo(
    () =>
      viewMode === "week"
        ? buildClassroomWeekSchedule(contests, rangeAnchor, nowMs)
        : buildClassroomMonthSchedule(contests, rangeAnchor, nowMs),
    [contests, rangeAnchor, viewMode, nowMs],
  );

  return (
    <div style={{ maxWidth: 960 }}>
      <ClassroomMonthSchedule
        cells={cells}
        rangeAnchor={rangeAnchor}
        viewMode={viewMode}
        selectedDateKey={selectedDateKey}
        onViewModeChange={setViewMode}
        onSelectDate={setSelectedDateKey}
        onOpenContest={(id) => console.info("preview contest", id)}
        onPreviousRange={() => {
          setRangeAnchor((current) => {
            const next = new Date(current);
            if (viewMode === "week") {
              next.setDate(current.getDate() - 7);
            } else {
              next.setMonth(current.getMonth() - 1);
            }
            return next;
          });
        }}
        onNextRange={() => {
          setRangeAnchor((current) => {
            const next = new Date(current);
            if (viewMode === "week") {
              next.setDate(current.getDate() + 7);
            } else {
              next.setMonth(current.getMonth() + 1);
            }
            return next;
          });
        }}
      />
    </div>
  );
}

const meta: Meta<typeof ScheduleDemo> = {
  title: "features/classroom/ClassroomActivitySchedule",
  component: ScheduleDemo,
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    ),
  ],
  args: {
    contests: [],
  },
  parameters: {
    docs: {
      description: {
        component:
          "教室總覽主欄：學生視角月曆，只顯示競賽/考試排程，不顯示公告。",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const ContestsOnly: Story = {
  args: {
    contests: [
      baseContest({
        contestId: "past",
        contestName: "Past exam",
        contestStartTime: new Date(Date.now() - 7 * DAY).toISOString(),
        contestEndTime: new Date(
          Date.now() - 7 * DAY + 7_200_000,
        ).toISOString(),
      }),
      baseContest({
        contestId: "upcoming",
        contestName: "Upcoming exam",
      }),
    ],
  },
};

export const SameDayMultiple: Story = {
  args: {
    contests: [
      baseContest({
        contestId: "morning",
        contestName: "Morning exam",
        contestStartTime: new Date(Date.now() + 2 * DAY).toISOString(),
        contestEndTime: new Date(
          Date.now() + 2 * DAY + 3_600_000,
        ).toISOString(),
      }),
      baseContest({
        contestId: "afternoon",
        contestName: "Afternoon exam",
        contestStartTime: new Date(
          Date.now() + 2 * DAY + 7_200_000,
        ).toISOString(),
        contestEndTime: new Date(
          Date.now() + 2 * DAY + 10_800_000,
        ).toISOString(),
      }),
      baseContest({
        contestId: "evening",
        contestName: "Evening exam",
        contestStartTime: new Date(
          Date.now() + 2 * DAY + 14_400_000,
        ).toISOString(),
        contestEndTime: new Date(
          Date.now() + 2 * DAY + 18_000_000,
        ).toISOString(),
      }),
    ],
  },
};
