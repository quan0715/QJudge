import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../../../");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/ci.yml"),
  "utf8",
);

test("CI blocks frontend naming, architecture, and Carbon strict regressions", () => {
  assert.match(workflow, /\.codex\/skills\/qjudge-\*\/\*\*/);
  assert.match(workflow, /lint-naming\.js --root frontend\/src/);
  assert.match(
    workflow,
    /lint-architecture\.js --root frontend\/src/,
  );
  assert.doesNotMatch(workflow, /--policy compat/);
  assert.match(workflow, /lint-repository-exports\.js/);
  assert.match(workflow, /check-carbon-style\.sh --all/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(
    workflow,
    /node --test \.codex\/skills\/qjudge-quality-gates-owner\/scripts\/\*\.test\.js/,
  );
});
