import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname, "fix-carbon-spacing-tokens.js");

test("replaces exact Carbon spacing values without guessing non-token values", (t) => {
  const root = mkdtempSync(join(tmpdir(), "qjudge-spacing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "Example.module.scss");
  writeFileSync(
    file,
    `.root {
      padding: 1rem 24px;
      gap: 0.5rem;
      margin-top: 0.375rem;
      margin-left: -0.5rem;
      width: 1rem;
      padding-block: layout.rem(48px);
      margin-bottom: var(--cds-spacing-05, 1rem);
      column-gap: calc(24px + 1vw);
    }\n`,
  );

  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--write"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(file, "utf8"),
    `.root {
      padding: var(--cds-spacing-05) var(--cds-spacing-06);
      gap: var(--cds-spacing-03);
      margin-top: 0.375rem;
      margin-left: -0.5rem;
      width: 1rem;
      padding-block: layout.rem(48px);
      margin-bottom: var(--cds-spacing-05, 1rem);
      column-gap: calc(var(--cds-spacing-06) + 1vw);
    }\n`,
  );
});
