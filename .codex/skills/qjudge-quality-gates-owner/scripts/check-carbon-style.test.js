"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const script = resolve(__dirname, "check-carbon-style.sh");

function runFixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-carbon-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync("bash", [script, "--all", "--root", root], { encoding: "utf8" });
}

test("all-scope gate passes a clean Carbon fixture", (t) => {
  const result = runFixture(t, {
    "Clean.module.scss": `.root { color: var(--cds-text-primary); }`,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("all-scope gate rejects Carbon internals and important declarations", (t) => {
  const result = runFixture(t, {
    "Bad.module.scss": `.root .cds--btn { color: red !important; padding: 1rem; }`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /carbon-internal-selector/);
  assert.match(result.stdout, /important-declaration/);
  assert.doesNotMatch(result.stdout, /hardcoded-spacing/);
});

test("help documents staged and all scopes", () => {
  const result = spawnSync("bash", [script, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--staged/);
  assert.match(result.stdout, /--all/);
});
