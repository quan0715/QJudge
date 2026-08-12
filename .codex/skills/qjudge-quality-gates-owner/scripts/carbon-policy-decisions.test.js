import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../../../");
const script = resolve(import.meta.dirname, "audit-carbon-practices.js");
const decisionFile = resolve(
  import.meta.dirname,
  "../references/carbon-audit-decisions.json",
);

test("Carbon policy decisions are exact, current, and leave no lifecycle candidates", () => {
  const manifest = JSON.parse(readFileSync(decisionFile, "utf8"));
  const ids = manifest.decisions.map((decision) => decision.id);
  assert.equal(new Set(ids).size, ids.length, "Decision ids must be unique");

  for (const decision of manifest.decisions) {
    assert.ok(decision.reason, `${decision.id} needs a reason`);
    assert.ok(decision.owner, `${decision.id} needs an owner`);
    assert.ok(
      decision.removalCondition,
      `${decision.id} needs a removal condition`,
    );
    for (const relativePath of decision.paths) {
      assert.ok(
        existsSync(resolve(repositoryRoot, "frontend/src", relativePath)),
        `${decision.id} references a missing file: ${relativePath}`,
      );
    }
  }

  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [script, "--root", "frontend/src", "--format", "json"],
      { cwd: repositoryRoot, encoding: "utf8" },
    ),
  );
  const lifecycleRules = new Set([
    "raw-interactive-control",
    "notification-variant-review",
  ]);
  const pending = report.findings.filter(
    (finding) =>
      lifecycleRules.has(finding.rule) && finding.disposition === "review",
  );
  const undocumented = report.findings.filter(
    (finding) =>
      finding.disposition === "policy-reviewed" && !finding.decision?.id,
  );

  assert.deepEqual(pending, []);
  assert.deepEqual(undocumented, []);
});
