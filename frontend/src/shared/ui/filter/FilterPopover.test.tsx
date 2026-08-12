import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FilterPopover Carbon composition", () => {
  it("uses public Carbon components instead of copied implementation classes", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/shared/ui/filter/FilterPopover.tsx"),
      "utf8",
    );

    expect(source).toContain("ButtonSet");
    expect(source).not.toMatch(/\b(?:cds|bx)--/);
  });
});
