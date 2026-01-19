import type { StoryModule } from "@/shared/types/story.types";
import { ContestTimer, type ContestTimerProps } from "./ContestTimer";

const now = Date.now();

const storyModule: StoryModule<ContestTimerProps> = {
  meta: {
    title: "shared/ui/contest/ContestTimer",
    component: ContestTimer,
    category: "shared",
    description: "競賽倒數計時器，可用於 contest 模式顯示距開始或距結束時間。",
    defaultArgs: {
      status: "running",
      targetTime: new Date(now + 60 * 60 * 1000).toISOString(),
      label: "距結束",
    },
    argTypes: {
      status: { control: "select", options: ["upcoming", "running", "ended"], label: "狀態" },
      targetTime: { control: "text", label: "目標時間 (ISO)" },
      label: { control: "text", label: "標籤" },
    },
  },
  stories: [
    {
      name: "Running",
      render: (args) => <ContestTimer {...args} />,
    },
    {
      name: "Upcoming",
      render: () => (
        <ContestTimer
          status="upcoming"
          targetTime={new Date(now + 30 * 60 * 1000).toISOString()}
          label="距開始"
        />
      ),
    },
    {
      name: "Ended",
      render: () => (
        <ContestTimer status="ended" targetTime={new Date(now - 1000).toISOString()} />
      ),
    },
  ],
};

export default storyModule;
