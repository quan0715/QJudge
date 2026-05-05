import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  DashboardBlock,
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  DashboardToolbar,
} from "../index";

const meta: Meta = {
  title: "Dashboard/Tabs",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

function TabsWithToolbarStory() {
  const [active, setActive] = useState("all");
  const [q, setQ] = useState("");
  return (
    <DashboardBlock padding="flush">
      <DashboardTabs activeId={active} onChange={setActive}>
        <DashboardTabBar
          tabs={[
            { id: "all", label: "全部" },
            { id: "active", label: "進行中", badge: 12 },
            { id: "done", label: "已結束" },
          ]}
          toolbar={
            <DashboardToolbar>
              <DashboardToolbar.Search
                value={q}
                onChange={setQ}
                placeholder="搜尋學生"
              />
            </DashboardToolbar>
          }
        />
        <DashboardTabPanel tabId="all">
          <div style={{ padding: "1rem" }}>全部內容</div>
        </DashboardTabPanel>
        <DashboardTabPanel tabId="active">
          <div style={{ padding: "1rem" }}>進行中</div>
        </DashboardTabPanel>
        <DashboardTabPanel tabId="done">
          <div style={{ padding: "1rem" }}>已結束</div>
        </DashboardTabPanel>
      </DashboardTabs>
    </DashboardBlock>
  );
}

export const TabsWithToolbar: Story = {
  render: () => <TabsWithToolbarStory />,
};
