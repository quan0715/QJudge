"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const repoRoot = resolve(__dirname, "../../../..");
const projectSkills = [
  join(repoRoot, ".codex/skills/qjudge-ui-carbon-owner/SKILL.md"),
  join(repoRoot, ".codex/skills/qjudge-quality-gates-owner/SKILL.md"),
  join(repoRoot, ".codex/skills/qjudge-mobile-action-footer/SKILL.md"),
];
const overflowSkill = join(homedir(), ".codex/skills/qjudge-carbon-overflow-ux-fix/SKILL.md");

test("Carbon skills record the current MCP verification snapshot", () => {
  for (const skillPath of [...projectSkills, overflowSkill]) {
    const content = readFileSync(skillPath, "utf8");
    assert.match(content, /version: "2026\.08\.12"/, skillPath);
    assert.match(content, /carbon_mcp_verified: "2026-08-12"/, skillPath);
    assert.match(content, /carbon_reference_tag: "v11\.113\.0"/, skillPath);
  }
});

test("UI owner covers current component, accessibility, and public API decisions", () => {
  const skill = readFileSync(projectSkills[0], "utf8");
  const policy = readFileSync(
    join(repoRoot, ".codex/skills/qjudge-ui-carbon-owner/references/carbon-policy.md"),
    "utf8",
  );

  assert.match(skill, /audit-carbon-practices\.js/);
  for (const topic of [
    "Button",
    "TextInput",
    "Modal",
    "Notification",
    "Loading",
    "DataTable",
    "2x Grid",
    "public API",
  ]) {
    assert.match(policy, new RegExp(topic), topic);
  }
  assert.doesNotMatch(policy, /selectorsFloatingMenus=\{\['\.cds--modal'\]\}/);
  assert.match(policy, /app-owned selector/);
});

test("quality gate documents full audit and staged enforcement", () => {
  const skill = readFileSync(projectSkills[1], "utf8");
  assert.match(skill, /check-carbon-style\.sh --all/);
  assert.match(skill, /check-carbon-style\.sh --staged/);
  assert.match(skill, /audit-carbon-practices\.js/);
});

test("mobile and overflow skills include current viewport and accessibility checks", () => {
  const mobile = readFileSync(projectSkills[2], "utf8");
  const overflow = readFileSync(overflowSkill, "utf8");
  assert.match(mobile, /safe-area-inset-bottom/);
  assert.match(mobile, /accessible name/);
  assert.match(overflow, /100dvh/);
  assert.match(overflow, /390x844/);
});
