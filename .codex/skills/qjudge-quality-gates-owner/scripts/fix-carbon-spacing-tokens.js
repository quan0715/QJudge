#!/usr/bin/env node

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = resolve(
  process.cwd(),
  rootIndex >= 0 ? args[rootIndex + 1] : "frontend/src",
);
const write = args.includes("--write");
const supportedExtensions = new Set([".css", ".scss", ".sass"]);

const tokenByRem = new Map([
  [0.125, "01"],
  [0.25, "02"],
  [0.5, "03"],
  [0.75, "04"],
  [1, "05"],
  [1.5, "06"],
  [2, "07"],
  [2.5, "08"],
  [3, "09"],
  [4, "10"],
  [5, "11"],
  [6, "12"],
  [10, "13"],
]);

const spacingDeclaration = /(\b(?:margin(?:-(?:block|inline|top|right|bottom|left))?|padding(?:-(?:block|inline|top|right|bottom|left))?|gap|row-gap|column-gap)\s*:\s*)([^;\n}]+)(?=;)/gi;
const lengthValue = /(?<![-\w.])(\d*\.?\d+)(rem|px)\b/gi;

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function maskComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, " "));
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

function replaceSpacingValue(value) {
  return value.replace(lengthValue, (match, amount, unit, offset) => {
    const activeFunctions = activeFunctionsAt(value, offset).filter(Boolean);
    const isSafeFunctionContext = activeFunctions.every((functionName) =>
      safeCssMathFunctions.has(functionName.toLowerCase()),
    );
    if (!isSafeFunctionContext) return match;

    const rem = unit.toLowerCase() === "px" ? Number(amount) / 16 : Number(amount);
    const token = tokenByRem.get(rem);
    return token ? `var(--cds-spacing-${token})` : match;
  });
}

function transform(source) {
  const cleanSource = maskComments(source);
  const edits = [];
  for (const match of cleanSource.matchAll(spacingDeclaration)) {
    const valueStart = match.index + match[1].length;
    const valueEnd = valueStart + match[2].length;
    const originalValue = source.slice(valueStart, valueEnd);
    const nextValue = replaceSpacingValue(originalValue);
    if (nextValue !== originalValue) {
      edits.push({ start: valueStart, end: valueEnd, value: nextValue });
    }
  }

  return edits
    .reverse()
    .reduce(
      (result, edit) =>
        `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`,
      source,
    );
}

if (!statSync(root).isDirectory()) {
  throw new Error(`Spacing token root is not a directory: ${root}`);
}

let changedFiles = 0;
for (const file of walk(root)) {
  const source = readFileSync(file, "utf8");
  const nextSource = transform(source);
  if (nextSource === source) continue;
  changedFiles += 1;
  if (write) writeFileSync(file, nextSource);
}

console.log(
  `${write ? "Updated" : "Would update"} ${changedFiles} style file(s) with exact Carbon spacing tokens.`,
);
