"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const script = resolve(__dirname, "lint-naming.js");

function runFixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-naming-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync(process.execPath, [script, "--root", root, "--files-only"], {
    encoding: "utf8",
  });
}

test("allows Context and Provider components in context directories", (t) => {
  const result = runFixture(t, {
    "features/chatbot/contexts/ChatRuntimeContext.tsx": "export {};",
    "features/chatbot/contexts/QJudgeCopilotProvider.tsx": "export {};",
    "features/chatbot/contexts/QJudgeCopilotProvider.test.tsx": "export {};",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("allows camel-case use-prefixed TSX hook files and their tests", (t) => {
  const result = runFixture(t, {
    "shared/copilot/hooks/useCopilotModels.tsx": "export {};",
    "shared/copilot/hooks/useCopilotModels.test.tsx": "export {};",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("keeps rejecting unrelated context components and non-hook names", (t) => {
  const result = runFixture(t, {
    "features/chatbot/contexts/ChatRuntimePanel.tsx": "export {};",
    "shared/copilot/hooks/copilotModels.test.tsx": "export {};",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Context file must end with Context/);
  assert.match(result.stderr, /Hook file must start with use/);
});
