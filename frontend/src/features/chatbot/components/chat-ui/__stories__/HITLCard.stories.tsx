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

const manyActions = Array.from({ length: 6 }, (_, index) => ({
  name: "qjudge_exam",
  arguments: {
    action: "create",
    question_type: "single_choice",
    prompt: `第 ${index + 1} 題：請說明下列敘述何者正確，並考慮較長題幹的顯示情形。`,
    options: ["選項一", "選項二", "選項三", "選項四"],
    correct_answer: 0,
    score: 5,
  },
}));

export const LongActionsInConstrainedPanel: Story = {
  name: "多個動作於固定高度面板",
  parameters: {
    docs: {
      description: {
        story:
          "動作內容超過面板高度時，卡片內的動作清單自行捲動，標題與確認/取消按鈕保持可見可按。",
      },
    },
  },
  args: {
    request: {
      actions: manyActions,
      allowedDecisions: ["approve", "reject"],
    },
  },
  decorators: [
    (Story) => (
      <div
        className="copilot-conversation"
        style={{ height: 420, width: 420, border: "1px solid var(--cds-border-subtle)" }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0.5rem 1rem" }}>
          對話訊息區
        </div>
        <Story />
        <div style={{ flex: "none", padding: "0.75rem 1rem" }}>輸入框</div>
      </div>
    ),
  ],
};
