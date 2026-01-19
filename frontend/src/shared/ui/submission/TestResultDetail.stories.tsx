import React from "react";
import type { StoryModule, Story } from "@/shared/types/story.types";
import { TestResultDetail, type TestResultDetailProps } from "./TestResultDetail";
import { TestResultList } from "./TestResultList";
import type { TestResult } from "@/core/entities/submission.entity";

// Mock data
const createMockResult = (
  overrides: Partial<TestResult> & { id: string | number }
): TestResult => ({
  testCaseId: overrides.id,
  status: "passed",
  execTime: 123,
  memoryUsage: 45678,
  isHidden: false,
  input: "5\n1 2 3 4 5",
  output: "15",
  expectedOutput: "15",
  ...overrides,
});

const mockResults: Record<string, TestResult> = {
  passed: createMockResult({
    id: "1",
    status: "passed",
    execTime: 56,
    memoryUsage: 32000,
    input: "3\n10 20 30",
    output: "60",
    expectedOutput: "60",
  }),
  failed: createMockResult({
    id: "2",
    status: "failed",
    execTime: 78,
    memoryUsage: 35000,
    input: "4\n1 2 3 4",
    output: "9",
    expectedOutput: "10",
  }),
  tle: createMockResult({
    id: "3",
    status: "TLE",
    execTime: 2000,
    memoryUsage: 50000,
    input: "1000000\n...",
    output: "(timeout)",
    expectedOutput: "500000500000",
  }),
  mle: createMockResult({
    id: "4",
    status: "MLE",
    execTime: 500,
    memoryUsage: 262144,
    input: "large input...",
    output: "(memory limit exceeded)",
    expectedOutput: "result",
  }),
  re: createMockResult({
    id: "5",
    status: "RE",
    execTime: 10,
    memoryUsage: 20000,
    input: "0",
    output: "",
    expectedOutput: "0",
    errorMessage: "Runtime Error: Division by zero at line 15",
  }),
  ce: createMockResult({
    id: "6",
    status: "CE",
    execTime: 0,
    memoryUsage: 0,
    errorMessage: "Compile Error: undefined reference to 'main'",
  }),
  hidden: createMockResult({
    id: "7",
    status: "passed",
    execTime: 100,
    memoryUsage: 40000,
    isHidden: true,
    input: undefined,
    output: "(hidden)",
    expectedOutput: undefined,
  }),
  multilineDiff: createMockResult({
    id: "8",
    status: "failed",
    execTime: 150,
    memoryUsage: 38000,
    input: "Hello World\nFoo Bar\nBaz",
    output: "Hello World\nFoo Baz\nBar",
    expectedOutput: "Hello World\nFoo Bar\nBaz",
  }),
};

const meta: StoryModule<TestResultDetailProps>["meta"] = {
  title: "shared/ui/submission/TestResultDetail",
  component: TestResultDetail,
  category: "shared",
  description: "測試案例結果的完整詳情展示，包含 I/O、Diff、錯誤訊息。",
  defaultArgs: {
    result: mockResults.passed,
    index: 1,
    variant: "inline",
    showDiff: true,
  },
  argTypes: {
    result: {
      control: "select",
      options: Object.keys(mockResults),
      mapping: mockResults,
      description: "測試結果資料",
    },
    index: { control: "number", description: "測試案例編號" },
    variant: {
      control: "select",
      options: ["panel", "modal", "inline"],
      description: "顯示模式",
    },
    showDiff: { control: "boolean", description: "是否顯示 Diff 比對" },
  },
};

const stories: Story<TestResultDetailProps>[] = [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props。",
    render: (args) => (
      <div style={{ maxWidth: 600 }}>
        <TestResultDetail
          {...args}
          onClose={() => console.log("Close clicked")}
        />
      </div>
    ),
    code: `<TestResultDetail result={result} index={1} variant="inline" />`,
  },
  {
    name: "All Status",
    description: "各種狀態的測試結果。",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <TestResultDetail result={mockResults.passed} index={1} variant="inline" />
        <TestResultDetail result={mockResults.failed} index={2} variant="inline" />
        <TestResultDetail result={mockResults.tle} index={3} variant="inline" />
        <TestResultDetail result={mockResults.re} index={4} variant="inline" />
        <TestResultDetail result={mockResults.hidden} index={5} variant="inline" />
      </div>
    ),
    code: `
<TestResultDetail result={passedResult} index={1} variant="inline" />
<TestResultDetail result={failedResult} index={2} variant="inline" />
<TestResultDetail result={tleResult} index={3} variant="inline" />
    `,
  },
  {
    name: "With Diff",
    description: "顯示輸出差異比對。",
    render: () => (
      <div style={{ maxWidth: 700 }}>
        <TestResultDetail
          result={mockResults.multilineDiff}
          index={1}
          variant="inline"
          showDiff
        />
      </div>
    ),
    code: `<TestResultDetail result={failedResult} index={1} showDiff />`,
  },
  {
    name: "Interactive Demo",
    description: "點擊測試項目查看詳情。",
    render: () => <InteractiveDemo />,
    code: `
// Interactive list + detail panel
const [selected, setSelected] = useState(null);
<TestResultList results={results} onSelect={setSelected} />
{selected && <TestResultDetail result={selected} index={...} />}
    `,
  },
];

// Wrapper component to use hooks properly
const InteractiveDemo: React.FC = () => {
  const [selected, setSelected] = React.useState<TestResult | null>(null);
  const results = Object.values(mockResults).slice(0, 5);

  return (
    <div style={{ display: "flex", gap: "1rem", height: 500 }}>
      <div style={{ width: 300, flexShrink: 0 }}>
        <TestResultList
          results={results}
          layout="vertical"
          size="md"
          selectedId={selected?.id}
          onSelect={(r) => setSelected(r)}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {selected ? (
          <TestResultDetail
            result={selected}
            index={results.findIndex((r) => r.id === selected.id) + 1}
            variant="panel"
            onClose={() => setSelected(null)}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--cds-text-helper)",
            }}
          >
            Select a test case to view details
          </div>
        )}
      </div>
    </div>
  );
};

export const TestResultDetailStories: StoryModule<TestResultDetailProps> = {
  meta,
  stories,
};

export default TestResultDetailStories;
