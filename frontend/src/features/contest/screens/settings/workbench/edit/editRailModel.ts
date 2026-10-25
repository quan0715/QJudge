import { paperQuestionPoints } from "@/features/contest/domain/scorePolicyChoice";
import type { TFunction } from "i18next";
import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
import type { PaperRowRef } from "@/features/contest/domain/paperMoveModel";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
export interface EditRailRow extends PaperRowRef {
  key: string;
  label: string;
  typeText: string;
  score: number;
  hasIssue: boolean;
}
export function buildEditRailRows(
  paper: ExamPaper,
  issues: ExamPublishIssueItem[],
  t: TFunction,
): EditRailRow[] {
  // Empty groups still occupy a main question number in the authoring rail.
  const numbered = paper.blocks.flatMap<Pick<ExamQuestion, "id" | "groupId">>(
    (b) =>
      b.kind === "question"
        ? [b.question]
        : b.children.length
          ? b.children
          : [{ id: b.id, groupId: b.id }],
  );
  const labels = buildPaperQuestionLabels(numbered);
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
        label: t("workbench.edit.groupNumber", "第 {{number}} 題（題組）", {
          number,
        }),
        typeText: b.children.length
          ? t("workbench.edit.groupSummary", "{{count}} 題 · {{title}}", {
              count: b.children.length,
              title: b.group.title,
            })
          : t("workbench.edit.emptyGroup", "尚無子題"),
        score: b.children.reduce((sum, q) => sum + paperQuestionPoints(q), 0),
        hasIssue: false,
      });
    const questions = b.kind === "question" ? [b.question] : b.children;
    questions.forEach((q) =>
      rows.push({
        key: q.id,
        kind: b.kind === "group" ? "child" : "question",
        blockId: b.id,
        questionId: q.id,
        label:
          b.kind === "group"
            ? (labels.get(q.id)?.label ?? "")
            : t("workbench.edit.questionNumber", "第 {{number}} 題", {
                number,
              }),
        typeText: t(
          `common:questionType.label.${q.questionType}`,
          typeNames[q.questionType],
        ),
        score: paperQuestionPoints(q),
        hasIssue: issueIds.has(q.id),
      }),
    );
  }
  return rows;
}
