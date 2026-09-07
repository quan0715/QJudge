"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const repoRoot = resolve(__dirname, "../../../..");

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("AI model registry skill follows the AI-service-owned registry contract", () => {
  const skill = read(".codex/skills/qjudge-ai-model-registry/SKILL.md");
  const touchPoints = read(
    ".codex/skills/qjudge-ai-model-registry/references/touch-points.md",
  );
  const combined = `${skill}\n${touchPoints}`;

  assert.match(combined, /ai-service\/domain\/model_registry\.py/);
  assert.match(combined, /ai-service\/infrastructure\/agent\/model_factory\.py/);
  assert.match(combined, /\/v1\/models/);
  assert.match(combined, /defers? .*validation.*AI Service/i);
  assert.doesNotMatch(combined, /ai-service\/services\/model_factory\.py/);
  assert.doesNotMatch(combined, /DEFAULT_MODEL_PRICING/);
  assert.doesNotMatch(combined, /FALLBACK_MODELS/);
  assert.doesNotMatch(combined, /backend\/apps\/ai\/models\.py/);
});

test("Compose skill documents the current test stack and test-first commands", () => {
  const skill = read(".codex/skills/qjudge-env-compose-owner/SKILL.md");
  const matrix = read(
    ".codex/skills/qjudge-env-compose-owner/references/environment-matrix.md",
  );

  for (const service of [
    "backend-test",
    "frontend-test",
    "ai-service",
    "ai-worker",
    "ai-scheduler",
    "celery-test",
    "celery-high-test",
  ]) {
    assert.ok(matrix.includes(`\`${service}\``), service);
  }
  assert.match(skill, /tests? .*test.* environment/i);
  assert.doesNotMatch(matrix, /dev exec -T backend pytest/);
  assert.match(matrix, /POSTGRES_USER=qjudge_test_admin/);
  assert.match(matrix, /backend-test pytest -q/);
  assert.match(skill, /cannot create Django's temporary test database/);
});

test("Quality-gate skill identifies Carbon strict as the current CI hard gate", () => {
  const skill = read(".codex/skills/qjudge-quality-gates-owner/SKILL.md");
  const profiles = read(
    ".codex/skills/qjudge-quality-gates-owner/references/quality-profiles.md",
  );
  const combined = `${skill}\n${profiles}`;

  assert.match(combined, /strict.*CI hard gate/is);
  assert.match(combined, /--all/);
  assert.match(combined, /--staged/);
  assert.doesNotMatch(combined, /compat \(default\)/i);
  assert.doesNotMatch(combined, /歷史債未清完前可不阻擋 release/);
});

test("Exam grading SOP matches the current MCP payload and acknowledgement", () => {
  const skill = read(
    "ai-service/.deepagents/skills/qjudge-exam-grading-sop/SKILL.md",
  );

  assert.match(skill, /action="batch_grade"[\s\S]*contest_id=<X>/);
  assert.match(skill, /reason.*feedback|feedback.*reason/is);
  assert.match(skill, /graded_count/);
  assert.match(skill, /error_count/);
  assert.match(skill, /error_count.*0[\s\S]*synced/is);
  assert.match(skill, /size_bytes/);
  assert.match(skill, /180[,_]000/);
  assert.doesNotMatch(skill, /重複視為 no-op/);
  assert.equal(
    existsSync(join(repoRoot, "ai-service/.deepagents/skills/rubric.md")),
    false,
    "session-specific rubric must not ship in the runtime skill directory",
  );
});

test("MCP operator routes read-only exam previews through preview_exam_problem", () => {
  const skill = read(
    "ai-service/.deepagents/skills/qjudge-mcp-tool-operator/SKILL.md",
  );
  const routing = read(
    "ai-service/.deepagents/skills/qjudge-mcp-tool-operator/references/mcp-routing.md",
  );

  assert.match(skill, /description: Use when/);
  assert.match(routing, /preview_exam_problem/);
  assert.match(
    routing,
    /preview_exam_problem[\s\S]*qjudge_exam\(action="update"\)/,
  );
});

test("TA protocol distinguishes writable scratch from the read-only skill mount", () => {
  const skill = read("ai-service/.deepagents/skills/qjudge-ta-protocol/SKILL.md");

  assert.match(skill, /description: Use when/);
  assert.match(skill, /StateBackend/);
  assert.match(skill, /\/app\/\.deepagents/);
  assert.match(skill, /artifact_write/);
  assert.doesNotMatch(skill, /write_file.*edit_file.*不可用/);
  assert.doesNotMatch(skill, /檔案類工具（已關閉寫入）/);
});

test("UI skill follows Storybook auto-discovery without a manual registry", () => {
  const skill = read(".codex/skills/qjudge-ui-carbon-owner/SKILL.md");
  const storybookPath =
    ".codex/skills/qjudge-ui-carbon-owner/references/storybook.md";
  assert.equal(existsSync(join(repoRoot, storybookPath)), true);
  const storybook = read(
    storybookPath,
  );

  assert.match(skill, /\.storybook\/main\.ts/);
  assert.match(storybook, /automatically loads/);
  assert.match(storybook, /no manual registry/);
  assert.doesNotMatch(skill, /stories (and|與) registry/i);
  assert.equal(
    existsSync(
      join(
        repoRoot,
        ".codex/skills/qjudge-ui-carbon-owner/references/storybook-registry.md",
      ),
    ),
    false,
  );
});

test("Mobile footer skill describes the shared component that currently ships", () => {
  const skill = read(".codex/skills/qjudge-mobile-action-footer/SKILL.md");

  assert.match(skill, /single action.*full width|單一.*全寬/is);
  assert.match(skill, /does not.*safe-area|尚未.*safe-area/is);
  assert.doesNotMatch(skill, /單一 action 時按鈕佔右半邊/);
  assert.doesNotMatch(skill, /shared footer 必須集中處理/);
});

test("CSV editor guards QJudge grading from truncation and payload drift", () => {
  const skill = read("ai-service/.deepagents/skills/csv-editor/SKILL.md");

  assert.match(skill, /description: Use when/);
  assert.match(skill, /size_bytes/);
  assert.match(skill, /180[,_]000/);
  assert.match(skill, /contest_id=<X>/);
  assert.match(skill, /feedback/);
  assert.doesNotMatch(
    skill,
    /qjudge_grading\(action="batch_grade", grades=batch\["records"\]\)/,
  );
});

test("root Claude guidance routes QJudge work through current owner skills", () => {
  const guidance = read("CLAUDE.md");

  for (const owner of [
    "qjudge-architecture-owner",
    "qjudge-env-compose-owner",
    "qjudge-github-workflow-owner",
    "qjudge-quality-gates-owner",
    "qjudge-ui-carbon-owner",
  ]) {
    assert.match(guidance, new RegExp(owner));
  }

  assert.doesNotMatch(guidance, /qjudge-clean-arch-workflow/);
  assert.doesNotMatch(guidance, /qjudge-pr-workflow/);
  assert.doesNotMatch(guidance, /ta-agent PR/);
  assert.doesNotMatch(guidance, /cd backend\s+python manage\.py/s);
});
