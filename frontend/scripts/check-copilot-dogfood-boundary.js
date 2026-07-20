#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const sourceRoot = resolve(process.argv[2] ?? resolve(projectRoot, "src"));
const sourcePattern = /\.(?:ts|tsx)$/;
const blockedCopilotImports = ["@/core/copilot", "@/shared/copilot"];
const blockedLegacySymbols = [
  "useLegacyChatbotRuntime",
  "useChatbotContext",
  "useOptionalChatbotContext",
  "useChatSessionContext",
];
const nonProductionDirectories = new Set([
  "__fixtures__",
  "__stories__",
  "__tests__",
  "fixture",
  "fixtures",
  "stories",
  "test",
  "tests",
]);
const nonProductionFileMarkers = new Set(["spec", "stories", "story", "test"]);
const violations = [];

function toPosix(value) {
  return value.split(sep).join("/");
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    });
}

function isCandidate(relativePath) {
  return (
    relativePath === "core/copilot" ||
    relativePath.startsWith("core/copilot/") ||
    relativePath === "shared/copilot" ||
    relativePath.startsWith("shared/copilot/")
  );
}

function isProduction(relativePath) {
  const parts = relativePath.split("/");
  const file = parts.at(-1) ?? "";
  if (parts.slice(0, -1).some((part) => nonProductionDirectories.has(part))) {
    return false;
  }
  const markers = file.split(".").slice(1, -1);
  return !markers.some((marker) => nonProductionFileMarkers.has(marker));
}

function codeOnly(content) {
  let result = "";
  let state = "code";
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        result += "  ";
        index += 1;
        state = "line-comment";
      } else if (char === "/" && next === "*") {
        result += "  ";
        index += 1;
        state = "block-comment";
      } else if (char === "'" || char === '"' || char === "`") {
        result += " ";
        state = char;
      } else {
        result += char;
      }
      continue;
    }

    if (state === "line-comment") {
      result += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (char === "\\") {
      result += " ";
      if (next !== undefined) {
        result += next === "\n" ? "\n" : " ";
        index += 1;
      }
    } else if (char === state) {
      result += " ";
      state = "code";
    } else {
      result += char === "\n" ? "\n" : " ";
    }
  }
  return result;
}

function codePositions(content) {
  const code = codeOnly(content);
  return Array.from(code, (character) => character !== " ");
}

function collectImports(content) {
  const positions = codePositions(content);
  const imports = [];
  const staticPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of content.matchAll(pattern)) {
      if (positions[match.index]) {
        imports.push({ specifier: match[1], statement: match[0] });
      }
    }
  }
  return imports;
}

function isRepositoryImport(specifier) {
  return (
    /(?:^|\/)repositories(?:\/index)?$/.test(specifier) ||
    /(?:^|\/)chatbot\.repository(?:$|[/.])/.test(specifier)
  );
}

function isCopilotRelated(relativePath, imports) {
  return relativePath.toLowerCase().includes("copilot") ||
    imports.some(({ specifier }) => specifier === "@copilot" || specifier.startsWith("@copilot/"));
}

function record(relativePath, reason) {
  violations.push(`${relativePath}: ${reason}`);
}

if (!existsSync(sourceRoot)) {
  console.error(`Copilot dogfood source root not found: ${sourceRoot}`);
  process.exit(2);
}

const files = filesUnder(sourceRoot).filter((file) => sourcePattern.test(file));
for (const file of files) {
  const relativePath = toPosix(relative(sourceRoot, file));
  const content = readFileSync(file, "utf8");
  const imports = collectImports(content);
  const production = isProduction(relativePath);

  for (const { specifier } of imports) {
    if (!isCandidate(relativePath) && blockedCopilotImports.some((prefix) => specifier.startsWith(prefix))) {
      record(relativePath, `Copilot implementation import '${specifier}'`);
    }
    if (specifier.startsWith("@copilot/") && specifier !== "@copilot/testing") {
      record(relativePath, `unapproved @copilot subpath '${specifier}'`);
    }
    if (production && specifier === "@copilot/testing") {
      record(relativePath, "testing import in production");
    }
    if (
      production &&
      isCopilotRelated(relativePath, imports) &&
      !relativePath.startsWith("infrastructure/copilot/") &&
      isRepositoryImport(specifier)
    ) {
      record(relativePath, `Copilot repository import outside infrastructure/copilot '${specifier}'`);
    }
  }

  if (!production) continue;

  const executableCode = codeOnly(content);
  for (const identifier of blockedLegacySymbols) {
    if (new RegExp(`\\b${identifier}\\b`).test(executableCode)) {
      record(relativePath, `legacy runtime identifier '${identifier}'`);
    }
  }
  const importsUseChatbot = imports.some(
    ({ statement }) => /^\s*import\b/.test(statement) && /\buseChatbot\b/.test(statement),
  );
  if (importsUseChatbot || /\buseChatbot\s*\(/.test(executableCode)) {
    record(relativePath, "legacy useChatbot import or call");
  }
}

violations.sort();
if (violations.length > 0) {
  console.error(`Copilot dogfood boundary violations:\n${violations.join("\n")}`);
  process.exit(1);
}

console.log(`Copilot dogfood boundary passed (${files.length} files scanned).`);
