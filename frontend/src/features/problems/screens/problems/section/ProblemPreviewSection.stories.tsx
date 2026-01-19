import type { StoryModule } from "@/shared/types/story.types";
import { ProblemPreviewSection, type ProblemPreviewSectionProps } from "./ProblemPreviewSection";
import { mockProblems } from "@/features/storybook/mocks";

const storyModule: StoryModule<ProblemPreviewSectionProps> = {
  meta: {
    title: "features/problems/ProblemPreviewSection",
    component: ProblemPreviewSection,
    description: "題目預覽卡片，顯示難度、標籤、通過率等資訊",
    category: "features",
    defaultArgs: {
      problem: mockProblems.twoSum,
    },
    argTypes: {
      problem: {
        control: "select",
        label: "題目",
        description: "選擇不同的 Mock 題目資料",
        options: Object.keys(mockProblems),
        mapping: mockProblems,
        defaultValue: "twoSum",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用右側 Controls 面板切換不同題目",
      render: (args) => (
        <ProblemPreviewSection
          {...args}
          onSelect={(p) => console.log("Selected:", p.title)}
        />
      ),
      code: `<ProblemPreviewSection
  problem={problem}
  onSelect={(p) => console.log(p.title)}
/>`,
    },
    {
      name: "All Difficulties",
      description: "不同難度的題目卡片",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "600px" }}>
          <ProblemPreviewSection problem={mockProblems.twoSum} />
          <ProblemPreviewSection problem={mockProblems.addTwoNumbers} />
          <ProblemPreviewSection problem={mockProblems.medianOfTwoArrays} />
        </div>
      ),
      code: `<ProblemPreviewSection problem={easyProblem} />
<ProblemPreviewSection problem={mediumProblem} />
<ProblemPreviewSection problem={hardProblem} />`,
    },
    {
      name: "Solved States",
      description: "已解決 vs 未解決狀態",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "600px" }}>
          <ProblemPreviewSection problem={mockProblems.palindromeNumber} />
          <ProblemPreviewSection problem={mockProblems.twoSum} />
        </div>
      ),
      code: `<ProblemPreviewSection problem={solvedProblem} />
<ProblemPreviewSection problem={unsolvedProblem} />`,
    },
  ],
};

export default storyModule;
