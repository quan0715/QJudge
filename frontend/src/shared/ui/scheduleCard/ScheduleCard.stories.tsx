import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tag } from "@carbon/react";
import { Calendar, Task } from "@carbon/icons-react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import type { BoundContest, ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { ScheduleCard } from "./ScheduleCard";
import { ContestScheduleCard } from "./presets/ContestScheduleCard";
import { AnnouncementScheduleCard } from "./presets/AnnouncementScheduleCard";

// ── Mock data ──────────────────────────────────────────────────────────────────

const now = Date.now();
const DAY = 86_400_000;

const makeContest = (overrides: Partial<BoundContest>): BoundContest => ({
  contestId: "c1",
  contestName: "2026 春季期中考試",
  contestDescription: "",
  contestStatus: "published",
  contestVisibility: "public",
  contestType: "paper_exam",
  deliveryMode: "exam",
  contestStartTime: new Date(now + 2 * DAY).toISOString(),
  contestEndTime:   new Date(now + 2 * DAY + 7_200_000).toISOString(),
  contestOwnerUsername: "prof.chen",
  participantCount: 32,
  boundAt: new Date(now - DAY).toISOString(),
  ...overrides,
});

const makeAnnouncement = (overrides: Partial<ClassroomAnnouncement>): ClassroomAnnouncement => ({
  id: "a1",
  title: "第三週作業延期至週五繳交",
  content: "因應本週假日，作業截止日延至週五晚上 23:59。",
  isPinned: false,
  createdByUsername: "prof.chen",
  createdAt: new Date(now - 3 * DAY).toISOString(),
  updatedAt: new Date(now - 3 * DAY).toISOString(),
  ...overrides,
});

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "shared/ui/ScheduleCard",
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ maxWidth: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// ── Raw compound usage ────────────────────────────────────────────────────────

export const RawCompound: Story = {
  name: "Compound – raw usage",
  render: () => (
    <>
      <ScheduleCard.Root
        onClick={() => console.info("clicked")}
        accentColor="var(--cds-interactive)"
      >
        <ScheduleCard.Header
          icon={<Calendar size={16} />}
          tag={<Tag type="blue" size="sm">即將開始</Tag>}
        >
          自訂卡片標題
        </ScheduleCard.Header>
        <ScheduleCard.Time
          start={new Date(now + DAY).toISOString()}
          end={new Date(now + DAY + 7_200_000).toISOString()}
        />
        <ScheduleCard.Meta>teacher · custom meta</ScheduleCard.Meta>
      </ScheduleCard.Root>

      {/* Homework placeholder */}
      <ScheduleCard.Root
        onClick={() => console.info("clicked")}
        accentColor="var(--cds-support-warning)"
      >
        <ScheduleCard.Header
          icon={<Task size={16} />}
          tag={<Tag type="warm-gray" size="sm">作業</Tag>}
        >
          第三章習題（預留）
        </ScheduleCard.Header>
        <ScheduleCard.Time end={new Date(now + 3 * DAY).toISOString()} />
        <ScheduleCard.Meta>截止日期</ScheduleCard.Meta>
      </ScheduleCard.Root>
    </>
  ),
};

// ── Contest presets: all states ────────────────────────────────────────────────

export const ContestAllStates: Story = {
  name: "Contest – all states",
  render: () => (
    <>
      <ContestScheduleCard
        contest={makeContest({})}
        onClick={() => {}}
      />
      <ContestScheduleCard
        contest={makeContest({
          contestId: "r",
          contestName: "正在進行中的考試",
          contestStartTime: new Date(now - 3_600_000).toISOString(),
          contestEndTime: new Date(now + 3_600_000).toISOString(),
        })}
        onClick={() => {}}
      />
      <ContestScheduleCard
        contest={makeContest({
          contestId: "e",
          contestName: "已結束的期末考",
          contestStartTime: new Date(now - 7 * DAY).toISOString(),
          contestEndTime: new Date(now - 7 * DAY + 7_200_000).toISOString(),
        })}
        onClick={() => {}}
      />
      <ContestScheduleCard
        contest={makeContest({
          contestId: "a",
          contestName: "已封存的測驗",
          contestStatus: "archived",
        })}
        onClick={() => {}}
      />
    </>
  ),
};

// ── Announcement preset ───────────────────────────────────────────────────────

export const AnnouncementDefault: Story = {
  name: "Announcement",
  render: () => (
    <>
      <AnnouncementScheduleCard
        announcement={makeAnnouncement({})}
        onClick={() => console.info("view")}
      />
      <AnnouncementScheduleCard
        announcement={makeAnnouncement({
          id: "a2",
          title: "【置頂】重要：本學期考試時程調整通知",
          isPinned: true,
        })}
        onClick={() => console.info("view")}
      />
    </>
  ),
};

// ── Accent color variants ─────────────────────────────────────────────────────

export const AccentColors: Story = {
  name: "Accent colours",
  render: () => (
    <>
      {[
        { color: "var(--cds-interactive)",     label: "interactive (blue)" },
        { color: "var(--cds-support-success)",  label: "success (green)" },
        { color: "var(--cds-border-strong-01)", label: "strong border (gray)" },
        { color: "var(--cds-support-info)",     label: "info (purple/teal)" },
        { color: "var(--cds-support-warning)",  label: "warning (orange)" },
      ].map(({ color, label }) => (
        <ScheduleCard.Root key={label} accentColor={color}>
          <ScheduleCard.Header icon={<Calendar size={16} />}>
            Accent: {label}
          </ScheduleCard.Header>
          <ScheduleCard.Meta>Demo card</ScheduleCard.Meta>
        </ScheduleCard.Root>
      ))}
    </>
  ),
};
