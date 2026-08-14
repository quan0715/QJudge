import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../../../");
const script = resolve(import.meta.dirname, "audit-carbon-practices.js");
const gatedRules = new Set([
  "clickable-noninteractive-element",
  "carbon-form-label-review",
  "carbon-loading-label-review",
  "carbon-modal-label-review",
  "small-button-in-navigation",
  "native-button-type-review",
  "native-form-label-review",
  "notification-title-review",
]);

test("production has no high-confidence Carbon accessibility candidates", () => {
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [script, "--root", "frontend/src", "--format", "json"],
      { cwd: repositoryRoot, encoding: "utf8" },
    ),
  );
  const remaining = report.findings
    .filter(
      (finding) =>
        finding.disposition === "review" && gatedRules.has(finding.rule),
    )
    .map(
      ({ path, line, rule }) => `${path}:${line} ${rule}`,
    );

  assert.deepEqual(remaining, []);
});
