#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

if (args.includes("--help")) {
  console.log(`Usage: node audit-carbon-practices.js [options]

Options:
  --root <path>       Source root to audit (default: frontend/src)
  --format <format>   text, json, or markdown (default: text)
  --profile <name>    audit or strict (default: audit)
  --output <path>     Write the report to a file instead of stdout
  --help              Show this help
`);
  process.exit(0);
}

const root = path.resolve(process.cwd(), getArg("--root", "frontend/src"));
const format = getArg("--format", "text");
const profile = getArg("--profile", "audit");
const outputPath = getArg("--output", null);
const supportedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".scss", ".sass", ".css"]);
const styleExtensions = new Set([".scss", ".sass", ".css"]);
const decisionFile = path.resolve(
  __dirname,
  "../references/carbon-audit-decisions.json",
);
const auditDecisions = fs.existsSync(decisionFile)
  ? JSON.parse(fs.readFileSync(decisionFile, "utf8")).decisions || []
  : [];
let typescript = null;
try {
  typescript = require(require.resolve("typescript", { paths: [path.join(process.cwd(), "frontend")] }));
} catch {
  // The regex fallback still runs when frontend dependencies are not installed.
}

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Carbon audit root does not exist: ${root}`);
  process.exit(2);
}
if (!new Set(["text", "json", "markdown"]).has(format)) {
  console.error(`Unsupported format: ${format}`);
  process.exit(2);
}
if (!new Set(["audit", "strict"]).has(profile)) {
  console.error(`Unsupported profile: ${profile}`);
  process.exit(2);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ["node_modules", "dist", "coverage", "storybook-static"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function stripComments(source, extension) {
  let result = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  if (extension !== ".css") {
    result = result.replace(/(^|\s)\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, " "));
  }
  return result;
}

function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function isContextualException(relativePath, rule) {
  if (rule === "raw-interactive-control" && relativePath.startsWith("shared/copilot/")) {
    return true;
  }
  if (/\.(test|spec|stories|story)\.[jt]sx?$/.test(relativePath)) {
    const blockerFixturePaths = new Set([
      "shared/ui/modal/SettingsModal.test.tsx",
      "test/architecture/copilotPackageBoundary.test.ts",
    ]);
    if (
      ["carbon-internal-selector", "important-declaration"].includes(rule) &&
      !blockerFixturePaths.has(relativePath)
    ) {
      return false;
    }
    return true;
  }
  if (
    rule === "hardcoded-theme-color" &&
    /(^|\/)(image|images|illustration|illustrations|artifact|monaco|code-editor)(\/|$)/i.test(relativePath)
  ) {
    return true;
  }
  return false;
}

function findPolicyDecision(relativePath, rule, evidence) {
  const component = (evidence.match(/^<([A-Za-z][A-Za-z0-9.]*)/) || [])[1];
  return auditDecisions.find(
    (decision) =>
      decision.paths.includes(relativePath) &&
      decision.rules.includes(rule) &&
      (!decision.components || decision.components.includes(component)),
  );
}

const findings = [];

function addFinding(file, source, offset, rule, severity, message, evidence = "") {
  const relativePath = toPosix(path.relative(root, file));
  const normalizedEvidence = evidence.trim().slice(0, 240);
  const decision = findPolicyDecision(relativePath, rule, normalizedEvidence);
  const disposition = decision
    ? "policy-reviewed"
    : isContextualException(relativePath, rule)
      ? "exception-review"
      : severity === "error"
        ? "blocker"
        : "review";
  findings.push({
    path: relativePath,
    line: lineNumberAt(source, offset),
    rule,
    severity,
    disposition,
    message,
    evidence: normalizedEvidence,
    ...(decision
      ? {
          decision: {
            id: decision.id,
            reason: decision.reason,
            owner: decision.owner,
            removalCondition: decision.removalCondition,
          },
        }
      : {}),
  });
}

function auditStyle(file, source, cleanSource) {
  const lineRules = [
    {
      regex: /\.(?:cds|bx)--[a-z0-9_-]+/gi,
      rule: "carbon-internal-selector",
      severity: "error",
      message: "Do not override Carbon internal selectors outside an explicit, reviewed compatibility boundary.",
    },
    {
      regex: /!important\b/gi,
      rule: "important-declaration",
      severity: "error",
      message: "Remove !important and fix specificity or component composition instead.",
    },
    {
      regex: /(?:#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi,
      rule: "hardcoded-theme-color",
      severity: "warning",
      message: "Review hard-coded color and prefer a Carbon theme token unless the value is media/canvas-specific.",
    },
    {
      regex: /\boverflow-y\s*:\s*(?:auto|scroll)\b/gi,
      rule: "scroll-owner-review",
      severity: "info",
      message: "Confirm this is the view's intended vertical scroll owner and that ancestors can shrink.",
    },
  ];

  for (const entry of lineRules) {
    for (const match of cleanSource.matchAll(entry.regex)) {
      addFinding(file, source, match.index, entry.rule, entry.severity, entry.message, match[0]);
    }
  }

  const typographyDeclaration = /\b(?:font-size|font-family)\s*:\s*([^;\n}]+)/gi;
  for (const match of cleanSource.matchAll(typographyDeclaration)) {
    const value = match[1].trim().toLowerCase();
    if (/^(?:var\(|\$|inherit\b|initial\b|unset\b|revert\b)/.test(value) || value.includes("$")) {
      continue;
    }
    addFinding(
      file,
      source,
      match.index,
      "hardcoded-typography",
      "warning",
      "Use Carbon type tokens or type mixins for product typography.",
      match[0],
    );
  }

  const spacingDeclaration = /\b(?:margin(?:-(?:block|inline|top|right|bottom|left))?|padding(?:-(?:block|inline|top|right|bottom|left))?|gap|row-gap|column-gap)\s*:\s*([^;\n}]+)/gi;
  for (const match of cleanSource.matchAll(spacingDeclaration)) {
    const value = match[1].trim().toLowerCase();
    const keywordOnly = value.split(/\s+/).every((part) => ["0", "auto", "inherit", "initial", "unset", "revert"].includes(part));
    if (keywordOnly || value.includes("var(") || value.includes("$")) {
      continue;
    }
    addFinding(
      file,
      source,
      match.index,
      "hardcoded-spacing",
      "info",
      "Review spacing against Carbon spacing tokens and the 2x grid.",
      match[0],
    );
  }
}

function hasAccessibleName(attributes) {
  return /\b(?:aria-label|aria-labelledby|title)\s*=/.test(attributes);
}

function auditMarkup(file, source, cleanSource) {
  const rawControl = /<(button|input|select|textarea)\b([^<]*?)(?:\/?>)/g;
  for (const match of cleanSource.matchAll(rawControl)) {
    addFinding(
      file,
      source,
      match.index,
      "raw-interactive-control",
      "warning",
      `Review raw <${match[1].toLowerCase()}>; prefer the Carbon equivalent unless an architectural or platform exception applies.`,
      match[0],
    );
  }

  const rawButton = /<button\b([^<]*?)>([\s\S]*?)<\/button\s*>/g;
  for (const match of cleanSource.matchAll(rawButton)) {
    const attributes = match[1];
    const body = match[2];
    const visibleText = body.replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").trim();
    const mayRenderDynamicText = body.includes("{") || /<(?:span|p|strong|em|label)\b/i.test(body);
    if (!visibleText && !mayRenderDynamicText && !hasAccessibleName(attributes)) {
      addFinding(
        file,
        source,
        match.index,
        "icon-only-button-name",
        "warning",
        "Icon-only controls need a persistent accessible name exposed on hover/focus.",
        match[0],
      );
    }
  }

  if (!typescript) {
    const carbonIconButton = /<(IconButton|Button)\b((?:[^>{]|{[^{}]*(?:{[^{}]*}[^{}]*)*})*)\/>/g;
    for (const match of cleanSource.matchAll(carbonIconButton)) {
      const [, component, attributes] = match;
      const iconOnly = component === "IconButton" || /\bhasIconOnly(?:\s|=|$)/.test(attributes);
      if (iconOnly && !/\b(?:label|iconDescription|aria-label|aria-labelledby)\s*=/.test(attributes)) {
        addFinding(
          file,
          source,
          match.index,
          "icon-only-button-name",
          "warning",
          "Carbon icon-only buttons require label, iconDescription, or an equivalent accessible name.",
          match[0],
        );
      }
    }
  }

  if (!typescript) {
    const clickable = /<(div|span|li)\b(?=[^<]*\bonClick\s*=)([^<]*?)>/g;
    for (const match of cleanSource.matchAll(clickable)) {
      const attributes = match[2];
      if (!/\brole\s*=/.test(attributes) || !/\b(?:onKeyDown|onKeyUp|onKeyPress)\s*=/.test(attributes)) {
        addFinding(
          file,
          source,
          match.index,
          "clickable-noninteractive-element",
          "warning",
          "Use a semantic interactive element, or provide complete keyboard semantics when no native element fits.",
          match[0],
        );
      }
    }
  }
}

function auditCode(file, source, cleanSource) {
  for (const match of cleanSource.matchAll(/\b(?:cds|bx)--[a-z0-9_-]+/gi)) {
    addFinding(
      file,
      source,
      match.index,
      "carbon-internal-selector",
      "error",
      "Do not depend on Carbon internal class names from application code.",
      match[0],
    );
  }

  for (const match of cleanSource.matchAll(
    /\b(?:color|background(?:Color)?|border(?:Color)?|fill|stroke)\s*:\s*["'`](#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))["'`]/gi,
  )) {
    addFinding(
      file,
      source,
      match.index,
      "hardcoded-theme-color",
      "warning",
      "Review inline color and prefer a Carbon theme token unless rendering media or editor content.",
      match[0],
    );
  }

  if (!typescript || ![".tsx", ".jsx"].includes(path.extname(file))) return;

  const scriptKind = path.extname(file) === ".tsx" ? typescript.ScriptKind.TSX : typescript.ScriptKind.JSX;
  const sourceFile = typescript.createSourceFile(
    file,
    source,
    typescript.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  function inspect(node) {
    if (typescript.isJsxOpeningElement(node) || typescript.isJsxSelfClosingElement(node)) {
      const component = node.tagName.getText(sourceFile);
      const attributes = new Set();
      const attributeValues = new Map();
      let hasSpread = false;
      for (const property of node.attributes.properties) {
        if (typescript.isJsxAttribute(property)) {
          const name = property.name.getText(sourceFile);
          attributes.add(name);
          attributeValues.set(name, property.initializer ? property.initializer.getText(sourceFile) : true);
        } else {
          hasSpread = true;
        }
      }
      const hasAny = (...names) => names.some((name) => attributes.has(name));
      const evidence = node.getText(sourceFile);
      const offset = node.getStart(sourceFile);

      if (component === "button" && !attributes.has("type")) {
        addFinding(
          file,
          source,
          offset,
          "native-button-type-review",
          "warning",
          "Native buttons must declare type=\"button\" unless they intentionally submit a form.",
          evidence,
        );
      }

      if (["input", "select", "textarea"].includes(component)) {
        const typeValue = String(attributeValues.get("type") || "").replace(/[{}"']/g, "");
        const platformControl = component === "input" && ["file", "hidden"].includes(typeValue);
        const hasPotentialLabel = hasAny("id", "aria-label", "aria-labelledby", "aria-hidden", "title");
        if (!platformControl && !hasPotentialLabel) {
          addFinding(
            file,
            source,
            offset,
            "native-form-label-review",
            "warning",
            `Native ${component} controls need a programmatic label or a stable id linked to a visible label.`,
            evidence,
          );
        }
      }

      if (["div", "span", "li"].includes(component) && attributes.has("onClick")) {
        const onClickValue = String(attributeValues.get("onClick") || "");
        const completeKeyboardSemantics = hasAny("role") && hasAny("tabIndex") && hasAny("onKeyDown", "onKeyUp", "onKeyPress");
        const propagationWrapper = onClickValue.includes("stopPropagation");
        if (!completeKeyboardSemantics && !propagationWrapper) {
          addFinding(
            file,
            source,
            offset,
            "clickable-noninteractive-element",
            "warning",
            "Use a semantic interactive element, or provide complete keyboard semantics when no native element fits.",
            evidence,
          );
        }
      }

      if (["TextInput", "TextArea", "Select"].includes(component)) {
        if (!attributes.has("id") || !hasAny("labelText", "aria-label", "aria-labelledby")) {
          addFinding(
            file,
            source,
            offset,
            "carbon-form-label-review",
            "warning",
            `Verify ${component} has a stable id and programmatic label${hasSpread ? " through its spread props" : ""}.`,
            evidence,
          );
        }
      }

      if (["Dropdown", "ComboBox", "MultiSelect"].includes(component)) {
        if (!attributes.has("id") || !hasAny("titleText", "aria-label", "aria-labelledby")) {
          addFinding(
            file,
            source,
            offset,
            "carbon-form-label-review",
            "warning",
            `Verify ${component} has a stable id and titleText or equivalent accessible label.`,
            evidence,
          );
        }
      }

      if (["Checkbox", "Toggle", "RadioButton"].includes(component)) {
        if (!attributes.has("id") || !hasAny("labelText", "labelA", "labelB", "aria-label", "aria-labelledby")) {
          addFinding(
            file,
            source,
            offset,
            "carbon-form-label-review",
            "warning",
            `Verify ${component} has a stable id and programmatic label.`,
            evidence,
          );
        }
      }

      if (component === "Search" && !hasAny("labelText", "aria-label", "aria-labelledby")) {
        addFinding(
          file,
          source,
          offset,
          "carbon-form-label-review",
          "warning",
          "Carbon Search requires a programmatic label.",
          evidence,
        );
      }

      if (["InlineLoading", "Loading"].includes(component) && !hasAny("description", "iconDescription", "aria-label", "aria-labelledby")) {
        addFinding(
          file,
          source,
          offset,
          "carbon-loading-label-review",
          "warning",
          `Verify ${component} exposes an accessible description, even when its visible label is hidden.`,
          evidence,
        );
      }

      if (component === "Modal" && !hasAny("modalHeading", "aria-label", "aria-labelledby")) {
        addFinding(
          file,
          source,
          offset,
          "carbon-modal-label-review",
          "warning",
          "Carbon Modal needs a concise heading or an equivalent accessible label.",
          evidence,
        );
      }

      if (["IconButton", "Button"].includes(component)) {
        const hasIconOnlyValue = attributeValues.get("hasIconOnly");
        const iconOnly = component === "IconButton" || (
          attributes.has("hasIconOnly") && !new Set(["false", "{false}", "\"false\"", "'false'"]).has(hasIconOnlyValue)
        );
        if (iconOnly && !hasAny("label", "iconDescription", "aria-label", "aria-labelledby")) {
          addFinding(
            file,
            source,
            offset,
            "icon-only-button-name",
            "warning",
            "Carbon icon-only buttons require label, iconDescription, or an equivalent accessible name.",
            evidence,
          );
        }
      }

      if (["InlineNotification", "ToastNotification", "ActionableNotification"].includes(component)) {
        addFinding(
          file,
          source,
          offset,
          "notification-variant-review",
          "info",
          "Confirm the notification variant matches its lifecycle: inline for contextual task state, toast for transient global feedback, actionable only for interactive recovery.",
          evidence,
        );
        const titleValue = String(attributeValues.get("title") || "").replace(/[{}"'\s]/g, "");
        if (attributes.has("title") && titleValue.length === 0) {
          addFinding(
            file,
            source,
            offset,
            "notification-title-review",
            "warning",
            "Notifications need a concise non-empty title; use the subtitle for supporting detail.",
            evidence,
          );
        }
      }

      const relativePath = toPosix(path.relative(root, file));
      if (
        component === "Button" &&
        attributes.has("size") &&
        /(?:Header|Toolbar|TopNav|Navbar)/i.test(relativePath) &&
        /size\s*=\s*["']sm["']/.test(evidence)
      ) {
        addFinding(
          file,
          source,
          offset,
          "small-button-in-navigation",
          "warning",
          "QJudge navigation and toolbar actions use the default Carbon button size to align with the 3rem shell.",
          evidence,
        );
      }
    }
    typescript.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

const inventoryFiles = walk(root).sort();
const sourceFiles = inventoryFiles.filter((file) => supportedExtensions.has(path.extname(file)));
for (const file of sourceFiles) {
  const extension = path.extname(file);
  const source = fs.readFileSync(file, "utf8");
  const cleanSource = stripComments(source, extension);
  if (styleExtensions.has(extension)) {
    auditStyle(file, source, cleanSource);
  } else {
    auditCode(file, source, cleanSource);
    if ([".tsx", ".jsx"].includes(extension)) {
      auditMarkup(file, source, cleanSource);
    }
  }
}

findings.sort((left, right) =>
  left.path.localeCompare(right.path) || left.line - right.line || left.rule.localeCompare(right.rule),
);

const findingsByPath = new Map();
for (const finding of findings) {
  const group = findingsByPath.get(finding.path) || [];
  group.push(finding);
  findingsByPath.set(finding.path, group);
}

const files = inventoryFiles.map((file) => {
  const relativePath = toPosix(path.relative(root, file));
  if (!supportedExtensions.has(path.extname(file))) {
    return { path: relativePath, status: "not-applicable", findings: 0 };
  }
  const fileFindings = findingsByPath.get(relativePath) || [];
  const status = fileFindings.length === 0
    ? "clean"
    : fileFindings.every((finding) => finding.disposition === "policy-reviewed")
      ? "policy-reviewed"
    : fileFindings.every((finding) => finding.disposition === "exception-review")
      ? "exception-review"
      : "findings";
  return { path: relativePath, status, findings: fileFindings.length };
});

function countBy(key) {
  return findings.reduce((counts, finding) => {
    counts[finding[key]] = (counts[finding[key]] || 0) + 1;
    return counts;
  }, {});
}

const report = {
  generatedAt: new Date().toISOString(),
  root,
  profile,
  summary: {
    filesInventoried: files.length,
    filesScanned: sourceFiles.length,
    filesNotApplicable: files.filter((file) => file.status === "not-applicable").length,
    filesWithFindings: files.filter((file) => ["findings", "exception-review", "policy-reviewed"].includes(file.status)).length,
    findings: findings.length,
    byRule: countBy("rule"),
    bySeverity: countBy("severity"),
    byDisposition: countBy("disposition"),
  },
  files,
  findings,
};

function renderText() {
  const renderedFindings = profile === "strict"
    ? findings.filter((finding) => finding.disposition === "blocker")
    : findings;
  const lines = [
    profile === "strict"
      ? `Carbon strict gate: ${renderedFindings.length} blockers across ${report.summary.filesScanned} scanned files`
      : `Carbon audit: ${report.summary.filesScanned} files, ${report.summary.findings} findings`,
    `Disposition: ${JSON.stringify(report.summary.byDisposition)}`,
  ];
  for (const finding of renderedFindings) {
    lines.push(`${finding.path}:${finding.line} [${finding.disposition}] ${finding.rule} — ${finding.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderMarkdown() {
  const renderedFindings = profile === "strict"
    ? findings.filter((finding) => finding.disposition === "blocker")
    : findings;
  const lines = [
    "# Carbon frontend audit",
    "",
    `- Files scanned: ${report.summary.filesScanned}`,
    `- Files with findings: ${report.summary.filesWithFindings}`,
    `- Findings: ${report.summary.findings}`,
    "",
    "| File | Line | Disposition | Rule | Finding |",
    "| --- | ---: | --- | --- | --- |",
  ];
  for (const finding of renderedFindings) {
    lines.push(`| \`${finding.path}\` | ${finding.line} | ${finding.disposition} | ${finding.rule} | ${finding.message} |`);
  }
  return `${lines.join("\n")}\n`;
}

const rendered = format === "json"
  ? `${JSON.stringify(report, null, 2)}\n`
  : format === "markdown"
    ? renderMarkdown()
    : renderText();

if (outputPath) {
  fs.writeFileSync(path.resolve(process.cwd(), outputPath), rendered);
} else {
  process.stdout.write(rendered);
}

if (profile === "strict" && findings.some((finding) => finding.disposition === "blocker")) {
  process.exitCode = 1;
}
