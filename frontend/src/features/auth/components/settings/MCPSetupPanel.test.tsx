import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MCPSetupPanel } from "./MCPSetupPanel";

describe("MCPSetupPanel", () => {
  it("shows the MCP endpoint on the current site origin", () => {
    render(<MCPSetupPanel />);

    expect(
      screen.getAllByText((content) => content.includes(`${window.location.origin}/mcp`)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText((content) => content.includes("mcp.q-judge.com"))).toBeNull();
  });
});
