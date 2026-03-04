import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "@/features/contest/screens/settings/grading/gradingTypes";

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

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// ── Carbon g100 / g10 palette ──
const C = {
  // text
  textPrimary: "#161616",
  textSecondary: "#525252",
  textPlaceholder: "#a8a8a8",
  textOnColor: "#ffffff",
  textInverse: "#ffffff",
  // interactive
  interactive: "#0f62fe",
  // support
  supportSuccess: "#198038",
  supportError: "#da1e28",
  supportWarning: "#f1c21b",
  supportInfo: "#0043ce",
  // backgrounds
  bgSubtle: "#f4f4f4",
  bgField: "#ffffff",
  bgInverse: "#393939",
  // borders
  borderSubtle: "#e0e0e0",
  borderStrong: "#8d8d8d",
  // tag palette
  tagGreenBg: "#defbe6",
  tagGreenText: "#198038",
  tagRedBg: "#fff1f1",
  tagRedText: "#da1e28",
  tagBlueBg: "#edf5ff",
  tagBlueText: "#0043ce",
  tagGrayBg: "#e0e0e0",
  tagGrayText: "#525252",
  tagPurpleBg: "#f6f2ff",
  tagPurpleText: "#6929c4",
  tagTealBg: "#d9fbfb",
  tagTealText: "#005d5d",
};

const QUESTION_TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
  true_false:      { label: "TF",  bg: C.tagTealBg,   color: C.tagTealText },
  single_choice:   { label: "SC",  bg: C.tagBlueBg,   color: C.tagBlueText },
  multiple_choice: { label: "MC",  bg: C.tagPurpleBg, color: C.tagPurpleText },
  short_answer:    { label: "SA",  bg: C.tagGrayBg,   color: C.tagGrayText },
  essay:           { label: "ES",  bg: C.tagGrayBg,   color: C.tagGrayText },
};

const QUESTION_TYPE_FULL: Record<string, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

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

// ── Styles (Carbon-inspired) ──
const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansTC",
    fontSize: 10,
    padding: 40,
    paddingBottom: 56,
    lineHeight: 1.6,
    color: C.textPrimary,
  },
  // Header
  headerBar: {
    backgroundColor: C.bgInverse,
    marginHorizontal: -40,
    marginTop: -40,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: C.textInverse,
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 10,
    color: C.textPlaceholder,
  },
  // Score summary row
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.bgSubtle,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.interactive,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 700,
    color: C.textPrimary,
  },
  summaryUnit: {
    fontSize: 10,
    fontWeight: 400,
    color: C.textSecondary,
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    marginBottom: 16,
  },
  // Question card
  qCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.borderSubtle,
    backgroundColor: C.bgField,
  },
  qHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    backgroundColor: C.bgSubtle,
  },
  qHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qNumber: {
    fontSize: 10,
    fontWeight: 700,
    color: C.textPrimary,
  },
  qTypeTag: {
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
    letterSpacing: 0.3,
  },
  qTypeFull: {
    fontSize: 8,
    color: C.textSecondary,
  },
  qScore: {
    fontSize: 10,
    fontWeight: 700,
  },
  qBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Prompt
  promptText: {
    fontSize: 10,
    color: C.textPrimary,
    marginBottom: 6,
    lineHeight: 1.6,
  },
  codeBlock: {
    fontFamily: "SourceCodePro",
    fontSize: 8,
    backgroundColor: C.bgSubtle,
    padding: 8,
    marginVertical: 4,
    lineHeight: 1.4,
    borderLeftWidth: 2,
    borderLeftColor: C.borderStrong,
  },
  // Options
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginBottom: 1,
  },
  optionRowSelected: {
    backgroundColor: C.tagBlueBg,
  },
  optionRowCorrect: {
    backgroundColor: C.tagGreenBg,
  },
  optionRowWrong: {
    backgroundColor: C.tagRedBg,
  },
  optionIndicator: {
    width: 14,
    height: 14,
    marginRight: 6,
    marginTop: 1,
  },
  optionLetter: {
    fontSize: 9,
    fontWeight: 700,
    width: 20,
    color: C.textSecondary,
  },
  optionContent: {
    fontSize: 10,
    flex: 1,
    color: C.textPrimary,
  },
  optionAnnotation: {
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 6,
  },
  // Section labels
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Answer / feedback
  answerBox: {
    backgroundColor: C.bgSubtle,
    padding: 8,
    marginTop: 2,
    fontSize: 10,
    color: C.textPrimary,
    lineHeight: 1.5,
  },
  correctAnswerBox: {
    backgroundColor: C.tagGreenBg,
    padding: 8,
    marginTop: 2,
    fontSize: 10,
    color: C.tagGreenText,
    lineHeight: 1.5,
  },
  feedbackBox: {
    padding: 8,
    marginTop: 2,
    fontSize: 9,
    color: C.textSecondary,
    lineHeight: 1.5,
    borderLeftWidth: 2,
    borderLeftColor: C.supportInfo,
    backgroundColor: C.tagBlueBg,
  },
  noAnswer: {
    fontSize: 9,
    color: C.textPlaceholder,
    padding: 8,
  },
  // Footer
  pageNumber: {
    position: "absolute",
    bottom: 24,
    right: 40,
    fontSize: 8,
    color: C.textSecondary,
  },
});

