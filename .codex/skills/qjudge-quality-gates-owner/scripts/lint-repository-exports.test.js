"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const script = resolve(__dirname, "lint-repository-exports.js");
const repositoryRoot = resolve(__dirname, "../../../../");

function runFixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-repository-exports-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync(
    process.execPath,
    [
      script,
      "--root",
      join(root, "src/repositories"),
      "--source-root",
      join(root, "src"),
      "--tsconfig",
      join(root, "missing-tsconfig.json"),
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

test("rejects repository exports with no external consumer", (t) => {
  const result = runFixture(t, {
    "src/repositories/example.repository.ts":
      "export const used = 1; export const stale = 2;",
    "src/consumer.ts":
      'import { used } from "./repositories/example.repository"; void used;',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale/);
  assert.doesNotMatch(result.stderr, /: used/);
});

test("does not count an unconsumed barrel re-export as usage", (t) => {
  const result = runFixture(t, {
    "src/repositories/example.repository.ts": "export const stale = 2;",
    "src/repositories/index.ts":
      'export { stale } from "./example.repository";',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale/);
});

test("accepts named and default exports consumed through the source tree", (t) => {
  const result = runFixture(t, {
    "src/repositories/example.repository.ts":
      "export const used = 1; export default { used };",
    "src/consumer.ts": [
      'import repository from "./repositories/example.repository";',
      'import { used } from "./repositories/example.repository";',
      "void repository; void used;",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
});
