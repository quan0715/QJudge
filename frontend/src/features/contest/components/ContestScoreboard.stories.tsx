import type { Meta, StoryObj } from "@storybook/react-vite";
import { Theme } from "@carbon/react";
import { expect, fn, within } from "storybook/test";
import ContestScoreboard from "./ContestScoreboard";

const meta = {
  title: "features/contest/ContestScoreboard",
  component: ContestScoreboard,
  decorators: [(Story) => <Theme theme="white"><Story /></Theme>],
  args: {
    problems: [{ id: "binding-1", problem_id: "coding-1", title: "A+B", label: "A", order: 0 }],
    standings: [{
      rank: 1, user: { id: 468, username: "student" }, displayName: "測試學生",
      solved: 1, total_score: 100, time: 10,
      problems: { "binding-1": { status: "AC", tries: 3, time: 10, pending: false, score: 100 } },
    }],
  },
} satisfies Meta<typeof ContestScoreboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { onSelectParticipant: fn() },
  play: async ({ canvasElement }) => {
    const name = within(canvasElement).getByRole("button", { name: "測試學生" });
    await expect(name.getBoundingClientRect().width).toBeLessThan(name.closest("td")!.getBoundingClientRect().width);
    await expect(getComputedStyle(name).alignItems).toBe("center");
    const button = within(canvasElement).getByRole("button", { name: "測試學生 · A" });
    const cell = button.closest("td")!;
    const bounds = button.getBoundingClientRect();
    const cellBounds = cell.getBoundingClientRect();
    await expect(getComputedStyle(button).padding).toBe("0px");
    await expect(Math.abs(bounds.width - cellBounds.width)).toBeLessThanOrEqual(1);
    await expect(Math.abs(bounds.height - cellBounds.height)).toBeLessThanOrEqual(1);
  },
};
export const StudentReadOnly: Story = {};
export const Dark: Story = {
  ...Playground,
  decorators: [(Story) => <Theme theme="g100"><Story /></Theme>],
};
