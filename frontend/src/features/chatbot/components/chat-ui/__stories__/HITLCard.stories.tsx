import type { Meta, StoryObj } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";

import i18n from "@/i18n";
import { HITLCard } from "../HITLCard";
import { mockApprovalRequest } from "./chat-ui.mocks";

const meta: Meta<typeof HITLCard> = {
  title: "features/chatbot/chat-ui/HITLCard",
  component: HITLCard,
  parameters: {
    docs: {
      description: {
        component: "Human-in-the-loop 確認卡 — AI 執行敏感操作前需要使用者核准。顯示工具名稱 + 參數，提供 確認/取消 按鈕。",
      },
    },
  },
  args: {
    onSubmit: () => {},
  },
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ maxWidth: 700, padding: "1rem" }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    request: mockApprovalRequest,
  },
};

export const NoArgs: Story = {
  name: "無參數",
  args: {
    request: {
      actions: [{ name: "qjudge_discover", arguments: {} }],
      allowedDecisions: ["approve", "reject"],
    },
  },
};

export const NestedArguments: Story = {
  name: "巢狀與列表參數",
  args: {
    request: {
      actions: [
        {
          name: "qjudge_grading",
          arguments: {
            action: "batch_grade",
            grades: [
              { exam_answer_id: "164488", score: 2 },
              { exam_answer_id: "164489", score: 3 },
            ],
            options: { notify_students: false },
          },
        },
      ],
      allowedDecisions: ["approve", "reject"],
    },
  },
};
