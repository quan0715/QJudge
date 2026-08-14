import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceShellScss = readFileSync(
  resolve(
    process.cwd(),
    "src/features/chatbot/components/workspace/WorkspaceShell.module.scss",
  ),
  "utf8",
);

describe("WorkspaceShell layout contract", () => {
  it("provides a column flex container so full-height route content can grow", () => {
    const contentRule = workspaceShellScss.match(/\.content\s*\{([^}]*)\}/)?.[1];

    expect(contentRule).toBeDefined();
    expect(contentRule).toMatch(/display:\s*flex\s*;/);
    expect(contentRule).toMatch(/flex-direction:\s*column\s*;/);
  });
});
