import type { Meta, StoryObj } from "@storybook/react";
import { KpiCard } from "./KpiCard";
import { CheckmarkFilled, Trophy } from "@carbon/icons-react";

const meta: Meta<typeof KpiCard> = {
    title: "shared/ui/dataCard/KpiCard",
    component: KpiCard,
    
    args: {
      value: "245",
      label: "Solved",
      icon: CheckmarkFilled,
      showBorder: true,
    },
    argTypes: {
      value: { control: "text", description: "Value" },
      label: { control: "text", description: "Label" },
      showBorder: { control: "boolean", description: "Border" },
    },
  
  parameters: {
    docs: { description: { component: 'KPI 卡片，顯示 icon + value + label。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { value: "245", label: "Solved" },
};

export const MultipleKpis: Story = {
  render: () => (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <KpiCard value="245" label="Solved" icon={CheckmarkFilled} showBorder />
          <KpiCard value="12" label="Contests" icon={Trophy} showBorder={false} />
        </div>
      ),
};
