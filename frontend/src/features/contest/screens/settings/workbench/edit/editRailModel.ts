import type { TFunction } from "i18next";
import type {
  ExamPaper,
  ExamQuestion,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels, formatPaperQuestionLabel } from "@/features/contest/domain/paperQuestionLabels";
import type { PaperRowRef } from "@/features/contest/domain/paperMoveModel";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
export interface EditRailRow extends PaperRowRef {
  key: string;
  label: string;
  title: string;
  questionType?: ExamQuestionType;
  typeText: string;
  hasIssue: boolean;
}
export function buildEditRailRows(
  paper: ExamPaper,
  issues: ExamPublishIssueItem[],
  t: TFunction,
): EditRailRow[] {
  const numbered = paper.blocks.flatMap<Pick<ExamQuestion, "id" | "groupId" | "expandQuestionNumbers">>(
    (b) =>
      b.kind === "question"
        ? [b.question]
        : b.children.length
          ? b.children
          : paper.expandQuestionNumbers ? [] : [{ id: b.id, groupId: b.id }],
  );
  const labels = buildPaperQuestionLabels(numbered, paper.expandQuestionNumbers);
  const issueIds = new Set(issues.map((item) => item.questionId));
  const rows: EditRailRow[] = [];
  const typeNames = {
    single_choice: "單選題",
    multiple_choice: "多選題",
    true_false: "是非題",
    short_answer: "簡答題",
    essay: "問答題",
  };
  for (const b of paper.blocks) {
    const number =
      labels.get(
        b.kind === "question" ? b.question.id : (b.children[0]?.id ?? b.id),
      )?.mainNumber ?? 0;
    if (b.kind === "group")
      rows.push({
        key: b.id,
        kind: "group",
        blockId: b.id,
        questionId: null,
        label: formatPaperQuestionLabel(labels.get(b.children[0]?.id ?? b.id)?.groupLabel ?? ""),
        title: b.group.title || t("workbench.edit.addGroup", "題組"),
        typeText: t("workbench.edit.addGroup", "題組"),
        hasIssue: b.children.some((q) => issueIds.has(q.id)),
      });
    const questions = b.kind === "question" ? [b.question] : b.children;
    questions.forEach((q) =>
      rows.push({
        key: q.id,
        kind: b.kind === "group" ? "child" : "question",
        blockId: b.id,
        questionId: q.id,
        label: formatPaperQuestionLabel(labels.get(q.id)?.label ?? number),
        title: (q.prompt.split("\n").find((line) => line.trim()) ?? "")
          .replace(/[#*_`>]/g, "")
          .trim(),
        questionType: q.questionType,
        typeText: t(
          `common:questionType.label.${q.questionType}`,
          typeNames[q.questionType],
        ),
        hasIssue: issueIds.has(q.id),
      }),
    );
  }
  return rows;
}
