import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import type { ExamPaperReorderBlock } from "@/infrastructure/api/repositories/examPaper.repository";
export type PaperMoveTarget =
  | { zone: "top"; refBlockId: string; position: "before" | "after" }
  | {
      zone: "group";
      groupId: string;
      refQuestionId: string;
      position: "before" | "after";
    };
export type PaperRowRef = {
  kind: "question" | "group" | "child";
  blockId: string;
  questionId: string | null;
};
export function movePaperItem(
  blocks: ExamPaperBlock[],
  itemId: string,
  target: PaperMoveTarget,
): ExamPaperBlock[] {
  let next: ExamPaperBlock[];
  if (target.zone === "top") {
    const source = blocks.find((b) => b.id === itemId);
    if (
      !source ||
      target.refBlockId === itemId ||
      !blocks.some((b) => b.id === target.refBlockId)
    )
      return blocks;
    next = blocks.filter((b) => b.id !== itemId);
    const index =
      next.findIndex((b) => b.id === target.refBlockId) +
      (target.position === "after" ? 1 : 0);
    next.splice(index, 0, source);
  } else {
    const group = blocks.find((b) => b.id === target.groupId);
    if (group?.kind !== "group" || target.refQuestionId === itemId)
      return blocks;
    const source = group.children.find((q) => q.id === itemId);
    if (!source || !group.children.some((q) => q.id === target.refQuestionId))
      return blocks;
    const children = group.children.filter((q) => q.id !== itemId);
    const index =
      children.findIndex((q) => q.id === target.refQuestionId) +
      (target.position === "after" ? 1 : 0);
    children.splice(index, 0, source);
    next = blocks.map((b) => (b.id === group.id ? { ...group, children } : b));
  }
  let order = 0;
  return next.map((b) => {
    if (b.kind === "question")
      return { ...b, question: { ...b.question, order: order++ } };
    const groupOrder = order;
    const children = b.children.map((q, index) => ({
      ...q,
      order: order++,
      orderInGroup: index + 1,
    }));
    if (!children.length) order++;
    return { ...b, group: { ...b.group, order: groupOrder }, children };
  });
}
export function toReorderPayload(
  blocks: ExamPaperBlock[],
): ExamPaperReorderBlock[] {
  return blocks.map((b) =>
    b.kind === "question"
      ? { kind: "question", id: b.id }
      : { kind: "group", id: b.id, children: b.children.map((q) => q.id) },
  );
}
