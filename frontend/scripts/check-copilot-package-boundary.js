import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const fixtureRoot = process.argv[2] ? resolve(process.argv[2]) : null;
const sourceRoot = fixtureRoot ? resolve(fixtureRoot, "../..") : resolve(projectRoot, "src");
const roots = fixtureRoot
  ? [fixtureRoot]
  : [
      resolve(projectRoot, "src/core/copilot"),
      resolve(projectRoot, "src/shared/copilot"),
    ];

const sourcePattern = /\.(?:ts|tsx|css|scss)$/;
const blockedImports = [
  ["@/features", "product feature", "features"],
  ["@/infrastructure/api/repositories", "QJudge repository", "infrastructure/api/repositories"],
  ["@/infrastructure/copilot", "QJudge Copilot infrastructure", "infrastructure/copilot"],
  ["@/core/types/chatbot.types", "legacy chatbot type", "core/types/chatbot.types"],
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

function toPosix(value) {
  return value.split(sep).join("/");
}

function isUnder(relativePath, root) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

function resolvedSourceTarget(file, specifier) {
  let target;
  if (specifier.startsWith("@/")) {
    target = resolve(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    target = resolve(dirname(file), specifier);
  } else {
    return null;
  }
  const relativeTarget = toPosix(relative(sourceRoot, target));
  return relativeTarget === ".." || relativeTarget.startsWith("../")
    ? null
    : relativeTarget;
}

function isBlockedImport(file, specifier, blocked, sourceTarget) {
  if (!sourceTarget) return specifier.startsWith(blocked);
  const target = resolvedSourceTarget(file, specifier);
  return target !== null && isUnder(target, sourceTarget);
}

function sourceScriptKind(file) {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function moduleText(expression) {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : null;
}

function importedSpecifiers(file, content) {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    sourceScriptKind(file),
  );
  const specifiers = [];

  function collect(expression) {
    const specifier = moduleText(expression);
    if (specifier !== null) specifiers.push(specifier);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      collect(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      collect(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      collect(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      collect(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

for (const file of roots.flatMap(filesUnder).filter((path) => sourcePattern.test(path))) {
  const content = readFileSync(file, "utf8");
  const label = relative(projectRoot, file);
  const imports = /\.(?:ts|tsx)$/.test(file) ? importedSpecifiers(file, content) : [];
  for (const specifier of imports) {
    for (const [blocked, reason, sourceTarget] of blockedImports) {
      if (isBlockedImport(file, specifier, blocked, sourceTarget)) {
        violations.push(`${label}: blocked ${reason} import '${specifier}'`);
      }
    }
    if (!file.includes("/shared/copilot/") && (specifier === "react" || specifier.startsWith("react/"))) {
      violations.push(`${label}: React is only allowed under shared/copilot`);
    }
  }
  if (/\.(?:css|scss)$/.test(file)) {
    const importantToken = ["!", "important"].join("");
    for (const token of [".cds-", ".bx-", importantToken]) {
      if (content.includes(token)) violations.push(`${label}: blocked style token '${token}'`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`Copilot package boundary passed (${roots.length} roots).`);