// ── SVG icons (Carbon-style 12px) ──
const CheckmarkIcon = () => (
  <Svg viewBox="0 0 16 16" style={{ width: 10, height: 10 }}>
    <Path d="M6.5 12.4L2 8.3l1-1.2 3.4 3L13 3.6l1.1 1z" fill={C.supportSuccess} />
  </Svg>
);

const CloseIcon = () => (
  <Svg viewBox="0 0 16 16" style={{ width: 10, height: 10 }}>
    <Path d="M12 4.7L11.3 4 8 7.3 4.7 4 4 4.7 7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" fill={C.supportError} />
  </Svg>
);

const RadioFilled = () => (
  <Svg viewBox="0 0 16 16" style={s.optionIndicator}>
    <Circle cx="8" cy="8" r="7" stroke={C.interactive} strokeWidth="1" fill="none" />
    <Circle cx="8" cy="8" r="4" fill={C.interactive} />
  </Svg>
);

const RadioEmpty = () => (
  <Svg viewBox="0 0 16 16" style={s.optionIndicator}>
    <Circle cx="8" cy="8" r="7" stroke={C.borderStrong} strokeWidth="1" fill="none" />
  </Svg>
);

const CheckboxChecked = () => (
  <Svg viewBox="0 0 16 16" style={s.optionIndicator}>
    <Rect x="1" y="1" width="14" height="14" rx="1" fill={C.interactive} />
    <Path d="M6.5 11.1L3.5 8.4l.9-.9 2.1 1.9L11.1 5l.9.9z" fill="#fff" />
  </Svg>
);

const CheckboxEmpty = () => (
  <Svg viewBox="0 0 16 16" style={s.optionIndicator}>
    <Rect x="1.5" y="1.5" width="13" height="13" rx="1" stroke={C.borderStrong} strokeWidth="1" fill="none" />
  </Svg>
);

// ── Data types ──
interface QuestionRow {
  question: ExamQuestion;
  answer: GradingAnswerRow | null; // null = not answered
  index: number; // 1-based
}

export interface PaperExamReportProps {
  contest: ContestDetail;
  studentName: string;
  studentNickname?: string;
  questions: ExamQuestion[];
  answers: GradingAnswerRow[];
  totalScore: number;
  maxScore: number;
}

// ── Helpers ──

function getSelectedIndices(answer: GradingAnswerRow | null): Set<number> {
  if (!answer?.answerContent) return new Set();
  const content = answer.answerContent;

  if (answer.questionType === "true_false") {
    const val = content.selected_option ?? content.answer;
    if (val === true || val === "true" || val === 0) return new Set([0]);
    if (val === false || val === "false" || val === 1) return new Set([1]);
    return new Set();
  }

  if (answer.questionType === "single_choice") {
    const idx = content.selected_option ?? content.answer;
    return typeof idx === "number" ? new Set([idx]) : new Set();
  }

  if (answer.questionType === "multiple_choice") {
    const selected = content.selected_options ?? content.answer;
    if (Array.isArray(selected)) return new Set(selected);
  }
  return new Set();
}

function getCorrectIndices(question: ExamQuestion): Set<number> {
  const ca = question.correctAnswer;
  if (ca == null) return new Set();
  if (typeof ca === "boolean") return new Set([ca ? 0 : 1]);
  if (ca === "true") return new Set([0]);
  if (ca === "false") return new Set([1]);
  if (typeof ca === "number") return new Set([ca]);
  if (Array.isArray(ca)) return new Set(ca as number[]);
  return new Set();
}

