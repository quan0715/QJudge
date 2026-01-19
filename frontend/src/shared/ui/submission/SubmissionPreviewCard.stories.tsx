import type { StoryModule, Story } from "@/shared/types/story.types";
import {
  SubmissionPreviewCard,
  type SubmissionPreviewCardProps,
} from "./SubmissionPreviewCard";
import {
  mockSubmissions,
  createMockSubmission,
} from "@/features/storybook/mocks";

const meta = {
  title: "shared/ui/submission/SubmissionPreviewCard",
  component: SubmissionPreviewCard,
  category: "shared" as const,
  description:
    "繳交記錄預覽卡片，顯示狀態標籤、語言標籤、分數、執行時間（圖示）、記憶體使用量（圖示）",
  defaultArgs: {
    submission: mockSubmissions.accepted,
    showScore: true,
    compact: false,
  },
  argTypes: {
    showScore: {
      control: "boolean" as const,
      label: "Show Score",
      description: "是否顯示分數",
    },
    compact: {
      control: "boolean" as const,
      label: "Compact Mode",
      description: "緊湊模式（較小的顯示）",
    },
  },
};

const stories: Story<SubmissionPreviewCardProps>[] = [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props",
    render: (args) => (
      <SubmissionPreviewCard
        {...args}
        onClick={() => console.log("Card clicked")}
      />
    ),
    code: `<SubmissionPreviewCard
  submission={submission}
  showScore={true}
  compact={false}
  onClick={() => handleClick()}
/>`,
  },
  {
    name: "All Statuses",
    description: "所有狀態的顯示效果",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <SubmissionPreviewCard submission={mockSubmissions.accepted} />
        <SubmissionPreviewCard submission={mockSubmissions.wrongAnswer} />
        <SubmissionPreviewCard submission={mockSubmissions.timeLimitExceeded} />
        <SubmissionPreviewCard submission={mockSubmissions.memoryLimitExceeded} />
        <SubmissionPreviewCard submission={mockSubmissions.runtimeError} />
        <SubmissionPreviewCard submission={mockSubmissions.compileError} />
        <SubmissionPreviewCard submission={mockSubmissions.pending} />
        <SubmissionPreviewCard submission={mockSubmissions.judging} />
      </div>
    ),
    code: `// AC (Accepted)
<SubmissionPreviewCard submission={{ ...submission, status: "AC" }} />

// WA (Wrong Answer)
<SubmissionPreviewCard submission={{ ...submission, status: "WA" }} />

// TLE (Time Limit Exceeded)
<SubmissionPreviewCard submission={{ ...submission, status: "TLE" }} />`,
  },
  {
    name: "Languages",
    description: "不同程式語言的顯示（使用 Tag 呈現）",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <SubmissionPreviewCard
          submission={createMockSubmission({
            language: "Python",
            execTime: 152,
            memoryUsage: 10240,
          })}
        />
        <SubmissionPreviewCard
          submission={createMockSubmission({
            language: "C++",
            execTime: 12,
            memoryUsage: 2048,
          })}
        />
        <SubmissionPreviewCard
          submission={createMockSubmission({
            language: "Java",
            execTime: 85,
            memoryUsage: 32768,
          })}
        />
        <SubmissionPreviewCard
          submission={createMockSubmission({
            language: "JavaScript",
            execTime: 120,
            memoryUsage: 15360,
          })}
        />
      </div>
    ),
    code: `<SubmissionPreviewCard
  submission={{ ...submission, language: "Python" }}
/>`,
  },
  {
    name: "With Metrics",
    description: "顯示執行時間與記憶體使用量（圖示 + 數值）",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <SubmissionPreviewCard
          submission={createMockSubmission({
            status: "AC",
            execTime: 45,
            memoryUsage: 4096,
          })}
        />
        <SubmissionPreviewCard
          submission={createMockSubmission({
            status: "TLE",
            execTime: 2000,
            memoryUsage: 65536,
          })}
        />
        <SubmissionPreviewCard
          submission={createMockSubmission({
            status: "MLE",
            execTime: 150,
            memoryUsage: 524288,
          })}
        />
      </div>
    ),
    code: `<SubmissionPreviewCard
  submission={{
    ...submission,
    execTime: 45,      // 執行時間 (ms)
    memoryUsage: 4096  // 記憶體 (KB) -> 顯示為 4 MB
  }}
/>`,
  },
  {
    name: "Compact Mode",
    description: "緊湊模式適合在較小空間中使用",
    render: () => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          maxWidth: "500px",
        }}
      >
        <SubmissionPreviewCard
          submission={mockSubmissions.accepted}
          compact
        />
        <SubmissionPreviewCard
          submission={mockSubmissions.wrongAnswer}
          compact
        />
        <SubmissionPreviewCard
          submission={mockSubmissions.timeLimitExceeded}
          compact
        />
      </div>
    ),
    code: `<SubmissionPreviewCard
  submission={submission}
  compact
/>`,
  },
  {
    name: "Without Score",
    description: "不顯示分數（適用於不計分的情況）",
    render: () => (
      <SubmissionPreviewCard
        submission={mockSubmissions.accepted}
        showScore={false}
      />
    ),
    code: `<SubmissionPreviewCard
  submission={submission}
  showScore={false}
/>`,
  },
  {
    name: "Clickable Card",
    description: "可點擊的卡片，會有 hover 效果",
    render: () => (
      <SubmissionPreviewCard
        submission={mockSubmissions.accepted}
        onClick={() => alert("Card clicked!")}
      />
    ),
    code: `<SubmissionPreviewCard
  submission={submission}
  onClick={() => openDetailModal(submission.id)}
/>`,
  },
];

const storyModule: StoryModule<SubmissionPreviewCardProps> = {
  meta,
  stories,
};

export default storyModule;
