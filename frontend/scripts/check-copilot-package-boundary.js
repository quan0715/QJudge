import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const projectRoot = process.cwd();
const fixtureRoot = process.argv[2] ? resolve(process.argv[2]) : null;
const roots = fixtureRoot
  ? [fixtureRoot]
  : [
      resolve(projectRoot, "src/core/copilot"),
      resolve(projectRoot, "src/shared/copilot"),
    ];
if (!fixtureRoot) {
  for (const name of ["browserCopilotSessionLocation.ts", "browserCopilotStorage.ts"]) {
    roots.push(resolve(projectRoot, "src/infrastructure/copilot", name));
  }
}

const sourcePattern = /\.(?:ts|tsx|css|scss)$/;
const importPattern = /(?:from\s*|import\s*\()(["'])([^"']+)\1/g;
const blockedImports = [
  ["@/features", "product feature"],
  ["@/infrastructure/api/repositories", "QJudge repository"],
  ["@/core/types/chatbot.types", "legacy chatbot type"],
  ["react-router", "router"],
  ["i18next", "i18n runtime"],
  ["@carbon", "Carbon"],
];
const violations = [];

function filesUnder(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

for (const file of roots.flatMap(filesUnder).filter((path) => sourcePattern.test(path))) {
  const content = readFileSync(file, "utf8");
  const label = relative(projectRoot, file);
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[2];
    for (const [blocked, reason] of blockedImports) {
      if (specifier.startsWith(blocked)) violations.push(`${label}: blocked ${reason} import '${specifier}'`);
    }
    if (!file.includes("/shared/copilot/") && (specifier === "react" || specifier.startsWith("react/"))) {
      violations.push(`${label}: React is only allowed under shared/copilot`);
    }
  }
  if (/\.(?:css|scss)$/.test(file)) {
    for (const token of [".cds-", ".bx-", "!important"]) {
      if (content.includes(token)) violations.push(`${label}: blocked style token '${token}'`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`Copilot package boundary passed (${roots.length} roots).`);
