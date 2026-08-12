import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../../../");
const auditScript = resolve(import.meta.dirname, "audit-carbon-practices.js");
const spacingFixer = resolve(
  import.meta.dirname,
  "fix-carbon-spacing-tokens.js",
);
const budget = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../references/carbon-manual-review-budget.json",
    ),
    "utf8",
  ),
);

test("manual Carbon review debt can only decrease", () => {
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [auditScript, "--root", "frontend/src", "--format", "json"],
      { cwd: repositoryRoot, encoding: "utf8" },
    ),
  );
  const actual = new Map();
  for (const finding of report.findings) {
    if (finding.disposition !== "review") continue;
    actual.set(finding.rule, (actual.get(finding.rule) || 0) + 1);
  }

  assert.deepEqual(
    [...actual.keys()].filter((rule) => !budget.rules[rule]),
    [],
    "Every review rule must have an explicit manual-review rationale",
  );
  for (const [rule, entry] of Object.entries(budget.rules)) {
    assert.ok(entry.reason, `${rule} needs a review rationale`);
    assert.ok(
      (actual.get(rule) || 0) <= entry.max,
      `${rule} grew from its budget of ${entry.max} to ${actual.get(rule)}`,
    );
  }
});

test("no exact spacing-token replacement remains", () => {
  const output = execFileSync(
    process.execPath,
    [spacingFixer, "--root", "frontend/src"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.match(output, /Would update 0 style file\(s\)/);
});
