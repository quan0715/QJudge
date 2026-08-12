import type { Meta, StoryObj } from "@storybook/react";
import { ArrowUp } from "@carbon/icons-react";
import {
  MetricBlock,
  PageTitle,
  SectionTitle,
  TimeDisplay,
} from "./index";

const meta: Meta = {
  title: "Dashboard/Typography",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

export const Headings: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "1rem" }}>
      <PageTitle>2026 春季程式競賽</PageTitle>
      <SectionTitle>參賽進度</SectionTitle>
    </div>
  ),
};

export const Metrics: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "2rem" }}>
      <MetricBlock label="題目數量" value={12} />
      <MetricBlock label="參賽人數" value={42} size="lg" />
      <MetricBlock
        label="完成率"
        value="78%"
        size="lg"
        trailing={<ArrowUp size={16} />}
      />
      <MetricBlock label="剩餘" value="04:12" align="end" />
    </div>
  ),
};

export const Times: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
      <TimeDisplay variant="countdown" value="01:23:45" label="剩餘時間" />
      <TimeDisplay variant="header" value="14:05" />
    </div>
  ),
};
