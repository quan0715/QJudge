import type { StoryModule } from "@/shared/types/story.types";
import { KpiCard, type KpiCardProps } from "./KpiCard";
import { CheckmarkFilled, Trophy } from "@carbon/icons-react";

const storyModule: StoryModule<KpiCardProps> = {
  meta: {
    title: "shared/ui/dataCard/KpiCard",
    component: KpiCard,
    category: "shared",
    description: "KPI 卡片，顯示 icon + value + label。",
    defaultArgs: {
      value: "245",
      label: "Solved",
      icon: CheckmarkFilled,
      showBorder: true,
    },
    argTypes: {
      value: { control: "text", label: "Value" },
      label: { control: "text", label: "Label" },
      showBorder: { control: "boolean", label: "Border" },
    },
  },
  stories: [
    {
      name: "Playground",
      render: (args) => <KpiCard {...args} />,
    },
    {
      name: "Multiple KPIs",
      render: () => (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <KpiCard value="245" label="Solved" icon={CheckmarkFilled} showBorder />
          <KpiCard value="12" label="Contests" icon={Trophy} showBorder={false} />
        </div>
      ),
    },
  ],
};

export default storyModule;
