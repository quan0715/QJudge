"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
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

function runStagedFixture(t, stagedContent, workingTreeContent) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-carbon-staged-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "Component.module.scss");
  const runGit = (...args) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8" });

  assert.equal(runGit("init", "--quiet").status, 0);
  assert.equal(runGit("config", "user.email", "gate@example.test").status, 0);
  assert.equal(runGit("config", "user.name", "Gate Test").status, 0);
  writeFileSync(file, ".root { color: var(--cds-text-primary); }");
  assert.equal(runGit("add", "Component.module.scss").status, 0);
  assert.equal(runGit("commit", "--quiet", "-m", "fixture").status, 0);

  writeFileSync(file, stagedContent);
  assert.equal(runGit("add", "Component.module.scss").status, 0);
  writeFileSync(file, workingTreeContent);
  return spawnSync("bash", [script, "--staged"], {
    cwd: root,
    encoding: "utf8",
  });
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

test("all-scope gate rejects runtime Carbon spacing variables", (t) => {
  const result = runFixture(t, {
    "BadSpacing.module.scss": `.root { padding: var(--cds-spacing-05, 1rem); }`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /invalid-carbon-spacing-variable/);
});

test("staged gate reads the index instead of a clean working-tree version", (t) => {
  const result = runStagedFixture(
    t,
    ".root .cds--btn { color: red !important; }",
    ".root { color: var(--cds-text-primary); }",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Component\.module\.scss/);
  assert.match(result.stderr, /Carbon internal selectors/);
  assert.match(result.stderr, /!important/);
});

test("staged gate ignores an unstaged blocker absent from the index", (t) => {
  const result = runStagedFixture(
    t,
    ".root { color: var(--cds-text-primary); }",
    ".root .cds--btn { color: red !important; }",
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("staged gate rejects invalid spacing variables and accepts Sass tokens", (t) => {
  const blocked = runStagedFixture(
    t,
    ".root { padding: var(--cds-spacing-05); }",
    '@use "@carbon/layout";\n.root { padding: layout.$spacing-05; }',
  );
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /does not emit --cds-spacing/);

  const clean = runStagedFixture(
    t,
    '@use "@carbon/layout";\n.root { padding: layout.$spacing-05; }',
    ".root { padding: var(--cds-spacing-05); }",
  );
  assert.equal(clean.status, 0, clean.stderr || clean.stdout);
});

test("help documents staged and all scopes", () => {
  const result = spawnSync("bash", [script, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--staged/);
  assert.match(result.stdout, /--all/);
});
