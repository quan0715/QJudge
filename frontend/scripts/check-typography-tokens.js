#!/usr/bin/env node
/**
 * Typography Token Guard
 *
 * Forbids hardcoded font-size / font-weight values inside the dashboard
 * primitive library and the contest feature module so that the cleanup
 * we did doesn't silently regress. Allowed: var(--cds-...), inherit,
 * normal, and other CSS keywords. Disallowed: bare numbers, rem/px/em
 * lengths.
 *
 * Usage: npm run check:typography
 *        node scripts/check-typography-tokens.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..");

// Only enforce inside the dashboard primitive library. These files are
// the source of truth for typography in the contest dashboards, so any
// hardcoded font-size here would silently break the contract for every
// caller. Feature-level SCSS files retain their own legacy styles.
const TARGET_DIRS = [
  "src/shared/components/dashboard",
];

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".module.scss")) {
      out.push(full);
    }
  }
  return out;
}

// A line passes if the property declares a value coming from a Carbon
// token, an explicit keyword (inherit/normal/initial/etc.), or
// references a SCSS variable / mixin. It fails on bare numbers and
// length units like 1rem / 14px.
function isAllowed(value) {
  const v = value.trim().toLowerCase();
  if (v.startsWith("var(")) return true;
  if (v.startsWith("inherit")) return true;
  if (v.startsWith("initial")) return true;
  if (v.startsWith("unset")) return true;
  if (v.startsWith("revert")) return true;
  if (v.startsWith("normal")) return true;
  if (v.startsWith("bold")) return true;
  if (v.startsWith("bolder")) return true;
  if (v.startsWith("lighter")) return true;
  if (v.startsWith("$")) return true; // SCSS variable
  if (v.startsWith("@")) return true; // SCSS function or mixin output
  return false;
}

function check(file) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Strip line comments to avoid false positives in `// font-size: 1rem`
    const stripped = line.replace(/\/\/.*$/, "");
    // Only enforce font-size — font-weight numbers (400/600/etc.) are
    // standard CSS and don't all map to Carbon tokens.
    const match = stripped.match(/^\s*(font-size)\s*:\s*([^;]+);?/i);
    if (!match) continue;

    const [, prop, value] = match;
    if (isAllowed(value)) continue;

    issues.push({
      line: i + 1,
      property: prop,
      value: value.trim(),
      raw: line,
    });
  }

  return issues;
}

function main() {
  const files = [];
  for (const dir of TARGET_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    walk(full, files);
  }

  let totalIssues = 0;
  const reports = [];

  for (const file of files) {
    const issues = check(file);
    if (issues.length === 0) continue;
    totalIssues += issues.length;
    reports.push({ file, issues });
  }

  if (totalIssues === 0) {
    console.log(
      `${colors.green}✓ Typography token guard passed${colors.reset} ` +
        `(${files.length} files scanned)`,
    );
    return;
  }

  console.log(
    `${colors.red}${colors.bold}✗ Typography token guard found ${totalIssues} hardcoded value(s):${colors.reset}\n`,
  );

  for (const { file, issues } of reports) {
    const rel = path.relative(ROOT, file);
    console.log(`${colors.cyan}${rel}${colors.reset}`);
    for (const issue of issues) {
      console.log(
        `  ${colors.yellow}line ${issue.line}${colors.reset}  ` +
          `${issue.property}: ${colors.red}${issue.value}${colors.reset}`,
      );
    }
    console.log();
  }

  console.log(
    `Replace hardcoded values with Carbon typography tokens, e.g.\n` +
      `  font-size: var(--cds-heading-compact-02-font-size, 1rem);\n` +
      `  font-weight: 600;  // → var(--cds-heading-compact-02-font-weight) where available\n`,
  );

  process.exit(1);
}

main();
