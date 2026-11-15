import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = resolve(projectRoot, "src");
const coreDocsRoot = resolve(projectRoot, "src/core/docs");
const sharedDocsRoot = resolve(projectRoot, "src/shared/docs");
const roots = [coreDocsRoot, sharedDocsRoot];

const sourcePattern = /\.(?:ts|tsx)$/;

const coreBlockedExternal = ["react", "react-router", "i18next", "@carbon"];
const coreBlockedSourceTargets = [
  ["features", "product feature"],
  ["shared", "shared layer"],
  ["infrastructure", "infrastructure layer"],
  ["i18n", "i18n layer"],
  ["styles", "styles layer"],
  ["assets", "assets layer"],
  ["app", "app layer"],
];

const sharedBlockedSourceTargets = [
  ["features", "product feature"],
  ["infrastructure", "QJudge infrastructure"],
  ["shared/brand", "QJudge brand asset"],
  ["shared/contexts", "product context"],
  ["app", "app layer"],
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

function isAllowedI18nInShared(target) {
  return (
    target === "i18n/languages" ||
    target.startsWith("i18n/languages.") ||
    isUnder(target, "i18n/locales")
  );
}

for (const file of roots.flatMap(filesUnder).filter((path) => sourcePattern.test(path))) {
  const content = readFileSync(file, "utf8");
  const label = toPosix(relative(projectRoot, file));
  const imports = importedSpecifiers(file, content);
  const inCore = isUnder(toPosix(relative(sourceRoot, file)), "core/docs");

  for (const specifier of imports) {
    const target = resolvedSourceTarget(file, specifier);

    if (inCore) {
      for (const blocked of coreBlockedExternal) {
        if (specifier === blocked || specifier.startsWith(`${blocked}/`)) {
          violations.push(`${label}: blocked external import '${specifier}' in core/docs`);
        }
      }

      if (target !== null) {
        for (const [blockedRoot, reason] of coreBlockedSourceTargets) {
          if (isUnder(target, blockedRoot)) {
            violations.push(`${label}: blocked ${reason} import '${specifier}' in core/docs`);
          }
        }
        if (!isUnder(target, "core/docs")) {
          violations.push(`${label}: core/docs must only import within core/docs (found '${specifier}')`);
        }
      }
      continue;
    }

    if (target !== null) {
      for (const [blockedRoot, reason] of sharedBlockedSourceTargets) {
        if (isUnder(target, blockedRoot)) {
          violations.push(`${label}: blocked ${reason} import '${specifier}' in shared/docs`);
        }
      }
      if (isUnder(target, "i18n") && !isAllowedI18nInShared(target)) {
        violations.push(`${label}: blocked global i18n bundle import '${specifier}' in shared/docs`);
      }
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(`Docs package boundary passed (${roots.length} roots).`);
