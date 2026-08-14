import { CopilotFullPageShell, CopilotProvider } from "@copilot";
import { MemoryCopilotTransport } from "@copilot/testing";

const transport = new MemoryCopilotTransport();

export default function App() {
  return <CopilotProvider transport={transport} initialSession="create"><CopilotFullPageShell /></CopilotProvider>;
}
