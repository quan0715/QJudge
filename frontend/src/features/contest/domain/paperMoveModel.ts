import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import type { ExamPaperReorderBlock } from "@/infrastructure/api/repositories/examPaper.repository";
export type PaperDragItem = {
  kind: "question" | "group" | "child";
  id: string;
  groupId: string | null;
};
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
  /** The row is the visual bottom of its top-level block. */
  endsBlock: boolean;
};
export function resolveDropTarget(
  row: PaperRowRef,
  drag: PaperDragItem,
  ratio: number,
): PaperMoveTarget | null {
  if ((row.questionId ?? row.blockId) === drag.id) return null;
  const position = ratio < 0.5 ? "before" : "after";
  if (drag.kind === "child") {
    if (row.kind !== "child" || row.blockId !== drag.groupId || !row.questionId)
      return null;
    return {
      zone: "group",
      groupId: row.blockId,
      refQuestionId: row.questionId,
      position,
    };
  }
  if (row.blockId === drag.id) return null;
  // A drop line under a group header or a middle child would look like a
  // position inside the group, so only the block's bottom row accepts "after".
  if (row.kind === "child")
    return row.endsBlock && position === "after"
      ? { zone: "top", refBlockId: row.blockId, position }
      : null;
  return {
    zone: "top",
    refBlockId: row.blockId,
    position: row.endsBlock ? position : "before",
  };
}
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
