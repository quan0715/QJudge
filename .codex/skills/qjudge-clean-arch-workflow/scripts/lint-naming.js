#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return fallback;
  }
  return args[index + 1];
}

if (hasFlag("--help")) {
  console.log(`Usage: node scripts/lint-naming.js [options]

Options:
  --root <path>       Root directory to scan (default: frontend/src)
  --ext <list>        Comma-separated extensions (default: ts,tsx,js,jsx)
  --files-only        Only check file names
  --dirs-only         Only check directory names
  --ignore <path>     Ignore file with repo-relative paths
  --help              Show this help
`);
  process.exit(0);
}

const rootArg = getArg("--root", "frontend/src");
const root = path.resolve(process.cwd(), rootArg);
const extArg = getArg("--ext", "ts,tsx,js,jsx");
const extensions = new Set(
  extArg
    .split(",")
    .map((ext) => ext.trim())
    .filter(Boolean)
);

const checkFiles = !hasFlag("--dirs-only");
const checkDirs = !hasFlag("--files-only");

const defaultIgnorePath = path.resolve(process.cwd(), ".naminglintignore");
const ignoreFile = getArg("--ignore", fs.existsSync(defaultIgnorePath) ? defaultIgnorePath : null);

const ignoreEntries = [];
if (ignoreFile && fs.existsSync(ignoreFile)) {
  const ignoreLines = fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/);
  ignoreLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    ignoreEntries.push(trimmed.replace(/\/$/, ""));
  });
}

const ignoredDirNames = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "storybook-static",
  ".codex",
  ".agent",
  ".claude",
  ".opencode",
]);

const allowedSuffixes = new Set([
  "test",
  "spec",
  "stories",
  "story",
  "module",
  "types",
  "entity",
  "repository",
  "mapper",
  "usecase",
  "config",
  "client",
  "mock",
  "fixture",
  "d",
]);

