import type { StoryModule } from "@/shared/types/story.types";
import { InfoCard, type InfoCardProps } from "./InfoCard";
import { Time } from "@carbon/icons-react";

const storyModule: StoryModule<InfoCardProps> = {
  meta: {
    title: "shared/ui/dataCard/InfoCard",
    component: InfoCard,
    category: "shared",
    description: "資訊卡片，支援 size、outline、fillBackground。",
    defaultArgs: {
      title: "Contest Duration",
      value: "3",
      unit: "hrs",
      description: "Weekly Contest",
      size: "default",
      outline: true,
      fillBackground: true,
    },
    argTypes: {
      title: { control: "text", label: "Title" },
      value: { control: "text", label: "Value" },
      unit: { control: "text", label: "Unit" },
      description: { control: "text", label: "Description" },
      size: { control: "select", options: ["sm", "default"], label: "Size" },
      outline: { control: "boolean", label: "Outline" },
      fillBackground: { control: "boolean", label: "Filled" },
    },
  },
  stories: [
    {
      name: "Playground",
      render: (args) => (
        <div style={{ maxWidth: 260 }}>
          <InfoCard {...args} icon={<Time size={16} />} />
        </div>
      ),
    },
  ],
};

export default storyModule;
