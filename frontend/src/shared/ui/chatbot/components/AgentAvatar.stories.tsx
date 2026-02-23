import type { StoryModule } from "@/shared/types/story.types";
import { AgentAvatar } from "./AgentAvatar";

const storyModule: StoryModule = {
  meta: {
    title: "shared/ui/chatbot/AgentAvatar",
    component: AgentAvatar,
    category: "features",
    description: "AI Agent 頭像組件，支援三種尺寸。",
    defaultArgs: {
      size: "md",
    },
    argTypes: {
      size: {
        control: "radio",
        options: ["sm", "md", "lg"],
        description: "頭像尺寸 - sm: 24px, md: 32px, lg: 48px",
      },
    },
  },
  stories: [
    {
      name: "Sizes",
      description: "展示三種不同尺寸的 Agent 頭像。",
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
    },
    {
      name: "Default",
      description: "默認尺寸（Medium）",
      render: (args) => <AgentAvatar size={args.size as "sm" | "md" | "lg"} />,
    },
  ],
};

export default storyModule;
