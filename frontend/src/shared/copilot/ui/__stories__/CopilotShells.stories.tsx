import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopilotProvider } from "../../react/CopilotProvider";
import { MemoryCopilotTransport } from "../../testing";
import { CopilotEmbedShell } from "../CopilotEmbedShell";
import { CopilotFullPageShell } from "../CopilotFullPageShell";
import { CopilotWorkspaceShell } from "../CopilotWorkspaceShell";

const meta = { title: "Copilot/Shells", component: CopilotFullPageShell, decorators: [(Story) => <CopilotProvider transport={new MemoryCopilotTransport()} initialSession="create"><Story /></CopilotProvider>] } satisfies Meta<typeof CopilotFullPageShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FullPageSidebar: Story = { args: { history: "sidebar" } };
export const FullPageDrawer: Story = { args: { history: "drawer" } };
export const WorkspaceDesktop: Story = { render: () => <CopilotWorkspaceShell defaultOpen><div style={{ minHeight: 400 }}>Workspace</div></CopilotWorkspaceShell> };
export const WorkspaceDisabled: Story = { render: () => <CopilotWorkspaceShell disabled><div>Workspace</div></CopilotWorkspaceShell> };
export const EmbedCompact: Story = { render: () => <div style={{ height: 360, width: 320 }}><CopilotEmbedShell /></div> };