function getStudentTextAnswer(answer: GradingAnswerRow | null): string | null {
  if (!answer?.answerContent) return null;
  const c = answer.answerContent;
  const text = c.text ?? c.answer ?? c.content;
  return text ? String(text) : null;
}

function formatCorrectAnswer(question: ExamQuestion): string {
  const { questionType, correctAnswer, options } = question;
  if (correctAnswer == null) return "（未設定）";

  if (questionType === "true_false") {
    return correctAnswer === true || correctAnswer === "true" ? "O（正確）" : "X（錯誤）";
  }
  if (questionType === "single_choice") {
    const idx = typeof correctAnswer === "number" ? correctAnswer : parseInt(String(correctAnswer), 10);
    if (!isNaN(idx) && options[idx]) return `(${OPTION_LETTERS[idx]}) ${options[idx]}`;
    return String(correctAnswer);
  }
  if (questionType === "multiple_choice") {
    if (Array.isArray(correctAnswer)) {
      return (correctAnswer as number[]).map((i) => OPTION_LETTERS[i]).join(", ");
    }
    return String(correctAnswer);
  }
  return String(correctAnswer);
}

// ── Components ──

const TypeTag: React.FC<{ type: string }> = ({ type }) => {
  const meta = QUESTION_TYPE_META[type] ?? { label: "??", bg: C.tagGrayBg, color: C.tagGrayText };
  return (
    <Text style={[s.qTypeTag, { backgroundColor: meta.bg, color: meta.color }]}>
      {meta.label}
    </Text>
  );
};

const ScoreBadge: React.FC<{ score: number | null; max: number }> = ({ score, max }) => {
  if (score === null) {
    return <Text style={[s.qScore, { color: C.textPlaceholder }]}>— / {max}</Text>;
  }
  const full = score === max;
  const color = full ? C.supportSuccess : score === 0 ? C.supportError : C.textPrimary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {full ? <CheckmarkIcon /> : score === 0 ? <CloseIcon /> : null}
      <Text style={[s.qScore, { color }]}>{score} / {max}</Text>
    </View>
  );
};

const PromptBlock: React.FC<{ prompt: string }> = ({ prompt }) => {
  const segments = parsePromptSegments(prompt);
  const hasCode = segments.some((seg) => seg.type === "code");
  if (!hasCode) return <Text style={s.promptText}>{prompt}</Text>;
  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === "code"
          ? <Text key={i} style={s.codeBlock}>{seg.content}</Text>
          : <Text key={i} style={s.promptText}>{seg.content}</Text>
      )}
    </View>
  );
};

