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

test("migrates SCSS to @carbon/layout without guessing non-token values", (t) => {
  const root = mkdtempSync(join(tmpdir(), "qjudge-spacing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "Example.module.scss");
  writeFileSync(
    file,
    `.root {
      padding: 1rem 24px;
      gap: var(--cds-spacing-03);
      margin-top: 0.375rem;
      margin-left: -0.5rem;
      width: var(--cds-spacing-05, 1rem);
      padding-block: layout.rem(48px);
      column-gap: calc(24px + 1vw);
    }
// var(--cds-spacing-08) is documentation, not active Sass.
`,
  );

  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--write"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(file, "utf8"),
    `@use "@carbon/layout";
.root {
      padding: layout.$spacing-05 layout.$spacing-06;
      gap: layout.$spacing-03;
      margin-top: 0.375rem;
      margin-left: -0.5rem;
      width: layout.$spacing-05;
      padding-block: layout.rem(48px);
      column-gap: calc(layout.$spacing-06 + 1vw);
    }
// var(--cds-spacing-08) is documentation, not active Sass.
`,
  );
});

test("keeps an existing Carbon layout import and repairs plain CSS with rem values", (t) => {
  const root = mkdtempSync(join(tmpdir(), "qjudge-spacing-css-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scssFile = join(root, "Existing.scss");
  const cssFile = join(root, "Runtime.css");
  writeFileSync(
    scssFile,
    `@use "@carbon/layout";
.root { margin: var(--cds-spacing-04); }
`,
  );
  writeFileSync(
    cssFile,
    `.root { padding: var(--cds-spacing-05); gap: var(--cds-spacing-03, 0.5rem); }
/* var(--cds-spacing-10) stays in a comment. */
`,
  );

  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--write"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(scssFile, "utf8"),
    `@use "@carbon/layout";
.root { margin: layout.$spacing-04; }
`,
  );
  assert.equal(
    readFileSync(cssFile, "utf8"),
    `.root { padding: 1rem; gap: 0.5rem; }
/* var(--cds-spacing-10) stays in a comment. */
`,
  );
});
