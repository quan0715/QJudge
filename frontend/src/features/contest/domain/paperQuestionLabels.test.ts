import { describe, expect, it } from "vitest";
import { buildPaperQuestionLabels } from "./paperQuestionLabels";

describe("buildPaperQuestionLabels", () => {
  it("numbers groups and standalone questions without changing their IDs", () => {
    const labels = buildPaperQuestionLabels([
      { id: "one" }, { id: "a", groupId: "g" }, { id: "b", groupId: "g" },
      { id: "three" }, { id: "c", groupId: "next" },
    ]);
    expect([...labels.values()].map((x) => x.label)).toEqual(["1", "2(a)", "2(b)", "3", "4(a)"]);
    expect(labels.get("b")?.mainNumber).toBe(2);
  });
  it("continues past z for large groups", () => {
    const labels = buildPaperQuestionLabels(Array.from({ length: 27 }, (_, i) => ({ id: String(i), groupId: "g" })));
    expect(labels.get("26")?.label).toBe("1(aa)");
  });
  it("applies the expanded numbering rule to every group in the paper", () => {
    const labels = buildPaperQuestionLabels([
      { id: "one" }, { id: "a", groupId: "g" }, { id: "b", groupId: "g" },
      { id: "c", groupId: "next" }, { id: "d", groupId: "next" }, { id: "last" },
    ], true);
    expect([...labels.values()].map((x) => x.label)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(labels.get("a")?.groupLabel).toBe("2–3");
    expect(labels.get("b")?.groupLabel).toBe("2–3");
    expect(labels.get("d")?.groupLabel).toBe("4–5");
  });
});