const ChoiceOptions: React.FC<{
  question: ExamQuestion;
  selected: Set<number>;
  correct: Set<number>;
  isMultiple: boolean;
}> = ({ question, selected, correct, isMultiple }) => {
  const options = question.questionType === "true_false"
    ? ["O（正確）", "X（錯誤）"]
    : question.options;

  return (
    <View style={{ marginTop: 4 }}>
      {options.map((opt, idx) => {
        const isSel = selected.has(idx);
        const isCor = correct.has(idx);
        const isWrong = isSel && !isCor;

        let rowBg = {};
        if (isCor) rowBg = s.optionRowCorrect;
        else if (isWrong) rowBg = s.optionRowWrong;
        else if (isSel) rowBg = s.optionRowSelected;

        const Indicator = isMultiple
          ? (isSel ? CheckboxChecked : CheckboxEmpty)
          : (isSel ? RadioFilled : RadioEmpty);

        return (
          <View key={idx} style={[s.optionRow, rowBg]}>
            <Indicator />
            <Text style={s.optionLetter}>{OPTION_LETTERS[idx]}</Text>
            <Text style={[s.optionContent, isCor ? { color: C.supportSuccess, fontWeight: 700 } : {}]}>
              {opt}
            </Text>
            {isSel && isCor && (
              <Text style={[s.optionAnnotation, { backgroundColor: C.tagGreenBg, color: C.tagGreenText }]}>
                正確
              </Text>
            )}
            {isWrong && (
              <Text style={[s.optionAnnotation, { backgroundColor: C.tagRedBg, color: C.tagRedText }]}>
                誤選
              </Text>
            )}
            {!isSel && isCor && (
              <Text style={[s.optionAnnotation, { backgroundColor: C.tagGreenBg, color: C.tagGreenText }]}>
                正解
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const SectionHeading: React.FC<{ label: string }> = ({ label }) => (
  <View style={s.sectionRow}>
    <Text style={s.sectionLabel}>{label}</Text>
  </View>
);

// ── Main Document ──

const PaperExamReportPdfDocument: React.FC<PaperExamReportProps> = ({
  contest,
  studentName,
  studentNickname,
  questions,
  answers,
  totalScore,
  maxScore,
}) => {
  // Build question-first list: all questions, answers merged in
  const answerMap = new Map<string, GradingAnswerRow>();
  for (const a of answers) answerMap.set(a.questionId, a);

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const rows: QuestionRow[] = sortedQuestions.map((q, i) => ({
    question: q,
    answer: answerMap.get(q.id) ?? null,
    index: i + 1,
  }));

  const gradedCount = rows.filter((r) => r.answer?.score != null).length;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Dark header bar */}
        <View style={s.headerBar} fixed>
          <Text style={s.headerTitle}>{contest.name}</Text>
          <Text style={s.headerSub}>
            {studentName}
            {studentNickname && studentNickname !== studentName ? ` (${studentNickname})` : ""}
            {"  |  "}
            {formatDateTime(new Date().toISOString())}
          </Text>
        </View>

        {/* Score summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total Score</Text>
            <Text style={s.summaryValue}>
              {totalScore}
              <Text style={s.summaryUnit}> / {maxScore}</Text>
            </Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: C.supportSuccess }]}>
            <Text style={s.summaryLabel}>Graded</Text>
            <Text style={s.summaryValue}>
              {gradedCount}
              <Text style={s.summaryUnit}> / {questions.length}</Text>
            </Text>
          </View>
          <View style={[s.summaryCard, { borderLeftColor: C.supportWarning }]}>
            <Text style={s.summaryLabel}>Answered</Text>
            <Text style={s.summaryValue}>
              {rows.filter((r) => r.answer !== null).length}
              <Text style={s.summaryUnit}> / {questions.length}</Text>
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Questions */}
        {rows.map(({ question, answer, index }) => {
          const qType = question.questionType;
          const isChoice = qType === "single_choice" || qType === "multiple_choice" || qType === "true_false";
          const isSubjective = qType === "short_answer" || qType === "essay";
          const selected = getSelectedIndices(answer);
          const correct = getCorrectIndices(question);
          const score = answer?.score ?? null;

          return (
            <View key={question.id} style={s.qCard} wrap={false}>
              {/* Card header */}
              <View style={s.qHeader}>
                <View style={s.qHeaderLeft}>
                  <Text style={s.qNumber}>Q{index}</Text>
                  <TypeTag type={qType} />
                  <Text style={s.qTypeFull}>{QUESTION_TYPE_FULL[qType] ?? qType}</Text>
                </View>
                <ScoreBadge score={score} max={question.score} />
              </View>

              {/* Card body */}
              <View style={s.qBody}>
                <PromptBlock prompt={question.prompt} />

                {/* Choice options with selection markers */}
                {isChoice && (
                  <ChoiceOptions
                    question={question}
                    selected={selected}
                    correct={correct}
                    isMultiple={qType === "multiple_choice"}
                  />
                )}

                {/* Subjective: student answer */}
                {isSubjective && (
                  <View>
                    <SectionHeading label="Student Answer" />
                    {answer ? (
                      <Text style={s.answerBox}>
                        {getStudentTextAnswer(answer) || "（空白）"}
                      </Text>
                    ) : (
                      <Text style={s.noAnswer}>未作答</Text>
                    )}
                  </View>
                )}

                {/* Subjective: reference answer */}
                {isSubjective && question.correctAnswer != null && (
                  <View>
                    <SectionHeading label="Reference Answer" />
                    <Text style={s.correctAnswerBox}>
                      {formatCorrectAnswer(question)}
                    </Text>
                  </View>
                )}

                {/* TA feedback */}
                {answer?.feedback ? (
                  <View>
                    <SectionHeading label="Feedback" />
                    <Text style={s.feedbackBox}>{answer.feedback}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Page number */}
        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
};

export default PaperExamReportPdfDocument;
