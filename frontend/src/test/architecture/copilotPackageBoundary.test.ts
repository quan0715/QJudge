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

const script = resolve(process.cwd(), "scripts/check-copilot-package-boundary.js");
const fixtureRoots: string[] = [];

function runFixture(
  files: Record<string, string>,
  candidate: "core" | "shared" = "core",
) {
  const root = mkdtempSync(join(tmpdir(), "copilot-package-"));
  fixtureRoots.push(root);
  const candidateRoot = join(root, candidate, "copilot");
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(candidateRoot, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync(process.execPath, [script, candidateRoot], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Copilot package boundary", () => {
  it("accepts the real Copilot candidate roots", () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(output).toContain("Copilot package boundary passed (2 roots)");
  });

  it.each([
    ["product feature", "@/features/chatbot"],
    ["QJudge repository", "@/infrastructure/api/repositories"],
    ["QJudge Copilot infrastructure", "@/infrastructure/copilot"],
    ["legacy chatbot type", "@/core/types/chatbot.types"],
    ["router", "react-router-dom"],
    ["i18n runtime", "i18next"],
    ["Carbon", "@carbon/react"],
  ])("rejects a blocked %s import", (reason, specifier) => {
    const result = runFixture({
      "consumer.ts": `import value from "${specifier}";`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`blocked ${reason} import '${specifier}'`);
  });

  it.each([
    ["side-effect import", 'import "@/features/chatbot";'],
    ["dynamic import", 'void import("@/features/chatbot");'],
    ["template dynamic import", "void import(`@/features/chatbot`);"],
    ["type import", 'import type { Chat } from "@/features/chatbot";'],
    ["named re-export", 'export { Chat } from "@/features/chatbot";'],
    ["star re-export", 'export * from "@/features/chatbot";'],
    ["type-level import", 'type Chat = import("@/features/chatbot").Chat;'],
    [
      "import-equals declaration",
      'import Chatbot = require("@/features/chatbot");',
    ],
  ])("rejects a blocked %s", (_label, source) => {
    const result = runFixture({ "consumer.ts": source });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("blocked product feature import");
  });

  it("ignores import-like text in comments, strings, and regexes", () => {
    const result = runFixture({
      "history.ts": [
        '// import "@/features/chatbot";',
        '/* export { Chat } from "@/features/chatbot"; */',
        'const message = `import("@/infrastructure/copilot")`;',
        'const pattern = /from ["\u0027]@\\/core\\/types\\/chatbot\\.types["\u0027]/;',
      ].join("\n"),
    });

    expect(result.status).toBe(0);
  });

  it.each([
    ["product feature", "../../../features/chatbot"],
    ["QJudge repository", "../../../infrastructure/api/repositories"],
    [
      "QJudge Copilot infrastructure",
      "../../../infrastructure/copilot/qJudgeCopilotTransport",
    ],
    ["legacy chatbot type", "../../../core/types/chatbot.types"],
  ])("rejects a relative import resolving to blocked %s", (reason, specifier) => {
    const result = runFixture(
      {
        "react/consumer.ts": `import value from "${specifier}";`,
      },
      "shared",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`blocked ${reason} import '${specifier}'`);
  });

  it("rejects a static require of QJudge-specific infrastructure", () => {
    const result = runFixture({
      "consumer.ts":
        'const transport = require("@/infrastructure/copilot");',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("blocked QJudge Copilot infrastructure import");
  });

  it("ignores require-like text and dynamic module expressions", () => {
    const result = runFixture({
      "history.ts": [
        '// require("@/infrastructure/copilot");',
        'const message = `require("@/features/chatbot")`;',
        'const pattern = /require\\("@\\/core\\/types\\/chatbot\\.types"\\)/;',
        "const required = require(moduleName);",
        "const imported = import(moduleName);",
      ].join("\n"),
    });

    expect(result.status).toBe(0);
  });

  it("allows relative imports within or between Copilot candidate roots", () => {
    const result = runFixture(
      {
        "react/consumer.ts": [
          'import { model } from "../model";',
          'import type { CopilotRun } from "../../../core/copilot";',
        ].join("\n"),
        "model.ts": "export const model = true;",
      },
      "shared",
    );

    expect(result.status).toBe(0);
  });

  it("allows React only under shared/copilot", () => {
    const coreResult = runFixture({
      "consumer.ts": 'import React from "react";',
    });
    const sharedResult = runFixture(
      { "consumer.tsx": 'import React from "react";' },
      "shared",
    );

    expect(coreResult.status).toBe(1);
    expect(coreResult.stderr).toContain("React is only allowed under shared/copilot");
    expect(sharedResult.status).toBe(0);
  });

  it.each([".cds--button", ".bx--button", "color: red !important"])(
    "rejects blocked style token %s",
    (token) => {
      const result = runFixture({ "styles.scss": `.target { ${token} }` });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("blocked style token");
    },
  );
});
