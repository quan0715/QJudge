import type { StoryModule } from "@/shared/types/story.types";
import ProblemPreview, { type ProblemPreviewProps } from "./ProblemPreview";
import type { ProblemDetail } from "@/core/entities/problem.entity";

// =====================================================
// ProblemDetail Mock Data
// =====================================================
const createMockProblemDetail = (
  overrides: Partial<ProblemDetail> = {}
): ProblemDetail => ({
  id: "1",
  displayId: "P001",
  title: "Two Sum",
  difficulty: "easy",
  acceptanceRate: 85.5,
  submissionCount: 1000,
  acceptedCount: 855,
  waCount: 80,
  tleCount: 30,
  mleCount: 15,
  reCount: 10,
  ceCount: 10,
  tags: [
    { id: "1", name: "陣列", slug: "array" },
    { id: "2", name: "雜湊表", slug: "hash-table" },
  ],
  isSolved: false,
  isPracticeVisible: true,
  isVisible: true,
  description: "",
  translations: [
    {
      language: "zh-TW",
      title: "兩數之和",
      description: `給定一個整數陣列 \`nums\` 和一個整數目標值 \`target\`，請你在該陣列中找出**和為目標值**的那兩個整數，並回傳它們的陣列索引。

你可以假設每種輸入只會對應一個答案。但是，陣列中同一個元素在答案裡不能重複出現。`,
      inputDescription: `第一行包含兩個整數 $n$ 和 $target$，其中 $n$ 是陣列的長度。

第二行包含 $n$ 個整數，代表陣列中的元素。`,
      outputDescription: `輸出兩個整數，代表兩個元素的索引（從 0 開始）。`,
      hint: `嘗試使用雜湊表來優化時間複雜度。`,
    },
    {
      language: "en",
      title: "Two Sum",
      description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to target.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.`,
      inputDescription: `The first line contains two integers $n$ and $target$.

The second line contains $n$ integers representing the array elements.`,
      outputDescription: `Output two integers representing the indices of the two elements (0-indexed).`,
      hint: `Try using a hash table to optimize time complexity.`,
    },
  ],
  testCases: [
    { input: "4 9\n2 7 11 15", output: "0 1", isSample: true },
    { input: "3 6\n3 2 4", output: "1 2", isSample: true },
    { input: "2 6\n3 3", output: "0 1", isSample: false },
  ],
  forbiddenKeywords: [],
  requiredKeywords: [],
  ...overrides,
});

const mockProblemDetails: Record<string, ProblemDetail> = {
  basic: createMockProblemDetail(),

  withKeywords: createMockProblemDetail({
    id: "2",
    displayId: "P002",
    title: "Recursive Sum",
    difficulty: "medium",
    translations: [
      {
        language: "zh-TW",
        title: "遞迴求和",
        description: "使用遞迴方法計算 1 到 n 的總和。",
        inputDescription: "一個正整數 $n$（$1 \\leq n \\leq 1000$）。",
        outputDescription: "輸出 1 到 n 的總和。",
        hint: "注意遞迴的終止條件。",
      },
    ],
    testCases: [
      { input: "5", output: "15", isSample: true },
      { input: "10", output: "55", isSample: true },
    ],
    requiredKeywords: ["def", "return", "if"],
    forbiddenKeywords: ["for", "while", "sum"],
  }),

  hardProblem: createMockProblemDetail({
    id: "3",
    displayId: "P003",
    title: "Regular Expression Matching",
    difficulty: "hard",
    acceptanceRate: 18.5,
    translations: [
      {
        language: "zh-TW",
        title: "正規表達式匹配",
        description: `實作支援 \`.\` 和 \`*\` 的正規表達式匹配。

- \`.\` 匹配任意單個字元
- \`*\` 匹配零個或多個前一個元素

匹配應該覆蓋**整個**輸入字串（而非部分）。`,
        inputDescription: "兩行，第一行為字串 s，第二行為模式 p。",
        outputDescription: "如果匹配成功輸出 `true`，否則輸出 `false`。",
        hint: "考慮使用動態規劃解決此問題。",
      },
    ],
    testCases: [
      { input: "aa\na", output: "false", isSample: true },
      { input: "aa\na*", output: "true", isSample: true },
      { input: "ab\n.*", output: "true", isSample: true },
    ],
    tags: [
      { id: "8", name: "字串", slug: "string" },
      { id: "9", name: "動態規劃", slug: "dp" },
    ],
  }),

  noSamples: createMockProblemDetail({
    id: "4",
    displayId: "P004",
    title: "Hidden Test Problem",
    difficulty: "medium",
    translations: [
      {
        language: "zh-TW",
        title: "隱藏測試題",
        description: "這題沒有範例測資。",
        inputDescription: "依題意輸入。",
        outputDescription: "依題意輸出。",
        hint: "",
      },
    ],
    testCases: [
      { input: "1", output: "1", isSample: false },
    ],
  }),

  empty: undefined as unknown as ProblemDetail,
};

// =====================================================
// Story Module
// =====================================================
export const ProblemPreviewStories: StoryModule<ProblemPreviewProps> = {
  meta: {
    title: "shared/ui/problem/ProblemPreview",
    component: ProblemPreview,
    description: "題目內容預覽組件，支援 Markdown 渲染、範例測資顯示、關鍵字限制等功能。",
    category: "shared",
    defaultArgs: {
      compact: false,
      showLanguageToggle: true,
    },
    argTypes: {
      problem: {
        control: "select",
        options: Object.keys(mockProblemDetails),
        mapping: mockProblemDetails,
        description: "題目資料",
      },
      compact: {
        control: "boolean",
        description: "精簡模式（隱藏標題）",
      },
      showLanguageToggle: {
        control: "boolean",
        description: "顯示語言切換（目前未實作）",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用控制面板調整 ProblemPreview 的顯示。",
      args: {
        problem: mockProblemDetails.basic,
      },
      render: (args) => (
        <div style={{ maxWidth: "800px", padding: "1rem" }}>
          <ProblemPreview {...args} />
        </div>
      ),
    },
    {
      name: "All States",
      description: "展示不同狀態的題目預覽：基本、含關鍵字限制、困難題、無範例。",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "800px" }}>
          <section>
            <h4 style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>基本題目</h4>
            <div style={{ border: "1px solid var(--cds-border-subtle)", padding: "1rem" }}>
              <ProblemPreview problem={mockProblemDetails.basic} />
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>含關鍵字限制</h4>
            <div style={{ border: "1px solid var(--cds-border-subtle)", padding: "1rem" }}>
              <ProblemPreview problem={mockProblemDetails.withKeywords} />
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>精簡模式 (Compact)</h4>
            <div style={{ border: "1px solid var(--cds-border-subtle)", padding: "1rem" }}>
              <ProblemPreview problem={mockProblemDetails.basic} compact />
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>空資料</h4>
            <div style={{ border: "1px solid var(--cds-border-subtle)", padding: "1rem" }}>
              <ProblemPreview problem={undefined} />
            </div>
          </section>
        </div>
      ),
    },
  ],
};

export default ProblemPreviewStories;
