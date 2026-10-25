import { describe, expect, it } from "vitest";
import type {
  ExamPaperBlock,
  ExamQuestion,
} from "@/core/entities/contest.entity";
import { movePaperItem, toReorderPayload } from "./paperMoveModel";
const q = (id: string, groupId: string | null = null): ExamQuestion => ({
  id,
  groupId,
  contestId: "c",
  questionType: "essay",
  prompt: id,
  options: [],
  explanation: "",
  score: 5,
  order: 0,
  createdAt: "",
  updatedAt: "",
});
const blocks: ExamPaperBlock[] = [
  { kind: "question", id: "q1", question: q("q1") },
  {
    kind: "group",
    id: "g",
    group: {
      id: "g",
      contestId: "c",
      title: "G",
      sharedStemMarkdown: "",
      order: 1,
      totalScore: 10,
      createdAt: "",
      updatedAt: "",
    },
    children: [q("c1", "g"), q("c2", "g")],
  },
  { kind: "question", id: "q2", question: q("q2") },
];
describe("paper ordering", () => {
  it("reorders top-level blocks with their groups intact", () => {
    const next = movePaperItem(blocks, "q1", {
      zone: "top",
      refBlockId: "g",
      position: "after",
    });
    expect(next.map((b) => b.id)).toEqual(["g", "q1", "q2"]);
    expect(next[0]).toMatchObject({
      children: [
        { id: "c1", groupId: "g" },
        { id: "c2", groupId: "g" },
      ],
    });
  });
  it("reorders children within their existing group", () => {
    const next = movePaperItem(blocks, "c2", {
      zone: "group",
      groupId: "g",
      refQuestionId: "c1",
      position: "before",
    });
    expect(next[1]).toMatchObject({
      children: [
        { id: "c2", groupId: "g", orderInGroup: 1 },
        { id: "c1", groupId: "g", orderInGroup: 2 },
      ],
    });
    expect(blocks[1]).toMatchObject({ children: [{ id: "c1" }, { id: "c2" }] });
  });
  it("does not change membership while ordering", () => {
    expect(
      movePaperItem(blocks, "q1", {
        zone: "group",
        groupId: "g",
        refQuestionId: "c1",
        position: "before",
      }),
    ).toBe(blocks);
    expect(
      movePaperItem(blocks, "c1", {
        zone: "top",
        refBlockId: "g",
        position: "after",
      }),
    ).toBe(blocks);
  });
  it("serialises each group's unchanged membership", () =>
    expect(toReorderPayload(blocks)[1]).toEqual({
      kind: "group",
      id: "g",
      children: ["c1", "c2"],
    }));
});
