import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import i18n from "@/i18n";
import { ClassroomActivityHero } from "./ClassroomActivityHero";
import { ClassroomActivityTimeline } from "./ClassroomActivityTimeline";
import "./ClassroomActivitySchedule.scss";
import { buildTimelineDayGroups, pickHeroContest } from "@/features/classroom/domain/classroomActivityTimeline";

const baseContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "Sample exam",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "coding",
  deliveryMode: "exam",
  contestStartTime: new Date(Date.now() + 2 * 86400000).toISOString(),
  contestEndTime: new Date(Date.now() + 2 * 86400000 + 7200000).toISOString(),
  contestOwnerUsername: "teacher",
  participantCount: 3,
  boundAt: new Date().toISOString(),
  ...overrides,
});

function ScheduleDemo(props: { contests: BoundContest[] }) {
  const [nowMs] = useState(() => Date.now());
  const hero = pickHeroContest(props.contests, nowMs);
  const groups = buildTimelineDayGroups(props.contests, nowMs);
  return (
    <div className="classroom-activity-schedule" style={{ maxWidth: 720 }}>
      <ClassroomActivityHero
        contest={hero}
        isPrivileged
        onOpenContest={(id) => console.info("open", id)}
        onCreateExam={() => console.info("create")}
      />
      <ClassroomActivityTimeline
        groups={groups}
        heroContestId={hero?.contestId ?? null}
        onOpenContest={(id) => console.info("open", id)}
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
  parameters: {
    docs: {
      description: { component: "教室總覽主欄：下一場活動焦點與稀疏活動時間軸。" },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { contests: [] },
};

export const UpcomingOnly: Story = {
  args: {
    contests: [
      baseContest({ contestId: "a", contestName: "First upcoming" }),
      baseContest({
        contestId: "b",
        contestName: "Later",
        contestStartTime: new Date(Date.now() + 5 * 86400000).toISOString(),
        contestEndTime: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(),
      }),
    ],
  },
};

export const InProgressAndUpcoming: Story = {
  args: {
    contests: [
      baseContest({
        contestId: "live",
        contestName: "Live exam",
        contestStartTime: new Date(Date.now() - 3600000).toISOString(),
        contestEndTime: new Date(Date.now() + 7200000).toISOString(),
      }),
      baseContest({
        contestId: "next",
        contestName: "Tomorrow",
        contestStartTime: new Date(Date.now() + 86400000).toISOString(),
        contestEndTime: new Date(Date.now() + 86400000 + 7200000).toISOString(),
      }),
    ],
  },
};
