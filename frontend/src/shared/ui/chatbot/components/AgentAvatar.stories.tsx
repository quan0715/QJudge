import type { Meta, StoryObj } from "@storybook/react";
import { AgentAvatar } from "./AgentAvatar";

const meta: Meta<typeof AgentAvatar> = {
    title: "shared/ui/chatbot/AgentAvatar",
    component: AgentAvatar,
    
    args: {
      size: "md",
    },
    argTypes: {
      size: {
        control: "radio",
        options: ["sm", "md", "lg"],
        description: "頭像尺寸 - sm: 24px, md: 32px, lg: 48px",
      },
    },
  
  parameters: {
    docs: { description: { component: 'AI Agent 頭像組件，支援三種尺寸。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  parameters: {
    docs: {
      description: { story: '展示三種不同尺寸的 Agent 頭像。' },
    },
  },
  render: () => (
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "12px", marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              Small (24px)
            </p>
            <AgentAvatar size="sm" />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "12px", marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              Medium (32px)
            </p>
            <AgentAvatar size="md" />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "12px", marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }}>
              Large (48px)
            </p>
            <AgentAvatar size="lg" />
          </div>
        </div>
      ),
};

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: '默認尺寸（Medium）' },
    },
  },
  render: (args) => <AgentAvatar size={args.size as "sm" | "md" | "lg"} />,
};
