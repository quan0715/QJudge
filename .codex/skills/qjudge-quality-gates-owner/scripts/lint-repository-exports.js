#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 || index + 1 >= args.length ? fallback : args[index + 1];
}

if (args.includes("--help")) {
  console.log(`Usage: node lint-repository-exports.js [options]

Options:
  --root <path>         Repository module root (default: frontend/src)
  --source-root <path>  Source tree containing consumers (default: frontend/src)
  --tsconfig <path>     TypeScript config (default: frontend/tsconfig.app.json)
  --help                Show this help
`);
  process.exit(0);
}

const valueFlags = new Set(["--root", "--source-root", "--tsconfig"]);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!valueFlags.has(argument)) {
    console.error(`Unknown option: ${argument}`);
    process.exit(2);
  }
  if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
    console.error(`Missing value for option: ${argument}`);
    process.exit(2);
  }
  index += 1;
}

const repositoryRoot = path.resolve(
  process.cwd(),
  getArg("--root", "frontend/src"),
);
const sourceRoot = path.resolve(
  process.cwd(),
  getArg("--source-root", "frontend/src"),
);
const tsconfigPath = path.resolve(
  process.cwd(),
  getArg("--tsconfig", "frontend/tsconfig.app.json"),
);
const typescriptPath = path.resolve(process.cwd(), "frontend/node_modules/typescript");

if (!fs.existsSync(repositoryRoot) || !fs.existsSync(sourceRoot)) {
  console.error("Repository or source root does not exist.");
  process.exit(2);
}
if (!fs.existsSync(typescriptPath)) {
  console.error("TypeScript is required; run npm ci in frontend first.");
  process.exit(2);
}

const ts = require(typescriptPath);
const sourceFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(item);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      sourceFiles.push(item);
    }
  }
}

walk(sourceRoot);

let compilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  allowJs: true,
};
if (fs.existsSync(tsconfigPath)) {
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (config.error) {
    console.error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
    process.exit(2);
  }
  compilerOptions = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(tsconfigPath),
  ).options;
}

const program = ts.createProgram(sourceFiles, compilerOptions);
const checker = program.getTypeChecker();
const repositoryFiles = new Set(
  sourceFiles
    .map((file) => path.resolve(file))
    .filter(
      (file) =>
        file.startsWith(`${repositoryRoot}${path.sep}`) &&
        file.endsWith(".repository.ts"),
    ),
);
const usedExports = new Map(
  [...repositoryFiles].map((file) => [file, new Set()]),
);

function markSymbol(node) {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  for (const declaration of symbol.declarations || []) {
    const declarationFile = path.resolve(declaration.getSourceFile().fileName);
    if (repositoryFiles.has(declarationFile)) {
      usedExports.get(declarationFile).add(symbol.getName());
    }
  }
}

function resolvedModuleFile(sourceFile, specifier) {
  return ts.resolveModuleName(
    specifier,
    sourceFile.fileName,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
}

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile) continue;

  function inspect(node) {
    if (ts.isImportSpecifier(node)) {
      markSymbol(node.name);
    } else if (ts.isImportClause(node) && node.name) {
      const declaration = node.parent;
      if (ts.isImportDeclaration(declaration) && ts.isStringLiteral(declaration.moduleSpecifier)) {
        const resolved = resolvedModuleFile(sourceFile, declaration.moduleSpecifier.text);
        if (resolved && repositoryFiles.has(path.resolve(resolved))) {
          usedExports.get(path.resolve(resolved)).add("default");
        }
      }
    } else if (ts.isNamespaceImport(node)) {
      let moduleSymbol = checker.getSymbolAtLocation(node.parent.parent.moduleSpecifier);
      if (moduleSymbol?.flags & ts.SymbolFlags.Alias) {
        moduleSymbol = checker.getAliasedSymbol(moduleSymbol);
      }
      for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
        for (const declaration of exported.declarations || []) {
          const declarationFile = path.resolve(declaration.getSourceFile().fileName);
          if (repositoryFiles.has(declarationFile)) {
            usedExports.get(declarationFile).add(exported.getName());
          }
        }
      }
    } else if (ts.isImportTypeNode(node) && node.qualifier) {
      const visitQualifier = (qualifier) => {
        if (ts.isIdentifier(qualifier)) markSymbol(qualifier);
        ts.forEachChild(qualifier, visitQualifier);
      };
      visitQualifier(node.qualifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const resolved = resolvedModuleFile(sourceFile, node.arguments[0].text);
      if (resolved && repositoryFiles.has(path.resolve(resolved))) {
        const moduleSymbol = checker.getSymbolAtLocation(
          program.getSourceFile(resolved),
        );
        for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
          usedExports.get(path.resolve(resolved)).add(exported.getName());
        }
      }
    }
    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
}

const violations = [];
for (const file of [...repositoryFiles].sort()) {
  const sourceFile = program.getSourceFile(file);
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) continue;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.getName();
    if (name !== "__esModule" && !usedExports.get(file).has(name)) {
      violations.push({ file, name });
    }
  }
}

if (violations.length > 0) {
  console.error("Unused repository exports found:\n");
  for (const violation of violations) {
    console.error(
      `- ${path.relative(process.cwd(), violation.file)}: ${violation.name}`,
    );
  }
  process.exit(1);
}

console.log("Repository export check passed.");
