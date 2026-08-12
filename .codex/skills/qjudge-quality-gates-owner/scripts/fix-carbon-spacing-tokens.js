#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage: node fix-carbon-spacing-tokens.js [options]

Options:
  --root <path>  Style file or directory to migrate (default: frontend/src)
  --write        Write changes instead of reporting the number of affected files
  --help         Show this help

SCSS uses @carbon/layout Sass tokens. Plain CSS uses the canonical rem value because
Carbon React does not emit --cds-spacing-* runtime custom properties.
`);
  process.exit(0);
}

const rootIndex = args.indexOf("--root");
const root = resolve(
  process.cwd(),
  rootIndex >= 0 ? args[rootIndex + 1] : "frontend/src",
);
const write = args.includes("--write");
const supportedExtensions = new Set([".css", ".scss", ".sass"]);

const remByToken = new Map([
  ["01", 0.125],
  ["02", 0.25],
  ["03", 0.5],
  ["04", 0.75],
  ["05", 1],
  ["06", 1.5],
  ["07", 2],
  ["08", 2.5],
  ["09", 3],
  ["10", 4],
  ["11", 5],
  ["12", 6],
  ["13", 10],
]);
const tokenByRem = new Map(
  [...remByToken.entries()].map(([token, rem]) => [rem, token]),
);

const spacingDeclaration = /(\b(?:margin(?:-(?:block|inline|top|right|bottom|left))?|padding(?:-(?:block|inline|top|right|bottom|left))?|gap|row-gap|column-gap)\s*:\s*)([^;\n}]+)(?=;)/gi;
const lengthValue = /(?<![-\w.])(\d*\.?\d+)(rem|px)\b/gi;
const invalidRuntimeToken = /var\(\s*--cds-spacing-(0[1-9]|1[0-3])(?:\s*,[^)]*)?\s*\)/gi;
const carbonLayoutUse = /^\s*@use\s+["']@carbon\/layout["'](?:\s+as\s+[\w*-]+)?\s*;?/m;

function walk(target, output = []) {
  const metadata = statSync(target);
  if (metadata.isFile()) {
    if (supportedExtensions.has(extname(target))) output.push(target);
    return output;
  }

  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && ["node_modules", "dist", "coverage", "storybook-static"].includes(entry.name)) {
      continue;
    }
    const fullPath = join(target, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function maskComments(source, extension) {
  let masked = source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  if (extension !== ".css") {
    masked = masked.replace(/(^|\s)\/\/.*$/gm, (comment) =>
      comment.replace(/[^\n]/g, " "),
    );
  }
  return masked;
}

const safeCssMathFunctions = new Set(["calc", "clamp", "max", "min"]);

function activeFunctionsAt(value, offset) {
  const stack = [];
  for (let index = 0; index < offset; index += 1) {
    if (value[index] === "(") {
      const prefix = value.slice(0, index);
      const functionName = prefix.match(/([a-zA-Z_][\w.-]*)\s*$/)?.[1] ?? null;
      stack.push(functionName);
    } else if (value[index] === ")") {
      stack.pop();
    }
  }
  return stack;
}

function replaceExactSpacingLengths(value) {
  return value.replace(lengthValue, (match, amount, unit, offset) => {
    const activeFunctions = activeFunctionsAt(value, offset).filter(Boolean);
    const isSafeFunctionContext = activeFunctions.every((functionName) =>
      safeCssMathFunctions.has(functionName.toLowerCase()),
    );
    if (!isSafeFunctionContext) return match;

    const rem = unit.toLowerCase() === "px" ? Number(amount) / 16 : Number(amount);
    const token = tokenByRem.get(rem);
    return token ? `layout.$spacing-${token}` : match;
  });
}

function applyEdits(source, edits) {
  return edits
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, edit) =>
        `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`,
      source,
    );
}

function transformSass(source, extension) {
  const cleanSource = maskComments(source, extension);
  const runtimeTokenEdits = [];

  for (const match of cleanSource.matchAll(invalidRuntimeToken)) {
    runtimeTokenEdits.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `layout.$spacing-${match[1]}`,
    });
  }

  const tokenMigratedSource = applyEdits(source, runtimeTokenEdits);
  const tokenMigratedCleanSource = maskComments(tokenMigratedSource, extension);
  const lengthEdits = [];
  for (const match of tokenMigratedCleanSource.matchAll(spacingDeclaration)) {
    const valueStart = match.index + match[1].length;
    const valueEnd = valueStart + match[2].length;
    const originalValue = tokenMigratedSource.slice(valueStart, valueEnd);
    const nextValue = replaceExactSpacingLengths(originalValue);
    if (nextValue !== originalValue) {
      lengthEdits.push({ start: valueStart, end: valueEnd, value: nextValue });
    }
  }

  if (runtimeTokenEdits.length === 0 && lengthEdits.length === 0) return source;
  const migrated = applyEdits(tokenMigratedSource, lengthEdits);
  if (carbonLayoutUse.test(migrated)) return migrated;

  const importLine = extension === ".sass"
    ? '@use "@carbon/layout"\n'
    : '@use "@carbon/layout";\n';
  return `${importLine}${migrated}`;
}

function formatRem(rem) {
  return `${Number.isInteger(rem) ? rem : rem.toString()}rem`;
}

function transformCss(source) {
  const cleanSource = maskComments(source, ".css");
  const edits = [];
  for (const match of cleanSource.matchAll(invalidRuntimeToken)) {
    edits.push({
      start: match.index,
      end: match.index + match[0].length,
      value: formatRem(remByToken.get(match[1])),
    });
  }
  return applyEdits(source, edits);
}

function transform(source, extension) {
  return extension === ".css"
    ? transformCss(source)
    : transformSass(source, extension);
}

if (!existsSync(root)) {
  throw new Error(`Spacing token root does not exist: ${root}`);
}

let changedFiles = 0;
for (const file of walk(root)) {
  const source = readFileSync(file, "utf8");
  const nextSource = transform(source, extname(file));
  if (nextSource === source) continue;
  changedFiles += 1;
  if (write) writeFileSync(file, nextSource);
}

console.log(
  `${write ? "Updated" : "Would update"} ${changedFiles} style file(s) with valid Carbon spacing tokens.`,
);
