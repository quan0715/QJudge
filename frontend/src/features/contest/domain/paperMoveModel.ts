import type { ExamPaperBlock, ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamPaperReorderBlock } from "@/infrastructure/api/repositories/examPaper.repository";

export type PaperDragItem = { kind: "question" | "group" | "child"; id: string; groupId: string | null };
export type PaperMoveTarget =
  | { zone: "top"; refBlockId: string; position: "before" | "after" }
  | { zone: "group"; groupId: string; refQuestionId: string | null; position: "before" | "after" };
export type PaperRowRef = { kind: "question" | "group" | "child"; blockId: string; questionId: string | null; isLastInBlock: boolean; firstChildId: string | null };

export function resolveDropTarget(row: PaperRowRef, drag: PaperDragItem, ratio: number): PaperMoveTarget | null {
  if ((row.questionId ?? row.blockId) === drag.id || (drag.kind === "group" && drag.id === row.blockId)) return null;
  if (drag.kind === "group") return { zone: "top", refBlockId: row.blockId, position: ratio < 0.5 ? "before" : "after" };
  if (row.kind === "group") return ratio < 0.35
    ? { zone: "top", refBlockId: row.blockId, position: "before" }
    : { zone: "group", groupId: row.blockId, refQuestionId: row.firstChildId, position: "before" };
  if (row.kind === "child") return row.isLastInBlock && ratio > 0.7
    ? { zone: "top", refBlockId: row.blockId, position: "after" }
    : { zone: "group", groupId: row.blockId, refQuestionId: row.questionId, position: ratio < 0.5 ? "before" : "after" };
  return { zone: "top", refBlockId: row.blockId, position: ratio < 0.5 ? "before" : "after" };
}

export function movePaperItem(blocks: ExamPaperBlock[], itemId: string, target: PaperMoveTarget): ExamPaperBlock[] {
  const sourceBlock = blocks.find(b => b.id === itemId);
  const sourceQuestion = sourceBlock?.kind === "question" ? sourceBlock.question
    : blocks.flatMap(b => b.kind === "group" ? b.children : []).find(q => q.id === itemId);
  if (!sourceBlock && !sourceQuestion) return blocks;
  if (target.zone === "group") {
    const group = blocks.find(b => b.kind === "group" && b.id === target.groupId);
    if (sourceBlock?.kind === "group" || group?.kind !== "group" || target.refQuestionId === itemId ||
      (target.refQuestionId !== null && !group.children.some(q => q.id === target.refQuestionId))) return blocks;
  } else if (target.refBlockId === itemId || !blocks.some(b => b.id === target.refBlockId)) return blocks;

  const next = blocks.filter(b => b.id !== itemId).map(b => b.kind === "group"
    ? { ...b, children: b.children.filter(q => q.id !== itemId) } : b);
  if (target.zone === "top") {
    const item: ExamPaperBlock = sourceBlock?.kind === "group" ? sourceBlock : { kind: "question", id: itemId, question: sourceQuestion! };
    const index = next.findIndex(b => b.id === target.refBlockId);
    next.splice(index + (target.position === "after" ? 1 : 0), 0, item);
  } else {
    const group = next.find(b => b.id === target.groupId);
    if (group?.kind !== "group") return blocks;
    const index = target.refQuestionId === null ? group.children.length
      : group.children.findIndex(q => q.id === target.refQuestionId) + (target.position === "after" ? 1 : 0);
    group.children.splice(index, 0, sourceQuestion!);
  }
  let order = 0;
  return next.map(b => {
    if (b.kind === "question") return { ...b, question: { ...b.question, groupId: null, orderInGroup: null, order: order++ } };
    const groupOrder = order;
    const children = b.children.map((q, index) => ({ ...q, groupId: b.id, orderInGroup: index + 1, order: order++ }));
    if (children.length === 0) order++;
    return { ...b, group: { ...b.group, order: groupOrder, totalScore: children.reduce((sum, q) => sum + q.score, 0) }, children };
  });
}

export function toReorderPayload(blocks: ExamPaperBlock[]): ExamPaperReorderBlock[] {
  return blocks.map(b => b.kind === "question" ? { kind: "question", id: b.id }
    : { kind: "group", id: b.id, children: b.children.map(q => q.id) });
}
