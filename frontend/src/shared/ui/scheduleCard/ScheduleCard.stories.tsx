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

// ── Storybook meta ─────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "shared/ui/ScheduleCard",
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ maxWidth: 520, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// ── Compound: raw usage ───────────────────────────────────────────────────────

export const RawCompound: Story = {
  name: "Compound – raw usage",
  render: () => (
    <>
      <ScheduleCard.Root onClick={() => console.info("clicked")}>
        <ScheduleCard.Badge icon={<Calendar size={20} />} color="blue" />
        <ScheduleCard.Content>
          <ScheduleCard.Title>自訂卡片標題</ScheduleCard.Title>
          <ScheduleCard.Time
            start={new Date(now + DAY).toISOString()}
            end={new Date(now + DAY + 7_200_000).toISOString()}
          />
          <ScheduleCard.Meta>teacher · 自訂 meta</ScheduleCard.Meta>
        </ScheduleCard.Content>
        <ScheduleCard.Aside>
          <Tag type="blue" size="sm">即將開始</Tag>
        </ScheduleCard.Aside>
      </ScheduleCard.Root>

      {/* Homework placeholder (orange) */}
      <ScheduleCard.Root onClick={() => console.info("clicked")}>
        <ScheduleCard.Badge icon={<Task size={20} />} color="orange" />
        <ScheduleCard.Content>
          <ScheduleCard.Title>第三章習題（預留作業卡片）</ScheduleCard.Title>
          <ScheduleCard.Time end={new Date(now + 3 * DAY).toISOString()} />
          <ScheduleCard.Meta>截止日期</ScheduleCard.Meta>
        </ScheduleCard.Content>
        <ScheduleCard.Aside>
          <Tag type="warm-gray" size="sm">作業</Tag>
        </ScheduleCard.Aside>
      </ScheduleCard.Root>
    </>
  ),
};

// ── Contest presets ───────────────────────────────────────────────────────────

export const ContestUpcoming: Story = {
  name: "Contest – upcoming",
  render: () => (
    <ContestScheduleCard
      contest={makeContest({})}
      onClick={() => console.info("open contest")}
    />
  ),
};

export const ContestRunning: Story = {
  name: "Contest – running",
  render: () => (
    <ContestScheduleCard
      contest={makeContest({
        contestId: "running",
        contestName: "正在進行中的考試",
        contestStartTime: new Date(now - 3_600_000).toISOString(),
        contestEndTime:   new Date(now + 3_600_000).toISOString(),
      })}
      onClick={() => console.info("open contest")}
    />
  ),
};

export const ContestEnded: Story = {
  name: "Contest – ended",
  render: () => (
    <ContestScheduleCard
      contest={makeContest({
        contestId: "ended",
        contestName: "已結束的期末考",
        contestStartTime: new Date(now - 7 * DAY).toISOString(),
        contestEndTime:   new Date(now - 7 * DAY + 7_200_000).toISOString(),
      })}
      onClick={() => console.info("open contest")}
    />
  ),
};

export const ContestArchived: Story = {
  name: "Contest – archived",
  render: () => (
    <ContestScheduleCard
      contest={makeContest({
        contestId: "archived",
        contestName: "已封存的測驗",
        contestStatus: "archived",
        contestStartTime: new Date(now - 14 * DAY).toISOString(),
        contestEndTime:   new Date(now - 14 * DAY + 7_200_000).toISOString(),
      })}
      onClick={() => console.info("open contest")}
    />
  ),
};

// ── All states at once ────────────────────────────────────────────────────────

export const ContestAllStates: Story = {
  name: "Contest – all states",
  render: () => (
    <>
      <ContestScheduleCard contest={makeContest({})} onClick={() => {}} />
      <ContestScheduleCard
        contest={makeContest({ contestId: "r", contestName: "進行中考試", contestStartTime: new Date(now - 3_600_000).toISOString(), contestEndTime: new Date(now + 3_600_000).toISOString() })}
        onClick={() => {}}
      />
      <ContestScheduleCard
        contest={makeContest({ contestId: "e", contestName: "已結束測驗", contestStartTime: new Date(now - 7 * DAY).toISOString(), contestEndTime: new Date(now - 7 * DAY + 7_200_000).toISOString() })}
        onClick={() => {}}
      />
      <ContestScheduleCard
        contest={makeContest({ contestId: "a", contestName: "已封存競賽", contestStatus: "archived" })}
        onClick={() => {}}
      />
    </>
  ),
};

// ── Announcement preset ───────────────────────────────────────────────────────

export const AnnouncementDefault: Story = {
  name: "Announcement – default",
  render: () => (
    <AnnouncementScheduleCard
      announcement={makeAnnouncement({})}
      onClick={() => console.info("view announcement")}
    />
  ),
};

export const AnnouncementPinned: Story = {
  name: "Announcement – pinned",
  render: () => (
    <AnnouncementScheduleCard
      announcement={makeAnnouncement({ isPinned: true, title: "【置頂】重要：本學期考試時程調整通知" })}
      onClick={() => console.info("view announcement")}
    />
  ),
};

// ── Badge colours showcase ────────────────────────────────────────────────────

export const BadgeColors: Story = {
  name: "Badge – all colours",
  render: () => (
    <>
      {(["blue", "green", "gray", "purple", "orange"] as const).map((color) => (
        <ScheduleCard.Root key={color}>
          <ScheduleCard.Badge icon={<Calendar size={20} />} color={color} />
          <ScheduleCard.Content>
            <ScheduleCard.Title>Badge color: {color}</ScheduleCard.Title>
            <ScheduleCard.Meta>Lorem ipsum meta text</ScheduleCard.Meta>
          </ScheduleCard.Content>
        </ScheduleCard.Root>
      ))}
    </>
  ),
};
