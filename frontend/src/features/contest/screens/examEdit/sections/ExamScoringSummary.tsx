import React, { useMemo } from "react";
import { Tag, Tile } from "@carbon/react";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  essay: "問答題",
};

interface ExamScoringSummaryProps {
  questions: ExamQuestion[];
  registerRef: (el: HTMLElement | null) => void;
}

const ExamScoringSummary: React.FC<ExamScoringSummaryProps> = ({ questions, registerRef }) => {
  const stats = useMemo(() => {
    const byType: Record<string, { count: number; totalScore: number }> = {};
    let totalScore = 0;

    for (const q of questions) {
      totalScore += q.score;
      if (!byType[q.questionType]) {
        byType[q.questionType] = { count: 0, totalScore: 0 };
      }
      byType[q.questionType].count++;
      byType[q.questionType].totalScore += q.score;
    }

    return { byType, totalScore, totalCount: questions.length };
  }, [questions]);

  return (
    <section id="scoring-summary" ref={registerRef}>
      <h3 style={{ fontSize: "var(--cds-heading-03-font-size)", fontWeight: 600, marginBottom: "1.5rem" }}>
        配分總覽
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <Tile style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
            題目總數
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{stats.totalCount}</div>
        </Tile>
        <Tile style={{ padding: "1rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
            總分
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{stats.totalScore}</div>
        </Tile>
      </div>

      {Object.keys(stats.byType).length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h4 style={{ fontSize: "var(--cds-heading-compact-01-font-size)", fontWeight: 600, marginBottom: "0.75rem" }}>
            題型分布
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {Object.entries(stats.byType).map(([type, data]) => (
              <Tag key={type} type="outline" size="md">
                {TYPE_LABEL[type as ExamQuestionType] || type}：{data.count} 題 / {data.totalScore} 分
              </Tag>
            ))}
          </div>
        </div>
      )}

      {questions.length === 0 && (
        <p style={{ color: "var(--cds-text-secondary)", marginTop: "1rem" }}>
          尚未建立考試題目，請先在「考試題目」區塊新增題目。
        </p>
      )}
    </section>
  );
};

export default ExamScoringSummary;
