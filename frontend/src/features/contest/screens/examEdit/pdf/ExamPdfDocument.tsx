import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ContestDetail, ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";

// ── Fonts ──────────────────────────────────────────────────────────
Font.register({
  family: "NotoSansTC",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf",
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: "SourceCodePro",
  src: "https://fonts.gstatic.com/s/sourcecodepro/v31/HI_diYsKILxRpg3hIP6sJ7fM7PqPMcMnZFqUwX28DMyQhM4.ttf",
});

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 11,
    padding: 40,
    lineHeight: 1.5,
  },
  // Header — left-aligned, like body text
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
  },
  headerInfo: {
    fontSize: 10,
    color: "#444",
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 10,
    color: "#444",
    marginTop: 6,
  },
  // Section
  sectionHeader: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 20,
    marginBottom: 10,
  },
  // Question
  questionBlock: {
    marginBottom: 16,
  },
  questionLine: {
    fontSize: 11,
  },
  bold: {
    fontWeight: 700,
  },
  // Code block
  codeBlock: {
    fontFamily: "SourceCodePro",
    fontSize: 9,
    backgroundColor: "#f5f5f5",
    padding: 8,
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  // Options
  optionRow: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 16,
  },
  optionLabel: {
    fontSize: 11,
    width: 28,
  },
  optionText: {
    fontSize: 11,
    flex: 1,
  },
  // Answer
  answerLine: {
    fontSize: 10,
    fontWeight: 700,
    color: "#da1e28",
    marginTop: 4,
    paddingLeft: 16,
  },
});

// ── Constants ──────────────────────────────────────────────────────
const QUESTION_TYPE_LABELS: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// ── Helpers ────────────────────────────────────────────────────────
function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAnswer(question: ExamQuestion): string {
  const { questionType, correctAnswer, options } = question;
  if (correctAnswer === undefined || correctAnswer === null) return "（未設定）";

  if (questionType === "true_false") {
    return correctAnswer === true || correctAnswer === "true" ? "O（正確）" : "X（錯誤）";
  }

  if (questionType === "single_choice") {
    const idx = typeof correctAnswer === "number" ? correctAnswer : parseInt(String(correctAnswer), 10);
    if (!isNaN(idx) && options[idx]) {
      return `(${OPTION_LETTERS[idx]}) ${options[idx]}`;
    }
    return String(correctAnswer);
  }

  if (questionType === "multiple_choice") {
    if (Array.isArray(correctAnswer)) {
      return (correctAnswer as number[])
        .map((idx) => `(${OPTION_LETTERS[idx]})`)
        .join(", ");
    }
    return String(correctAnswer);
  }

  return String(correctAnswer);
}

/**
 * Split prompt into text segments and code blocks.
 * Code blocks are delimited by triple-backtick fences (```).
 */
