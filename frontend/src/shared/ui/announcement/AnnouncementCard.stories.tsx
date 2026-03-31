import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import { AnnouncementCard } from "./AnnouncementCard";
import type { Announcement } from "@/core/entities/announcement.entity";

const mockAnnouncement: Announcement = {
  id: 1,
  title: "\u7cfb\u7d71\u7dad\u8b77\u516c\u544a",
  content: "\u89aa\u611b\u7684\u4f7f\u7528\u8005\uff0c\u7cfb\u7d71\u5c07\u65bc 2024/01/15 00:00 \u81f3 06:00 \u9032\u884c\u4f8b\u884c\u7dad\u8b77\uff0c\u5c46\u6642\u670d\u52d9\u5c07\u66ab\u6642\u505c\u6b62\u3002\u7dad\u8b77\u5b8c\u6210\u5f8c\u5c07\u81ea\u52d5\u5fa9\u5fa9\u670d\u52d9\uff0c\u9020\u6210\u4e0d\u4fbf\u656c\u8acb\u898b\u8ad2\u3002",
  author: { username: "admin", role: "admin" },
  visible: true,
  created_at: "2024-01-10T10:00:00Z",
  updated_at: "2024-01-10T10:00:00Z",
};

const longContentAnnouncement: Announcement = {
  ...mockAnnouncement,
  id: 2,
  title: "\u91cd\u8981\uff1a\u7af6\u8cfd\u898f\u5247\u66f4\u65b0",
  content: "\u5404\u4f4d\u53c3\u8cfd\u8005\u597d\uff0c\u70ba\u4e86\u63d0\u4f9b\u66f4\u516c\u5e73\u7684\u7af6\u8cfd\u74b0\u5883\uff0c\u6211\u5011\u5c07\u65bc\u4e0b\u500b\u6708\u8d77\u5be6\u65bd\u65b0\u7684\u7af6\u8cfd\u898f\u5247\u3002\u4e3b\u8981\u8b8a\u66f4\u5305\u62ec\uff1a1. \u6bcf\u9053\u984c\u76ee\u7684\u6642\u9593\u9650\u5236\u5c07\u7d71\u4e00\u8abf\u6574\u70ba 2 \u79d2\u3002",
};

const meta: Meta<typeof AnnouncementCard> = {
  title: "shared/ui/announcement/AnnouncementCard",
  component: AnnouncementCard,
  args: {
    announcement: mockAnnouncement,
    maxContentLength: 200,
  },
  argTypes: {
    maxContentLength: { control: "number", description: "\u5167\u5bb9\u622a\u65b7\u9577\u5ea6" },
    canDelete: { control: "boolean", description: "\u662f\u5426\u986f\u793a\u522a\u9664\u6309\u9215" },
    createdBy: { control: "text", description: "\u8986\u84cb\u4f5c\u8005\u986f\u793a\u540d\u7a31" },
  },
  parameters: {
    docs: { description: { component: "\u7cfb\u7d71\u516c\u544a\u5361\u7247\uff0c\u652f\u63f4\u5167\u5bb9\u622a\u65b7\u8207\u64cd\u4f5c\u6309\u9215\u3002" } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Clickable: Story = {
  args: { onClick: () => console.log("Card clicked") },
};

export const WithDeleteButton: Story = {
  args: { canDelete: true, onDelete: (id: number | string) => console.log("Delete:", id) },
};

export const WithCustomActions: Story = {
  render: (args) => (
    <AnnouncementCard
      announcement={mockAnnouncement}
      {...args}
      canDelete
      onDelete={(id) => console.log("Delete:", id)}
      actions={
        <Button kind="ghost" size="sm" renderIcon={Edit} hasIconOnly iconDescription="\u7de8\u8f2f\u516c\u544a" onClick={() => console.log("Edit clicked")} />
      }
    />
  ),
};

export const LongContent: Story = {
  render: (args) => (
    <AnnouncementCard {...args} announcement={longContentAnnouncement} maxContentLength={200} />
  ),
};

export const NoTruncation: Story = {
  render: (args) => (
    <AnnouncementCard {...args} announcement={longContentAnnouncement} maxContentLength={0} />
  ),
};
