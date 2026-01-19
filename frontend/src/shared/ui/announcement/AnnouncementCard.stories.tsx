import type { StoryModule, Story } from "@/shared/types/story.types";
import { Button } from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import { AnnouncementCard, type AnnouncementCardProps } from "./AnnouncementCard";
import type { Announcement } from "@/infrastructure/api/repositories/announcement.repository";

const mockAnnouncement: Announcement = {
  id: 1,
  title: "系統維護公告",
  content:
    "親愛的使用者，系統將於 2024/01/15 00:00 至 06:00 進行例行維護，届時服務將暫時停止。維護完成後將自動恢復服務，造成不便敬請見諒。",
  author: {
    username: "admin",
    role: "admin",
  },
  visible: true,
  created_at: "2024-01-10T10:00:00Z",
  updated_at: "2024-01-10T10:00:00Z",
};

const longContentAnnouncement: Announcement = {
  ...mockAnnouncement,
  id: 2,
  title: "重要：競賽規則更新",
  content:
    "各位參賽者好，為了提供更公平的競賽環境，我們將於下個月起實施新的競賽規則。主要變更包括：1. 每道題目的時間限制將統一調整為 2 秒。2. 記憶體限制統一調整為 256MB。3. 新增部分分數機制，讓更多努力得到認可。4. 增加測試資料的多樣性，確保解答的正確性。5. 調整排名計算方式，除了正確性外，也會考量提交時間和嘗試次數。請各位參賽者提前熟悉新規則，如有任何問題歡迎透過系統提問功能聯繫我們。",
};

const meta: StoryModule<AnnouncementCardProps>["meta"] = {
  title: "shared/ui/announcement/AnnouncementCard",
  component: AnnouncementCard,
  category: "shared",
  description: "系統公告卡片，支援內容截斷與操作按鈕。",
  defaultArgs: {
    announcement: mockAnnouncement,
    maxContentLength: 200,
  },
  argTypes: {
    maxContentLength: {
      control: "number" as const,
      label: "Max Content Length",
      description: "內容截斷長度",
    },
    canDelete: {
      control: "boolean" as const,
      label: "Can Delete",
      description: "是否顯示刪除按鈕",
    },
    createdBy: {
      control: "text" as const,
      label: "Created By",
      description: "覆蓋作者顯示名稱",
    },
  },
};

const stories: Story<AnnouncementCardProps>[] = [
  {
    name: "Default",
    render: (args) => <AnnouncementCard {...args} />,
  },
  {
    name: "Clickable",
    render: (args) => (
      <AnnouncementCard
        {...args}
        onClick={() => console.log("Card clicked")}
      />
    ),
  },
  {
    name: "With Delete Button",
    render: (args) => (
      <AnnouncementCard
        {...args}
        canDelete
        onDelete={(id: number | string) =>
          console.log("Delete announcement:", id)
        }
      />
    ),
  },
  {
    name: "With Custom Actions",
    render: (args) => (
      <AnnouncementCard
        {...args}
        canDelete
        onDelete={(id: number | string) =>
          console.log("Delete announcement:", id)
        }
        actions={
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Edit}
            hasIconOnly
            iconDescription="編輯公告"
            onClick={() => console.log("Edit clicked")}
          />
        }
      />
    ),
  },
  {
    name: "Long Content",
    render: (args) => (
      <AnnouncementCard
        {...args}
        announcement={longContentAnnouncement}
        maxContentLength={200}
      />
    ),
  },
  {
    name: "No Truncation",
    render: (args) => (
      <AnnouncementCard
        {...args}
        announcement={longContentAnnouncement}
        maxContentLength={0}
      />
    ),
  },
  {
    name: "Custom Date Format",
    render: (args) => (
      <AnnouncementCard
        {...args}
        formatDate={(dateStr: string) =>
          new Date(dateStr).toLocaleDateString("zh-TW", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        }
      />
    ),
  },
];

const storyModule: StoryModule<AnnouncementCardProps> = {
  meta,
  stories,
};

export default storyModule;