const camelCaseRe = /^[a-z][a-zA-Z0-9]*$/;
const lowerCaseRe = /^[a-z][a-z0-9-]*$/;
const pascalCaseRe = /^[A-Z][a-zA-Z0-9]*$/;
const kebabCaseRe = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const dotNotationRules = [
  // core
  { path: "core/entities", suffix: "entity", base: "camel" },
  { path: "core/ports", suffix: "repository", base: "camel" },
  { path: "core/usecases", suffix: "usecase", base: "camel" },
  { path: "core/config", suffix: "config", base: "camel" },
  { path: "core/types", suffix: "types", base: "camel" },
  // infrastructure
  { path: "infrastructure/mappers", suffix: "mapper", base: "camel" },
  { path: "infrastructure/api/repositories", suffix: "repository", base: "camel" },
  { path: "infrastructure/api", suffix: "client", base: "camel" },
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isIgnored(relPath) {
  if (!relPath) {
    return false;
  }
  const posixRel = toPosix(relPath);
  if (posixRel === "i18n/locales" || posixRel.startsWith("i18n/locales/")) {
    return true;
  }
  return ignoreEntries.some((entry) => {
    return relPath === entry || relPath.startsWith(`${entry}${path.sep}`) || relPath.startsWith(`${entry}/`);
  });
}

const violations = [];

function recordViolation(relPath, reason) {
  violations.push({ path: toPosix(relPath), reason });
}

function isAllowedDotSuffixes(parts) {
  return parts.every((part) => allowedSuffixes.has(part));
}

function isUnderPath(posixRel, fragment) {
  return (
    posixRel === fragment ||
    posixRel.startsWith(`${fragment}/`) ||
    posixRel.includes(`/${fragment}/`)
  );
}

function isCamelCase(value) {
  return camelCaseRe.test(value);
}

function isPascalCase(value) {
  return pascalCaseRe.test(value);
}

function isKebabCase(value) {
  return kebabCaseRe.test(value);
}

function isValidDotBase(rule, baseName) {
  if (rule.base === "kebabOrCamel") {
    return isCamelCase(baseName) || isKebabCase(baseName);
  }
  return isCamelCase(baseName);
}

function checkFileName(fileName, relPath) {
  const parsed = path.parse(fileName);
  const ext = parsed.ext.replace(".", "");
  if (!extensions.has(ext)) {
    return;
  }

  const nameParts = parsed.name.split(".");
  const baseName = nameParts[0];
  const suffixes = nameParts.slice(1);

  if (suffixes.length > 0 && !isAllowedDotSuffixes(suffixes)) {
    recordViolation(relPath, `Unexpected suffix: ${suffixes.join(".")}`);
    return;
  }

  if (baseName === "index" || baseName === "routes") {
    return;
  }

  const posixRel = toPosix(relPath);
  const dotRule = dotNotationRules.find((entry) => isUnderPath(posixRel, entry.path));

  if (ext === "tsx") {
    if (baseName === "main" || baseName.endsWith("-main")) {
      return;
    }
    if (!isPascalCase(baseName)) {
      recordViolation(relPath, `Not PascalCase: ${baseName}`);
      return;
    }
    if (isUnderPath(posixRel, "features") || isUnderPath(posixRel, "shared") || isUnderPath(posixRel, "app")) {
      if (
        posixRel.includes("/screens/") &&
        !posixRel.includes("/section/") &&
        !baseName.endsWith("Screen")
      ) {
        recordViolation(relPath, "Screen file must end with Screen");
        return;
      }
      if (posixRel.includes("/section/") && !baseName.endsWith("Section")) {
        recordViolation(relPath, "Section file must end with Section");
        return;
      }
      if (posixRel.includes("/contexts/") && !baseName.endsWith("Context")) {
        recordViolation(relPath, "Context file must end with Context");
        return;
      }
    }
    return;
  }

  if (dotRule) {
    if (!suffixes.includes(dotRule.suffix)) {
      recordViolation(
        relPath,
        `Expected .${dotRule.suffix}.ts in ${dotRule.path}`
      );
      return;
    }
    if (!isValidDotBase(dotRule, baseName)) {
      recordViolation(relPath, `Invalid base name: ${baseName}`);
    }
    return;
  }

  if (posixRel.includes("/hooks/")) {
    if (!isCamelCase(baseName)) {
      recordViolation(relPath, `Not camelCase: ${baseName}`);
      return;
    }
    if (!baseName.startsWith("use")) {
      recordViolation(relPath, "Hook file must start with use");
      return;
    }
    return;
  }

  if (!isCamelCase(baseName)) {
    recordViolation(relPath, `Not camelCase: ${baseName}`);
  }
}

function checkDirName(dirName, relPath) {
  if (dirName.startsWith(".")) {
    return;
  }
  if (dirName.startsWith("__") && dirName.endsWith("__")) {
    return;
  }
  const posixRel = toPosix(relPath);
  const parts = posixRel.split("/");
  if (parts.length === 2 && parts[0] === "features") {
    if (!lowerCaseRe.test(dirName)) {
      recordViolation(relPath, `Feature folder must be lowercase: ${dirName}`);
    }
    return;
  }
  if (!camelCaseRe.test(dirName)) {
    recordViolation(relPath, `Not camelCase: ${dirName}`);
  }
}

function walk(currentPath, relPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirNames.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(currentPath, entry.name);
    const entryRel = relPath ? path.join(relPath, entry.name) : entry.name;

    if (isIgnored(entryRel)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (checkDirs && relPath) {
        checkDirName(entry.name, entryRel);
      }
      walk(entryPath, entryRel);
    } else if (entry.isFile()) {
      if (checkFiles) {
        checkFileName(entry.name, entryRel);
      }
    }
  }
}

if (!fs.existsSync(root)) {
  console.error(`Root path not found: ${root}`);
  process.exit(2);
}

walk(root, "");

if (violations.length > 0) {
  console.error("Naming violations found:\n");
  violations.forEach((violation) => {
    console.error(`- ${violation.path}: ${violation.reason}`);
  });
  process.exit(1);
}

console.log("Naming check passed.");
