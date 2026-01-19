import type { StoryModule } from "@/shared/types/story.types";
import { ContestPreviewCard, type ContestPreviewCardProps } from "./ContestPreviewCard";
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

const storyModule: StoryModule<ContestPreviewCardProps> = {
  meta: {
    title: "features/contest/ContestPreviewCard",
    component: ContestPreviewCard,
    category: "features",
    description: "競賽預覽卡片：顯示狀態、時間、主辦、參與狀態。",
    defaultArgs: {
      contest: sampleContest(),
    },
    argTypes: {
      contest: {
        control: "object",
        label: "Contest",
        description: "競賽資料",
      },
      onSelect: {
        control: "text",
        label: "onSelect",
        description: "點擊卡片的處理函數",
        defaultValue: "() => {}",
      },
    },
  },
  stories: [
    {
      name: "Default",
      render: (args) => <ContestPreviewCard {...args} />,
      code: `<ContestPreviewCard contest={contest} onSelect={console.log} />`,
    },
    {
      name: "Registered",
      render: () => (
        <ContestPreviewCard
          contest={sampleContest({ isRegistered: true })}
        />
      ),
      code: `<ContestPreviewCard contest={{ ...contest, isRegistered: true }} />`,
    },
    {
      name: "Past",
      render: () => (
        <ContestPreviewCard
          contest={sampleContest({
            startTime: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
            endTime: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            status: "archived",
          })}
        />
      ),
      code: `<ContestPreviewCard contest={pastContest} />`,
    },
  ],
};

export default storyModule;
