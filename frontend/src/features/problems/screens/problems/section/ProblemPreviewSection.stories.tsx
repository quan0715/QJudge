import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProblemPreviewSection } from "./ProblemPreviewSection";
import { mockProblems } from "@/shared/mocks";

const meta: Meta<typeof ProblemPreviewSection> = {
    title: "features/problems/ProblemPreviewSection",
    component: ProblemPreviewSection,
    
    args: {
      problem: mockProblems.twoSum,
    },
    argTypes: {
      problem: {
        control: "select",
                description: "選擇不同的 Mock 題目資料",
        options: Object.keys(mockProblems),
        mapping: mockProblems,
        defaultValue: "twoSum",
      },
    },
  
  parameters: {
    docs: { description: { component: '題目預覽卡片，顯示難度、標籤、通過率等資訊' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用右側 Controls 面板切換不同題目' },
      source: { code: `<ProblemPreviewSection
  problem={problem}
  onSelect={(p) => console.log(p.title)}
/>` },
    },
  },
  render: (args) => (
        <ProblemPreviewSection
          {...args}
          problem={args.problem ?? mockProblems.twoSum}
          onSelect={(p) => console.log("Selected:", p.title)}
        />
      ),
};

export const AllDifficulties: Story = {
  parameters: {
    docs: {
      description: { story: '不同難度的題目卡片' },
      source: { code: `<ProblemPreviewSection problem={easyProblem} />
<ProblemPreviewSection problem={mediumProblem} />
<ProblemPreviewSection problem={hardProblem} />` },
    },
  },
  render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "600px" }}>
          <ProblemPreviewSection problem={mockProblems.twoSum} />
          <ProblemPreviewSection problem={mockProblems.addTwoNumbers} />
          <ProblemPreviewSection problem={mockProblems.medianOfTwoArrays} />
        </div>
      ),
};

export const SolvedStates: Story = {
  parameters: {
    docs: {
      description: { story: '已解決 vs 未解決狀態' },
      source: { code: `<ProblemPreviewSection problem={solvedProblem} />
<ProblemPreviewSection problem={unsolvedProblem} />` },
    },
  },
  render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "600px" }}>
          <ProblemPreviewSection problem={mockProblems.palindromeNumber} />
          <ProblemPreviewSection problem={mockProblems.twoSum} />
        </div>
      ),
};
