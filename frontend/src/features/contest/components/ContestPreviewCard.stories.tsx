import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContestPreviewCard } from "./ContestPreviewCard";
import type { Contest } from "@/core/entities/contest.entity";

const sampleContest = (override: Partial<Contest> = {}): Contest => ({
  id: "1",
  name: "ICPC Regional",
  description: "Regional programming contest",
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
  status: "published",
  visibility: "public",
  hasJoined: false,
  isRegistered: false,
  organizer: "Host Team",
  ...override,
});

const meta: Meta<typeof ContestPreviewCard> = {
    title: "features/contest/ContestPreviewCard",
    component: ContestPreviewCard,
    
    args: {
      contest: sampleContest(),
    },
    argTypes: {
      contest: {
        control: "object",
                description: "競賽資料",
      },
      onSelect: {
        control: "text",
                description: "點擊卡片的處理函數",
        defaultValue: "() => {}",
      },
    },
  
  parameters: {
    docs: { description: { component: '競賽預覽卡片：顯示狀態、時間、主辦、參與狀態。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      source: { code: `<ContestPreviewCard contest={contest} onSelect={console.log} />` },
    },
  },
  render: (args) => <ContestPreviewCard {...args} contest={args.contest ?? sampleContest()} />,
};

export const Registered: Story = {
  parameters: {
    docs: {
      source: { code: `<ContestPreviewCard contest={{ ...contest, isRegistered: true }} />` },
    },
  },
  render: () => (
        <ContestPreviewCard
          contest={sampleContest({ isRegistered: true })}
        />
      ),
};

export const Past: Story = {
  parameters: {
    docs: {
      source: { code: `<ContestPreviewCard contest={pastContest} />` },
    },
  },
  render: () => (
        <ContestPreviewCard
          contest={sampleContest({
            startTime: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
            endTime: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            status: "archived",
          })}
        />
      ),
};