function parsePromptSegments(prompt: string): Array<{ type: "text" | "code"; content: string }> {
  const segments: Array<{ type: "text" | "code"; content: string }> = [];
  const parts = prompt.split(/```(?:\w*\n?)?/);
  parts.forEach((part, i) => {
    if (!part) return;
    const type = i % 2 === 0 ? "text" : "code";
    segments.push({ type, content: type === "code" ? part.replace(/^\n|\n$/g, "") : part });
  });
  return segments;
}

// ── Component ──────────────────────────────────────────────────────
interface ExamPdfDocumentProps {
  contest: ContestDetail;
  questions: ExamQuestion[];
  mode: "question" | "answer";
}

const ExamPdfDocument: React.FC<ExamPdfDocumentProps> = ({
  contest,
  questions,
  mode,
}) => {
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const totalScore = sortedQuestions.reduce((sum, q) => sum + q.score, 0);

  // Group by question type
  const grouped = sortedQuestions.reduce<Record<ExamQuestionType, ExamQuestion[]>>(
    (acc, q) => {
      if (!acc[q.questionType]) acc[q.questionType] = [];
      acc[q.questionType].push(q);
      return acc;
    },
    {} as Record<ExamQuestionType, ExamQuestion[]>,
  );

  let questionCounter = 0;

  /** Render the answer block for a question (answer mode only). */
  const renderAnswer = (q: ExamQuestion) => {
    const isLongForm = q.questionType === "essay" || q.questionType === "short_answer";
    const raw = formatAnswer(q);

    if (!isLongForm) {
      return <Text style={styles.answerLine}>Ans: {raw}</Text>;
    }

    // Long-form answers may contain Markdown code blocks
    const segments = parsePromptSegments(raw);
    const hasCode = segments.some((s) => s.type === "code");

    if (!hasCode) {
      return <Text style={styles.answerLine}>Ans: {raw}</Text>;
    }

    return (
      <View style={{ marginTop: 4, paddingLeft: 16 }}>
        <Text style={styles.answerLine}>Ans:</Text>
        {segments.map((seg, i) =>
          seg.type === "code" ? (
            <Text key={i} style={styles.codeBlock}>{seg.content}</Text>
          ) : (
            <Text key={i} style={{ ...styles.answerLine, marginTop: 0 }}>{seg.content}</Text>
          ),
        )}
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>{contest.name}</Text>
          <Text style={styles.headerInfo}>
            {formatDateTime(contest.startTime)} ~ {formatDateTime(contest.endTime)}
          </Text>
          {contest.description && (
            <Text style={styles.headerInfo}>{contest.description}</Text>
          )}
          {contest.rules && (
            <Text style={styles.headerInfo}>{contest.rules}</Text>
          )}
          <Text style={styles.headerMeta}>
            共 {sortedQuestions.length} 題，滿分 {totalScore} 分
            {mode === "answer" ? "　（答案卷）" : ""}
          </Text>
        </View>

        {/* ── Questions ── */}
        {(Object.keys(grouped) as ExamQuestionType[]).map((type) => (
          <View key={type}>
            <Text style={styles.sectionHeader}>
              {QUESTION_TYPE_LABELS[type]}（共 {grouped[type].length} 題）
            </Text>

            {grouped[type].map((q) => {
              questionCounter++;
              const isChoice =
                q.questionType === "single_choice" ||
                q.questionType === "multiple_choice";
              const segments = parsePromptSegments(q.prompt);
              const hasCode = segments.some((s) => s.type === "code");

              return (
                <View key={q.id} style={styles.questionBlock} wrap={false}>
                  {/* Question text — inline when no code blocks */}
                  {!hasCode ? (
                    <Text style={styles.questionLine}>
                      <Text style={styles.bold}>{questionCounter}.</Text>
                      {` (${q.score}%) ${q.prompt}`}
                    </Text>
                  ) : (
                    <View>
                      <Text style={styles.questionLine}>
                        <Text style={styles.bold}>{questionCounter}.</Text>
                        {` (${q.score}%) ${segments[0]?.type === "text" ? segments[0].content : ""}`}
                      </Text>
                      {segments.map((seg, i) => {
                        if (i === 0 && seg.type === "text") return null;
                        if (seg.type === "code") {
                          return (
                            <Text key={i} style={styles.codeBlock}>
                              {seg.content}
                            </Text>
                          );
                        }
                        return (
                          <Text key={i} style={styles.questionLine}>
                            {seg.content}
                          </Text>
                        );
                      })}
                    </View>
                  )}

                  {/* Options */}
                  {isChoice &&
                    q.options.map((opt, idx) => (
                      <View key={idx} style={styles.optionRow}>
                        <Text style={styles.optionLabel}>
                          ({OPTION_LETTERS[idx]})
                        </Text>
                        <Text style={styles.optionText}>{opt}</Text>
                      </View>
                    ))}

                  {/* Answer */}
                  {mode === "answer" && renderAnswer(q)}
                </View>
              );
            })}
          </View>
        ))}
      </Page>
    </Document>
  );
};

export default ExamPdfDocument;
