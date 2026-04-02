import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Tag } from "@carbon/react";
import { Document, UserMultiple, Checkmark, WarningAlt, ChevronLeft, ChevronRight } from "@carbon/icons-react";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
} from "./ListPanel";

const meta: Meta = {
  title: "Shared/ListPanel",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

const QUESTIONS = [
  "Q1. Sorting", "Q2. Binary Search", "Q3. DP", "Q4. Graph", "Q5. Greedy",
  "Q6. Backtracking", "Q7. BFS", "Q8. DFS", "Q9. Union Find", "Q10. Trie",
  "Q11. Segment Tree", "Q12. Fenwick Tree", "Q13. Dijkstra", "Q14. Floyd",
  "Q15. KMP",
];

export const Default: Story = {
  render: () => (
    <div style={{ width: 300, height: 400, display: "flex", flexDirection: "column", border: "1px solid var(--cds-border-subtle)" }}>
      <ListPanel
        header={<ListHeader title="Questions" action={<Tag size="sm" type="blue">{QUESTIONS.length}</Tag>} />}
        footer={<ListFooter>3 / {QUESTIONS.length} completed</ListFooter>}
      >
        {QUESTIONS.map((title, i) => (
          <ListItem key={i} active={i === 2} onClick={() => {}}>
            <ListItemLeading>
              <Document size={16} />
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>{title}</ListItemTitle>
              <ListItemMeta>{(i + 1) * 2}/10 graded</ListItemMeta>
            </ListItemContent>
            <ListItemTrailing>
              <Tag size="sm" type={i < 3 ? "green" : "cool-gray"}>
                {i < 3 ? "Done" : "Pending"}
              </Tag>
            </ListItemTrailing>
          </ListItem>
        ))}
      </ListPanel>
    </div>
  ),
};

const CollapsibleSidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const items = QUESTIONS.slice(0, 8);

  const toggleBtn = (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--cds-icon-primary)" }}
    >
      {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
    </button>
  );

  return (
    <div style={{ display: "flex", height: 400, border: "1px solid var(--cds-border-subtle)" }}>
      <div style={{ width: collapsed ? 56 : 260, display: "flex", flexDirection: "column", transition: "width 200ms" }}>
        <ListPanel
          header={
            <ListHeader
              title={collapsed ? "" : "Questions"}
              action={toggleBtn}
            />
          }
          footer={!collapsed ? <ListFooter>3 / {items.length} completed</ListFooter> : undefined}
        >
          {items.map((title, i) =>
            collapsed ? (
              <ListItem key={i} size="compact" active={i === 2} onClick={() => {}}>
                Q{i + 1}
              </ListItem>
            ) : (
              <ListItem key={i} active={i === 2} onClick={() => {}}>
                <ListItemLeading><Document size={16} /></ListItemLeading>
                <ListItemContent>
                  <ListItemTitle>{title}</ListItemTitle>
                  <ListItemMeta>{(i + 1) * 2}/10 graded</ListItemMeta>
                </ListItemContent>
                <ListItemTrailing>
                  <Tag size="sm" type={i < 3 ? "green" : "cool-gray"}>{i < 3 ? "Done" : "Pending"}</Tag>
                </ListItemTrailing>
              </ListItem>
            ),
          )}
        </ListPanel>
      </div>
      <div style={{ flex: 1, padding: "1rem", color: "var(--cds-text-secondary)" }}>
        Detail pane
      </div>
    </div>
  );
};

export const Compact: Story = {
  name: "Collapsible Sidebar",
  render: () => <CollapsibleSidebar />,
};

export const WithParticipants: Story = {
  name: "Participants List",
  render: () => (
    <div style={{ width: 320, height: 450, display: "flex", flexDirection: "column", border: "1px solid var(--cds-border-subtle)" }}>
      <ListPanel
        header={<ListHeader title="Participants" action={<Tag size="sm" type="blue">126</Tag>} />}
        footer={<ListFooter>4 / 126 shown</ListFooter>}
      >
        {[
          { name: "Alice Chen", username: "@alice", status: "submitted", score: 95 },
          { name: "Bob Wang", username: "@bob", status: "in_progress", score: 60 },
          { name: "Carol Lin", username: "@carol", status: "submitted", score: 88 },
          { name: "David Wu", username: "@david", status: "not_started", score: 0 },
        ].map((p, i) => (
          <ListItem key={i} active={i === 0} onClick={() => {}}>
            <ListItemLeading>
              <UserMultiple size={16} />
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>{p.name}</ListItemTitle>
              <ListItemMeta>{p.username} · Score: {p.score}</ListItemMeta>
            </ListItemContent>
            <ListItemTrailing>
              <Tag
                size="sm"
                type={p.status === "submitted" ? "green" : p.status === "in_progress" ? "blue" : "cool-gray"}
              >
                {p.status}
              </Tag>
            </ListItemTrailing>
          </ListItem>
        ))}
      </ListPanel>
    </div>
  ),
};

export const DangerVariant: Story = {
  name: "Danger Variant",
  render: () => (
    <div style={{ width: 280, height: 250, display: "flex", flexDirection: "column", border: "1px solid var(--cds-border-subtle)" }}>
      <ListPanel>
        <ListItem onClick={() => {}}>
          <ListItemLeading><Checkmark size={16} /></ListItemLeading>
          <ListItemContent><ListItemTitle>Normal Item</ListItemTitle></ListItemContent>
        </ListItem>
        <ListItem active danger onClick={() => {}}>
          <ListItemLeading><WarningAlt size={16} /></ListItemLeading>
          <ListItemContent><ListItemTitle>Danger Active</ListItemTitle></ListItemContent>
        </ListItem>
        <ListItem onClick={() => {}}>
          <ListItemLeading><Checkmark size={16} /></ListItemLeading>
          <ListItemContent><ListItemTitle>Another Item</ListItemTitle></ListItemContent>
        </ListItem>
      </ListPanel>
    </div>
  ),
};
