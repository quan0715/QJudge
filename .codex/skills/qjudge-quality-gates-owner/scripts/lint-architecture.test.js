"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const script = resolve(__dirname, "lint-architecture.js");

function runFixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-architecture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return spawnSync(
    process.execPath,
    [script, "--root", root],
    { encoding: "utf8" },
  );
}

test("strict policy rejects core usecases importing infrastructure barrels", (t) => {
  const result = runFixture(t, {
    "core/usecases/joinContest.usecase.ts":
      'import { registerContest } from "@/infrastructure/api/repositories";',
    "infrastructure/api/repositories/index.ts": "export const registerContest = () => {};",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Not allowed by rule: core\/usecases/);
});

test("strict policy resolves dot-notation repository module names", (t) => {
  const result = runFixture(t, {
    "core/usecases/submitSolution.usecase.ts":
      'import { submitSolution } from "@/infrastructure/api/repositories/submission.repository";',
    "infrastructure/api/repositories/submission.repository.ts":
      "export const submitSolution = () => {};",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /submission\.repository/);
});

test("strict policy allows core usecases to import dot-notation core ports", (t) => {
  const result = runFixture(t, {
    "core/usecases/submitSolution.usecase.ts":
      'import type { ISubmissionRepository } from "@/core/ports/submission.repository";',
    "core/ports/submission.repository.ts":
      "export interface ISubmissionRepository {}",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("allows infrastructure mappers to consume transport DTO contracts", (t) => {
  const result = runFixture(t, {
    "infrastructure/mappers/contest.mapper.ts":
      'import type { ContestDto } from "@/infrastructure/api/dto/contest.dto";',
    "infrastructure/api/dto/contest.dto.ts": "export interface ContestDto {}",
  });

  assert.equal(result.status, 0, result.stderr);
});
