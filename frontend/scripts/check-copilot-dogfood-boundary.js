#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = resolve(process.argv[2] ?? resolve(projectRoot, "src"));
const sourcePattern = /\.(?:ts|tsx)$/;
const blockedLegacySymbols = new Set([
  "useLegacyChatbotRuntime",
  "useChatbotContext",
  "useOptionalChatbotContext",
  "useChatSessionContext",
]);
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

function isUnder(relativePath, root) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

function isCandidate(relativePath) {
  return isUnder(relativePath, "core/copilot") || isUnder(relativePath, "shared/copilot");
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

function sourceScriptKind(file) {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function moduleText(expression) {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : null;
}

function importedBindingNames(node) {
  const names = [];
  if (ts.isImportEqualsDeclaration(node)) {
    names.push(node.name.text);
    return names;
  }
  const clause = node.importClause;
  if (!clause) return names;
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    names.push(clause.namedBindings.name.text);
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      if (element.propertyName) names.push(element.propertyName.text);
      names.push(element.name.text);
    }
  }
  return names;
}

function analyzeSource(file, content, production) {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    sourceScriptKind(file),
  );
  const imports = [];
  const legacySymbols = new Set();
  let usesChatbot = false;

  function collectImport(specifier, node) {
    if (specifier !== null) imports.push(specifier);
    if (importedBindingNames(node).includes("useChatbot")) usesChatbot = true;
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      collectImport(moduleText(node.moduleSpecifier), node);
    } else if (ts.isExportDeclaration(node)) {
      const specifier = moduleText(node.moduleSpecifier);
      if (specifier !== null) imports.push(specifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      collectImport(moduleText(node.moduleReference.expression), node);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = moduleText(node.arguments[0]);
      if (specifier !== null) imports.push(specifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const specifier = moduleText(node.argument.literal);
      if (specifier !== null) imports.push(specifier);
    }

    if (production && ts.isCallExpression(node)) {
      const calledName = calledIdentifierName(node.expression);
      if (calledName === "useChatbot") usesChatbot = true;
      if (calledName && blockedLegacySymbols.has(calledName)) {
        legacySymbols.add(calledName);
      }
    }

    if (
      production &&
      ts.isIdentifier(node) &&
      blockedLegacySymbols.has(node.text)
    ) {
      legacySymbols.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { imports, legacySymbols, usesChatbot };
}

function calledIdentifierName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) return moduleText(expression.argumentExpression);
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return calledIdentifierName(expression.expression);
  }
  return null;
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
  return relativeTarget.startsWith("../") ? null : relativeTarget;
}

function isCopilotImplementationImport(file, specifier) {
  const target = resolvedSourceTarget(file, specifier);
  return target !== null && isCandidate(target);
}

function isRepositoryBarrel(specifier) {
  return /(?:^|\/)repositories(?:\/index)?$/.test(specifier);
}

function isChatbotRepository(specifier) {
  return /(?:^|\/)chatbot\.repository(?:$|[/.])/.test(specifier);
}

function isCopilotRelated(file, relativePath, imports) {
  return (
    isUnder(relativePath, "features/chatbot") ||
    relativePath.toLowerCase().includes("copilot") ||
    imports.some(
      (specifier) =>
        specifier === "@copilot" ||
        specifier.startsWith("@copilot/") ||
        isCopilotImplementationImport(file, specifier),
    )
  );
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
  const production = isProduction(relativePath);
  const analysis = analyzeSource(file, readFileSync(file, "utf8"), production);
  const copilotRelated = isCopilotRelated(file, relativePath, analysis.imports);
  const infrastructureCopilot = isUnder(relativePath, "infrastructure/copilot");

  for (const specifier of analysis.imports) {
    if (!isCandidate(relativePath) && isCopilotImplementationImport(file, specifier)) {
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
      copilotRelated &&
      !infrastructureCopilot &&
      (isRepositoryBarrel(specifier) || isChatbotRepository(specifier))
    ) {
      record(relativePath, `Copilot repository import outside infrastructure/copilot '${specifier}'`);
    }
  }

  for (const identifier of analysis.legacySymbols) {
    record(relativePath, `legacy runtime identifier '${identifier}'`);
  }
  if (analysis.usesChatbot) {
    record(relativePath, "legacy useChatbot import or call");
  }
}

violations.sort();
if (violations.length > 0) {
  console.error(`Copilot dogfood boundary violations:\n${violations.join("\n")}`);
  process.exit(1);
}

console.log(`Copilot dogfood boundary passed (${files.length} files scanned).`);
