import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/check-copilot-dogfood-boundary.js");
const fixtureRoots: string[] = [];

function runFixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "copilot-dogfood-"));
  fixtureRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync(process.execPath, [script, root], { encoding: "utf8" });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Copilot dogfood boundary", () => {
  it("accepts the real frontend source tree", () => {
    const output = execFileSync(
      process.execPath,
      [script],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toContain("Copilot dogfood boundary passed");
  }, 15_000);

  it.each([
    ["value import", 'import { CopilotPanel } from "@/shared/copilot";'],
    ["type import", 'import type { CopilotRun } from "@/core/copilot";'],
    ["re-export", 'export { CopilotPanel } from "@/shared/copilot/ui/CopilotPanel";'],
    ["dynamic import", 'const copilot = import("@/shared/copilot");'],
  ])("rejects a QJudge consumer %s from a Copilot implementation path", (_label, source) => {
    const result = runFixture({ "features/chatbot/consumer.ts": source });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot implementation import");
  });

  it("allows core and shared candidates to import Copilot implementation paths", () => {
    const result = runFixture({
      "core/copilot/runtime.ts": 'import type { CopilotRun } from "./copilot.types";',
      "shared/copilot/runtime.ts": 'import type { CopilotRun } from "../../core/copilot";',
    });

    expect(result.status).toBe(0);
  });

  it.each([
    "../../shared/copilot",
    "../../core/copilot",
    "../../shared/copilot/index",
    "../../core/copilot/copilot.types",
  ])("rejects a relative Copilot implementation import %s", (specifier) => {
    const result = runFixture({
      "features/chatbot/consumer.ts": `import type { CopilotRun } from "${specifier}";`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot implementation import");
  });

  it.each([
    [
      "commented static import",
      'import { CopilotPanel } from /* public facade only */ "@/shared/copilot";',
    ],
    [
      "commented dynamic import",
      'const copilot = import(/* public facade only */ "@/shared/copilot");',
    ],
    [
      "no-substitution template dynamic import",
      "const copilot = import(`@/shared/copilot`);",
    ],
    [
      "import equals declaration",
      'import type Copilot = require("@/shared/copilot");',
    ],
  ])("rejects an AST-recognized %s", (_label, source) => {
    const result = runFixture({ "features/chatbot/consumer.ts": source });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot implementation import");
  });

  it("rejects a type-level Copilot implementation import", () => {
    const result = runFixture({
      "features/chatbot/consumer.ts":
        'type Run = import("../../shared/copilot").CopilotRun;',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot implementation import");
  });

  it("ignores complete imports inside comments", () => {
    const result = runFixture({
      "features/chatbot/history.ts": [
        '// import { CopilotPanel } from "@/shared/copilot";',
        '/* const copilot = import("@/core/copilot"); */',
      ].join("\n"),
    });

    expect(result.status).toBe(0);
  });

  it("rejects unapproved Copilot package subpaths", () => {
    const result = runFixture({
      "features/chatbot/consumer.ts": 'import { internal } from "@copilot/internal";',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unapproved @copilot subpath");
  });

  it("rejects the testing entry from production", () => {
    const result = runFixture({
      "features/chatbot/consumer.ts":
        'import { MemoryCopilotTransport } from "@copilot/testing";',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("testing import in production");
  });

  it.each([
    "features/chatbot/consumer.test.ts",
    "features/chatbot/consumer.test.integration.ts",
    "features/chatbot/consumer.spec.tsx",
    "features/chatbot/consumer.stories.tsx",
    "features/chatbot/__tests__/consumer.ts",
    "features/chatbot/test/consumer.ts",
    "features/chatbot/tests/consumer.ts",
    "features/chatbot/fixtures/consumer.ts",
  ])("allows the testing entry in non-production file %s", (file) => {
    const result = runFixture({
      [file]: 'import { MemoryCopilotTransport } from "@copilot/testing";',
    });

    expect(result.status).toBe(0);
  });

  it("does not classify a production filename containing test as a test", () => {
    const result = runFixture({
      "features/chatbot/LatestSession.ts":
        'import { MemoryCopilotTransport } from "@copilot/testing";',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("testing import in production");
  });

  it.each([
    '@/infrastructure/api/repositories/chatbot.repository',
    '@/infrastructure/api/repositories',
    '../../../infrastructure/api/repositories',
  ])("rejects Copilot-related production imports from repository specifier %s", (specifier) => {
    const result = runFixture({
      "features/chatbot/consumer.ts": [
        'import { CopilotPanel } from "@copilot";',
        `import repository from "${specifier}";`,
      ].join("\n"),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot repository import outside infrastructure/copilot");
  });

  it("treats every features/chatbot production file as Copilot-related", () => {
    const result = runFixture({
      "features/chatbot/ChatContainer.tsx": [
        'import { QJudgeChatPanel } from "./QJudgeChatPanel";',
        'import { chatbotRepository } from "@/infrastructure/api/repositories";',
      ].join("\n"),
      "features/chatbot/QJudgeChatPanel.tsx": "export const QJudgeChatPanel = null;",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot repository import outside infrastructure/copilot");
  });

  it.each([
    [
      "relative Copilot consumer",
      "features/tools/consumer.ts",
      'import type { CopilotRun } from "../../shared/copilot";',
    ],
    ["Copilot-named path", "features/tools/copilotConsumer.ts", "export const copilotAdapter = true;"],
  ])("treats a %s as Copilot-related for repository imports", (_label, file, copilotSource) => {
    const result = runFixture({
      [file]: [
        copilotSource,
        'import { chatbotRepository } from "@/infrastructure/api/repositories";',
      ].join("\n"),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Copilot repository import outside infrastructure/copilot");
  });

  it("allows Copilot repository imports only in infrastructure/copilot", () => {
    const result = runFixture({
      "infrastructure/copilot/qJudgeCopilotTransport.ts":
        'import repository from "@/infrastructure/api/repositories/chatbot.repository";',
      "features/contest/ordinaryConsumer.ts":
        'import { getContest } from "@/infrastructure/api/repositories";',
    });

    expect(result.status).toBe(0);
  });
});
