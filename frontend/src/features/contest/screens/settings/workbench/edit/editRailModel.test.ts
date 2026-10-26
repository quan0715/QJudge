import { expect, it } from "vitest";
import type { TFunction } from "i18next";
import { paperFixture } from "./workbenchEdit.fixture";
import { buildEditRailRows } from "./editRailModel";
const t = ((key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    String(values?.[k] ?? ""),
  )) as TFunction;
it("labels groups as a main question with lettered children", () => {
  const rows = buildEditRailRows(
    paperFixture(),
    [{ questionId: "c2", kind: "missingAnswer", field: "answer" }],
    t,
  );
  expect(rows.map((r) => r.label)).toEqual([
    "1.",
    "2.",
    "2(a).",
    "2(b).",
    "3.",
  ]);
  expect(rows.filter((r) => r.hasIssue).map((r) => r.key)).toEqual(["g", "c2"]);
});
it("keeps an empty group and its main-question number", () => {
  const paper = paperFixture();
  if (paper.blocks[1].kind === "group") paper.blocks[1].children = [];
  const rows = buildEditRailRows(paper, [], t);
  expect(rows[1]).toMatchObject({ title: "Shared task", typeText: "題組" });
  expect(rows[2].label).toBe("3.");
});

it("provides readable single-line titles and a distinct group type", () => {
  const paper = paperFixture();
  paper.questions[0].prompt = "## **二元搜尋**\n請選出正確的複雜度。";
  const rows = buildEditRailRows(paper, [], t);
  expect(rows[0]).toMatchObject({
    title: "二元搜尋",
    questionType: "single_choice",
    typeText: "單選題",
  });
  expect(rows[1]).toMatchObject({ title: "Shared task", typeText: "題組" });
  expect(rows[2]).toMatchObject({
    title: "Prompt c1",
    questionType: "single_choice",
  });
});
