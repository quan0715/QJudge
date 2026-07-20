import { describe, expect, it } from "vitest";
import * as copilot from "@copilot";

describe("Copilot public API", () => {
  it("exports production APIs without testing helpers", () => {
    for (const name of [
      "CopilotProvider",
      "CopilotPanel",
      "useCopilot",
      "useCopilotSessions",
      "useCopilotRun",
      "useCopilotComposer",
      "useCopilotModels",
      "useCopilotScroll",
      "useCopilotSessionLocation",
      "CopilotWorkspaceShell",
      "CopilotFullPageShell",
      "CopilotEmbedShell",
    ]) {
      expect(copilot).toHaveProperty(name);
    }
    expect(copilot).not.toHaveProperty("MemoryCopilotTransport");
    expect(copilot).not.toHaveProperty("MemoryCopilotModelCatalog");
  });
});
