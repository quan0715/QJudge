import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";
import type { BoundContest, ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import i18n from "@/i18n";
import { ClassroomActivityTimeline } from "./ClassroomActivityTimeline";
import "./ClassroomActivitySchedule.scss";
import { buildAllTimelineDayGroups } from "@/features/classroom/domain/classroomActivityTimeline";

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

const baseAnnouncement = (overrides: Partial<ClassroomAnnouncement>): ClassroomAnnouncement => ({
  id: "a1",
  title: "Sample announcement",
  content: "Body text",
  isPinned: false,
  createdByUsername: "teacher",
  createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  ...overrides,
});

interface DemoProps {
  contests: BoundContest[];
  announcements: ClassroomAnnouncement[];
}

function ScheduleDemo(props: DemoProps) {
  const [nowMs] = useState(() => Date.now());
  const groups = buildAllTimelineDayGroups(props.contests, props.announcements, nowMs);
  return (
    <div style={{ maxWidth: 720 }}>
      <ClassroomActivityTimeline
        groups={groups}
        onOpenContest={(id) => console.info("open contest", id)}
        onViewAnnouncement={(a) => console.info("view announcement", a.id)}
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
    announcements: [],
  },
  parameters: {
    docs: {
      description: { component: "教室總覽主欄：統一時間軸，含活動（contest）與公告（announcement）事件，預設捲至今天。" },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const ContestsOnly: Story = {
  args: {
    contests: [
      baseContest({ contestId: "past", contestName: "Past exam", contestStartTime: new Date(Date.now() - 7 * 86400000).toISOString(), contestEndTime: new Date(Date.now() - 7 * 86400000 + 7200000).toISOString() }),
      baseContest({ contestId: "upcoming", contestName: "Upcoming exam" }),
    ],
  },
};

export const AnnouncementsOnly: Story = {
  args: {
    announcements: [
      baseAnnouncement({ id: "a1", title: "Week 1 announcement", createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 7 * 86400000).toISOString() }),
      baseAnnouncement({ id: "a2", title: "Today's announcement", createdAt: new Date(Date.now() - 1800000).toISOString(), updatedAt: new Date(Date.now() - 1800000).toISOString() }),
    ],
  },
};

export const Mixed: Story = {
  args: {
    contests: [
      baseContest({ contestId: "live", contestName: "Live exam", contestStartTime: new Date(Date.now() - 3600000).toISOString(), contestEndTime: new Date(Date.now() + 7200000).toISOString() }),
      baseContest({ contestId: "next", contestName: "Tomorrow", contestStartTime: new Date(Date.now() + 86400000).toISOString(), contestEndTime: new Date(Date.now() + 86400000 + 7200000).toISOString() }),
    ],
    announcements: [
      baseAnnouncement({ id: "a1", title: "Posted yesterday", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() }),
    ],
  },
};

export const SameDayMultiple: Story = {
  args: {
    contests: [
      baseContest({ contestId: "morning", contestName: "Morning exam", contestStartTime: new Date(Date.now() + 2 * 86400000).toISOString(), contestEndTime: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString() }),
      baseContest({ contestId: "afternoon", contestName: "Afternoon exam", contestStartTime: new Date(Date.now() + 2 * 86400000 + 7200000).toISOString(), contestEndTime: new Date(Date.now() + 2 * 86400000 + 10800000).toISOString() }),
    ],
    announcements: [
      baseAnnouncement({ id: "a1", title: "Same day announcement", createdAt: new Date(Date.now() + 2 * 86400000 - 1800000).toISOString(), updatedAt: new Date(Date.now() + 2 * 86400000 - 1800000).toISOString() }),
    ],
  },
};
