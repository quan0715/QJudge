import { readdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const componentFiles = readdirSync(sourceRoot, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile())
  .map((entry) => relative(sourceRoot, resolve(entry.parentPath, entry.name)))
  .filter(
    (file) =>
      file.endsWith(".tsx") &&
      !/\.(?:test|spec|stories)\.tsx$/.test(file) &&
      !file.endsWith("/routes.tsx"),
  );

describe("UI library component ownership", () => {
  it("keeps one production owner for every component name", () => {
    const filesByName = new Map<string, string[]>();

    for (const file of componentFiles) {
      const name = basename(file, ".tsx");
      filesByName.set(name, [...(filesByName.get(name) ?? []), file]);
    }

    const duplicates = [...filesByName.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => ({ name, files: files.sort() }))
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(duplicates).toEqual([]);
  });
});
