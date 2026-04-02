import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@carbon/react";
import { Bullhorn, Trophy, UserMultiple, Add } from "@carbon/icons-react";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Shared/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 400, border: "1px solid var(--cds-border-subtle)", padding: 0 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const WithIcon: Story = {
  args: {
    icon: Bullhorn,
    title: "尚無公告",
  },
};

export const WithDescription: Story = {
  args: {
    icon: Trophy,
    title: "尚無活動",
    description: "目前沒有進行中或即將開始的考試與競賽。",
  },
};

export const WithAction: Story = {
  args: {
    icon: UserMultiple,
    title: "尚無成員",
    description: "邀請學生加入教室以開始使用。",
    action: (
      <Button kind="tertiary" size="sm" renderIcon={Add}>
        新增成員
      </Button>
    ),
  },
};

export const Compact: Story = {
  args: {
    icon: Bullhorn,
    title: "找不到符合條件的結果",
    compact: true,
  },
};

export const TitleOnly: Story = {
  args: {
    title: "尚無作答資料",
  },
};
