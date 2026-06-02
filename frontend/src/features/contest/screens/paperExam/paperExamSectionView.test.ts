import { describe, expect, it } from "vitest";

import type {
  ExamPaperSection,
  ExamQuestion,
  ExamQuestionGroup,
} from "@/core/entities/contest.entity";

import { buildQuestionPresentationById } from "./paperExamSectionView";

const createQuestion = (id: string, groupId?: string | null): ExamQuestion => ({
  id,
  contestId: "contest-1",
  questionType: "essay",
  prompt: id,
  options: [],
  explanation: "",
  score: 5,
  order: Number(id.replace("q", "")) || 1,
  groupId,
  orderInGroup: groupId ? Number(id.replace("q", "")) || 1 : null,
  answerFormat: "markdown_math",
  createdAt: "",
  updatedAt: "",
});

const group: ExamQuestionGroup = {
  id: "group-1",
  contestId: "contest-1",
  title: "題組",
  sharedStemMarkdown: "共同題幹",
  order: 1,
  totalScore: 10,
  createdAt: "",
  updatedAt: "",
};

describe("buildQuestionPresentationById", () => {
  it("uses sections to decide group stem visibility while navigation stays flat", () => {
    const first = createQuestion("q1", group.id);
    const second = createQuestion("q2", group.id);
    const flat = createQuestion("q3");
    const sections: ExamPaperSection[] = [
      { kind: "group", group, items: [first, second] },
      { kind: "flat", item: flat },
    ];

    const single = buildQuestionPresentationById(sections, "single");
    const all = buildQuestionPresentationById(sections, "all");

    expect(single.get(first.id)).toEqual({ group, showGroupStem: true });
    expect(single.get(second.id)).toEqual({ group, showGroupStem: true });
    expect(all.get(first.id)).toEqual({ group, showGroupStem: true });
    expect(all.get(second.id)).toEqual({ group, showGroupStem: false });
    expect(all.get(flat.id)).toEqual({ group: undefined, showGroupStem: false });
  });
});
