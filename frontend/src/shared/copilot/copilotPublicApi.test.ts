import { describe, expect, it } from "vitest";
import * as copilot from ".";

describe("Copilot public API", () => {
  it("exports the approved runtime, hooks and shells without testing helpers", () => {
    for (const name of ["CopilotProvider", "useCopilot", "useCopilotSessions", "useCopilotRun", "useCopilotComposer", "useCopilotScroll", "useCopilotSessionLocation", "CopilotWorkspaceShell", "CopilotFullPageShell", "CopilotEmbedShell"]) {
      expect(copilot).toHaveProperty(name);
    }
    expect(copilot).not.toHaveProperty("testing");
    expect(copilot).not.toHaveProperty("MemoryCopilotTransport");
  });
});
