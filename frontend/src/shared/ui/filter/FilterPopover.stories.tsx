import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Dropdown, Checkbox } from "@carbon/react";
import { FilterPopover } from "./FilterPopover";

const meta: Meta = {
  title: "Shared/FilterPopover",
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj;

const STATUS_OPTIONS = [
  { id: "all", label: "全部狀態" },
  { id: "AC", label: "Accepted" },
  { id: "WA", label: "Wrong Answer" },
  { id: "TLE", label: "Time Limit Exceeded" },
];

const FilterDemo = () => {
  const [status, setStatus] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        Active: {status !== "all" || onlyMine ? "Yes" : "No"}
      </span>
      <FilterPopover
        hasActiveFilters={status !== "all" || onlyMine}
        onReset={() => { setStatus("all"); setOnlyMine(false); }}
      >
        <Dropdown
          id="status"
          titleText="狀態"
          label="選擇狀態"
          items={STATUS_OPTIONS}
          itemToString={(item: { label: string } | null) => item?.label ?? ""}
          selectedItem={STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0]}
          onChange={({ selectedItem }: { selectedItem: { id: string } | null }) => {
            if (selectedItem) setStatus(selectedItem.id);
          }}
        />
        <Checkbox
          id="only-mine"
          labelText="只顯示我的"
          checked={onlyMine}
          onChange={(_, { checked }) => setOnlyMine(checked)}
        />
      </FilterPopover>
    </div>
  );
};

export const Default: Story = {
  render: () => <FilterDemo />,
};
