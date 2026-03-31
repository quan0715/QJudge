import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SubmissionPreviewCard,
} from "./SubmissionPreviewCard";
import {
  mockSubmissions,
} from "@/shared/mocks";

const meta: Meta<typeof SubmissionPreviewCard> = {
  title: "shared/ui/submission/SubmissionPreviewCard",
  component: SubmissionPreviewCard,
  
  args: {
    submission: mockSubmissions.accepted,
    showScore: true,
    compact: false,
  },
  argTypes: {
    showScore: {
      control: "boolean" as const,
            description: "是否顯示分數",
    },
    compact: {
      control: "boolean" as const,
            description: "緊湊模式（較小的顯示）",
    },
  },

  parameters: {
    docs: { description: { component: '繳交記錄預覽卡片，顯示狀態標籤、語言標籤、分數、執行時間（圖示）、記憶體使用量（圖示）' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { submission: mockSubmissions.accepted, onClick: () => console.log("Card clicked") },
};

export const AllStatuses: Story = {
  parameters: { docs: { description: { story: "\u6240\u6709\u72c0\u614b\u7684\u986f\u793a\u6548\u679c" } } },
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
};

export const CompactMode: Story = {
  parameters: { docs: { description: { story: "\u7DCA\u6E4A\u6A21\u5F0F\u9069\u5408\u5728\u8F03\u5C0F\u7A7A\u9593\u4E2D\u4F7F\u7528" } } },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxWidth: "500px" }}>
      <SubmissionPreviewCard submission={mockSubmissions.accepted} compact />
      <SubmissionPreviewCard submission={mockSubmissions.wrongAnswer} compact />
      <SubmissionPreviewCard submission={mockSubmissions.timeLimitExceeded} compact />
    </div>
  ),
};
