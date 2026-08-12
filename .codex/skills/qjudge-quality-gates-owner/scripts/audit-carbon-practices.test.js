"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const script = resolve(__dirname, "audit-carbon-practices.js");

function runFixture(t, files, extraArgs = []) {
  const root = mkdtempSync(join(tmpdir(), "qjudge-carbon-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  return spawnSync(
    process.execPath,
    [script, "--root", root, "--format", "json", ...extraArgs],
    { encoding: "utf8" },
  );
}

function parseReport(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("audits every supported source file and records clean files", (t) => {
  const result = runFixture(t, {
    "Clean.tsx": `import { Button } from "@carbon/react";\nexport const Clean = () => <Button>Save</Button>;`,
    "Clean.module.scss": `.root {
      color: var(--cds-text-primary);
      margin: 0;
      gap: layout.$spacing-03;
      font-size: var(--cds-body-01-font-size, 0.875rem);
    }`,
    "notes.md": "not a source file",
  });
  const report = parseReport(result);

  assert.equal(report.summary.filesInventoried, 3);
  assert.equal(report.summary.filesScanned, 2);
  assert.equal(report.summary.filesNotApplicable, 1);
  assert.equal(report.summary.filesWithFindings, 0);
  assert.deepEqual(
    report.files.map((entry) => entry.status),
    ["clean", "clean", "not-applicable"],
  );
});

test("classifies Carbon styling, token, accessibility, and control findings", (t) => {
  const result = runFixture(t, {
    "Bad.tsx": `
      export const Bad = () => (
        <div onClick={() => undefined}>
          <button><svg /></button>
          <input placeholder="Name" />
        </div>
      );
    `,
    "Bad.module.scss": `
      .root { color: #161616 !important; overflow-y: auto; }
      .root .cds--btn { min-width: 10rem; }
    `,
  });
  const report = parseReport(result);
  const rules = new Set(report.findings.map((finding) => finding.rule));

  assert.ok(rules.has("carbon-internal-selector"));
  assert.ok(rules.has("important-declaration"));
  assert.ok(rules.has("hardcoded-theme-color"));
  assert.ok(rules.has("raw-interactive-control"));
  assert.ok(rules.has("icon-only-button-name"));
  assert.ok(rules.has("native-button-type-review"));
  assert.ok(rules.has("native-form-label-review"));
  assert.ok(rules.has("clickable-noninteractive-element"));
  assert.ok(rules.has("scroll-owner-review"));
});

test("accepts explicitly typed and labelled native composite controls", (t) => {
  const result = runFixture(t, {
    "Composite.tsx": `
      export const Composite = () => <>
        <button type="button" aria-label="Open"><Icon /></button>
        <input type="text" aria-label="Rename" />
        <input type="file" hidden />
        <textarea aria-label="Message" />
      </>;
    `,
  });
  const report = parseReport(result);
  const highConfidence = report.findings.filter((finding) =>
    ["native-button-type-review", "native-form-label-review"].includes(finding.rule),
  );

  assert.deepEqual(highConfidence, []);
});

test("flags empty notification titles", (t) => {
  const result = runFixture(t, {
    "Notice.tsx": `
      import { InlineNotification } from "@carbon/react";
      export const Notice = () => <InlineNotification title="" subtitle="Context" />;
    `,
  });
  const report = parseReport(result);

  assert.equal(
    report.findings.filter((finding) => finding.rule === "notification-title-review").length,
    1,
  );
});

test("ignores Carbon class names and important declarations in Sass comments", (t) => {
  const result = runFixture(t, {
    "Comments.module.scss": `
      // Matches Carbon's .cds--label without overriding it or using !important.
      .label { color: var(--cds-text-secondary); }
    `,
  });
  const report = parseReport(result);

  assert.equal(report.findings.length, 0);
});

test("handles dynamic button text and Carbon icon descriptions conservatively", (t) => {
  const result = runFixture(t, {
    "Buttons.tsx": `
      import { Button } from "@carbon/react";
      export const Buttons = ({ children, t }) => <>
        <button><Run />{t("run")}</button>
        <button>{children}</button>
        <div role="button" tabIndex={0} onClick={() => undefined} onKeyDown={() => undefined}>Open</div>
        <div onClick={(event) => event.stopPropagation()}>Wrapper</div>
        <Button hasIconOnly renderIcon={() => <Run />} iconDescription={t("run")} />
        <Button hasIconOnly renderIcon={() => <Run />} />
        <Button hasIconOnly={false} renderIcon={() => <Run />}>Run</Button>
      </>;
    `,
  });
  const report = parseReport(result);
  const iconFindings = report.findings.filter((finding) => finding.rule === "icon-only-button-name");
  const clickableFindings = report.findings.filter((finding) => finding.rule === "clickable-noninteractive-element");

  assert.equal(iconFindings.length, 1);
  assert.equal(clickableFindings.length, 0);
  assert.match(iconFindings[0].evidence, /<Button hasIconOnly/);
});

test("reviews Carbon component labels and internal classes in TSX", (t) => {
  const result = runFixture(t, {
    "Carbon.tsx": `
      import { InlineLoading, Modal, TextInput } from "@carbon/react";
      export const Carbon = () => <>
        <TextInput />
        <InlineLoading />
        <Modal open passiveModal />
        <div className="cds--tile" />
        <TextInput id="name" labelText="Name" />
        <InlineLoading description="Saving" iconDescription="Saving" />
        <Modal open modalHeading="Details" passiveModal />
      </>;
    `,
  });
  const report = parseReport(result);
  const rules = report.findings.map((finding) => finding.rule);

  assert.equal(rules.filter((rule) => rule === "carbon-form-label-review").length, 1);
  assert.equal(rules.filter((rule) => rule === "carbon-loading-label-review").length, 1);
  assert.equal(rules.filter((rule) => rule === "carbon-modal-label-review").length, 1);
  assert.equal(rules.filter((rule) => rule === "carbon-internal-selector").length, 1);
});

test("marks architectural and contextual exceptions without hiding them", (t) => {
  const result = runFixture(t, {
    "shared/copilot/Composer.tsx": `export const Composer = () => <textarea aria-label="Prompt" />;`,
    "shared/ui/image/Viewer.module.scss": `.overlay { background: rgba(0, 0, 0, 0.75); color: #fff; }`,
  });
  const report = parseReport(result);

  assert.equal(report.findings.length, 3);
  assert.ok(report.findings.every((finding) => finding.disposition === "exception-review"));
});

test("does not blanket-exempt Carbon internals in application tests", (t) => {
  const result = runFixture(t, {
    "features/example/Component.test.tsx":
      'expect(button).toHaveClass("cds--btn--primary");',
    "test/architecture/copilotPackageBoundary.test.ts":
      'const blockedFixture = ".cds--button";',
  });
  const report = parseReport(result);
  const applicationFinding = report.findings.find((finding) =>
    finding.path.includes("features/example"),
  );
  const gateFixtureFinding = report.findings.find((finding) =>
    finding.path.includes("test/architecture"),
  );

  assert.equal(applicationFinding?.disposition, "blocker");
  assert.equal(gateFixtureFinding?.disposition, "exception-review");
});

test("attaches exact policy decisions without hiding future raw controls", (t) => {
  const result = runFixture(t, {
    "features/landing/sections/FaqSection.tsx": `
      export const FaqSection = () => <>
        <button type="button">Question</button>
        <input aria-label="Unexpected input" />
      </>;
    `,
  });
  const report = parseReport(result);
  const rawControls = report.findings.filter(
    (finding) => finding.rule === "raw-interactive-control",
  );

  assert.equal(rawControls.length, 2);
  assert.equal(rawControls[0].disposition, "policy-reviewed");
  assert.equal(rawControls[0].decision?.id, "landing-disclosure-controls");
  assert.equal(rawControls[1].disposition, "review");
});

test("strict mode exits non-zero only for blocking findings", (t) => {
  const blocking = runFixture(
    t,
    { "Bad.scss": `.root .cds--modal { color: red !important; }` },
    ["--profile", "strict"],
  );
  assert.equal(blocking.status, 1);

  const reviewOnly = runFixture(
    t,
    { "Review.tsx": `export const Review = () => <button aria-label="Run" />;` },
    ["--profile", "strict"],
  );
  assert.equal(reviewOnly.status, 0, reviewOnly.stderr);
});
