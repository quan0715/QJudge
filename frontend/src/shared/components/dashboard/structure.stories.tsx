import type { Meta, StoryObj } from "@storybook/react";
import { Add } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  DashboardPage,
  KPIBlock,
  MetricBlock,
} from "./index";

const meta: Meta = {
  title: "Dashboard/Structure",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const SplitWithStackInside: Story = {
  render: () => (
    <DashboardPage ariaLabel="demo">
      <DashboardContainer layout="split" bordered dividers="auto">
        <DashboardContainer layout="stack" dividers="auto">
          <DashboardBlock>
            <BlockHeader
              titleSize="page"
              title="2026 春季程式競賽"
              description="練習用儀表板示範"
              actions={
                <Button size="sm" renderIcon={Add}>
                  新增
                </Button>
              }
            />
          </DashboardBlock>
          <DashboardContainer layout="grid" columns={3} dividers="auto">
            <DashboardBlock>
              <MetricBlock label="題目" value={12} />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock label="參賽" value={42} />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock label="完成率" value="78%" />
            </DashboardBlock>
          </DashboardContainer>
        </DashboardContainer>
        <DashboardContainer layout="stack" dividers="auto">
          <DashboardBlock>
            <BlockHeader title="統計" description="近 24 小時" />
          </DashboardBlock>
          <DashboardBlock>內容</DashboardBlock>
        </DashboardContainer>
      </DashboardContainer>
    </DashboardPage>
  ),
};

export const KPIBlocks: Story = {
  render: () => (
    <DashboardContainer layout="stack" bordered dividers="auto">
      <KPIBlock title="考生分佈總覽" value="126 人">
        <div
          style={{
            height: 8,
            background: "var(--cds-layer-accent-01)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "36%",
              height: "100%",
              background: "var(--cds-support-success)",
            }}
          />
        </div>
      </KPIBlock>
      <KPIBlock title="完成率" value="78%">
        <div
          style={{
            height: 8,
            background: "var(--cds-layer-accent-01)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "78%",
              height: "100%",
              background: "var(--cds-interactive)",
            }}
          />
        </div>
      </KPIBlock>
      <KPIBlock title="分數分布" value="0.0 / 103" />
      <KPIBlock title="違規事件" value={3} />
    </DashboardContainer>
  ),
};

export const Grid2x2Matrix: Story = {
  render: () => (
    <DashboardContainer layout="grid" columns={2} bordered dividers="auto">
      <DashboardBlock>
        <MetricBlock label="A" value="1" size="lg" />
      </DashboardBlock>
      <DashboardBlock>
        <MetricBlock label="B" value="2" size="lg" />
      </DashboardBlock>
      <DashboardBlock>
        <MetricBlock label="C" value="3" size="lg" />
      </DashboardBlock>
      <DashboardBlock>
        <MetricBlock label="D" value="4" size="lg" />
      </DashboardBlock>
    </DashboardContainer>
  ),
};
