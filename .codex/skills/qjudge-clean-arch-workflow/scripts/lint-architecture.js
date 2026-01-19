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
  console.log(`Usage: node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js [options]

Options:
  --root <path>       Root directory to scan (default: frontend/src)
  --ext <list>        Comma-separated extensions (default: ts,tsx,js,jsx)
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

const defaultIgnorePath = path.resolve(
  process.cwd(),
  ".architecturelintignore"
);
const ignoreFile = getArg(
  "--ignore",
  fs.existsSync(defaultIgnorePath) ? defaultIgnorePath : null
);

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

const rules = [
  // Core layer - usecases can use repositories directly (pragmatic approach for frontend)
  {
    match: "core/usecases",
    allow: [
      "core/usecases",
      "core/ports",
      "core/entities",
      "core/types",
      "infrastructure/api/repositories",
    ],
  },
  {
    match: "core/ports",
    allow: ["core/ports", "core/entities", "core/types"],
  },
  { match: "core/entities", allow: ["core/entities", "core/types"] },
  { match: "core/types", allow: ["core/types"] },
  { match: "core/config", allow: ["core/config", "core/types", "core/entities"] },
  { match: "core", allow: ["core"] },

  // Infrastructure layer
  {
    match: "infrastructure/mappers",
    allow: ["infrastructure/mappers", "core/entities", "core/types"],
  },
  {
    match: "infrastructure/api/repositories",
    allow: [
      "infrastructure/api/repositories",
      "infrastructure/mappers",
      "infrastructure/api",
      "core/ports",
      "core/entities",
      "core/types",
    ],
  },
  {
    match: "infrastructure/api",
    allow: ["infrastructure/api", "core/types", "core/entities"],
  },
  { match: "infrastructure", allow: ["infrastructure", "core"] },

  // Shared layer - can use app/contexts for global state
  {
    match: "shared",
    allow: ["shared", "core", "app/contexts", "styles", "assets", "i18n"],
  },

  // Features layer - can use app/contexts for global state
  {
    match: "features",
    allow: [
      "features",
      "shared",
      "core",
      "infrastructure",
      "app/contexts",
      "styles",
      "assets",
      "i18n",
    ],
  },

  // App layer (composition root)
  {
    match: "app",
    allow: [
      "app",
      "features",
      "shared",
      "core",
      "infrastructure",
      "styles",
      "assets",
      "i18n",
    ],
  },
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isIgnored(relPath) {
  if (!relPath) {
    return false;
  }
  const posixRel = toPosix(relPath);
  return ignoreEntries.some((entry) => {
    return (
      posixRel === entry ||
      posixRel.startsWith(`${entry}/`) ||
      posixRel.startsWith(`${entry}${path.sep}`)
    );
  });
}

function isUnderPath(posixRel, fragment) {
  return (
    posixRel === fragment ||
    posixRel.startsWith(`${fragment}/`) ||
    posixRel.includes(`/${fragment}/`)
  );
}

function isStoryFile(posixRel) {
  return posixRel.endsWith(".stories.tsx") || posixRel.endsWith(".stories.ts");
}

function resolveImport(sourceFile, specifier) {
  if (!specifier) {
    return null;
  }
  if (specifier.startsWith("@/")) {
    return resolvePath(path.join(root, specifier.slice(2)));
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolvePath(path.resolve(path.dirname(sourceFile), specifier));
  }
  if (specifier.startsWith("/")) {
    return resolvePath(path.join(root, specifier.slice(1)));
  }
  return null;
}

function resolvePath(basePath) {
  if (path.extname(basePath)) {
    return fs.existsSync(basePath) ? basePath : null;
  }

  for (const ext of extensions) {
    const candidate = `${basePath}.${ext}`;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of extensions) {
      const candidate = path.join(basePath, `index.${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getRuleForSource(posixRel) {
  return rules.find((rule) => isUnderPath(posixRel, rule.match));
}

function isAllowedTarget(rule, targetRel) {
  return rule.allow.some((prefix) => isUnderPath(targetRel, prefix));
}

function collectImports(content) {
  const results = [];
  const staticRe = /(?:import|export)\s+(?:[^'"\n]+\s+from\s+)?["']([^"']+)["']/g;
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  let match = staticRe.exec(content);
  while (match) {
    results.push(match[1]);
    match = staticRe.exec(content);
  }
  match = dynamicRe.exec(content);
  while (match) {
    results.push(match[1]);
    match = dynamicRe.exec(content);
  }
  return results;
}

const violations = [];

function recordViolation(relPath, specifier, reason) {
  violations.push({
    path: toPosix(relPath),
    specifier,
    reason,
  });
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
      walk(entryPath, entryRel);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).replace(".", "");
      if (!extensions.has(ext)) {
        continue;
      }
      const posixRel = toPosix(entryRel);
      const rule = getRuleForSource(posixRel);
      if (!rule) {
        continue;
      }
      const content = fs.readFileSync(entryPath, "utf8");
      const imports = collectImports(content);
      for (const specifier of imports) {
        const resolved = resolveImport(entryPath, specifier);
        if (!resolved) {
          continue;
        }
        const targetRel = toPosix(path.relative(root, resolved));
        if (targetRel.startsWith("..")) {
          continue;
        }
        if (
          !isAllowedTarget(rule, targetRel) &&
          !(isStoryFile(posixRel) && isUnderPath(targetRel, "features/storybook/mocks"))
        ) {
          recordViolation(entryRel, specifier, `Not allowed by rule: ${rule.match}`);
        }
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
  console.error("Architecture violations found:\n");
  violations.forEach((violation) => {
    console.error(`- ${violation.path}: ${violation.specifier} (${violation.reason})`);
  });
  process.exit(1);
}

console.log("Architecture check passed.");
