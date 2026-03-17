import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Grid,
  Column,
  Loading,
  Tile,
  Stack,
  Tag,
  Modal,
  TextInput,
  Select,
  SelectItem,
  TextArea,
} from "@carbon/react";
import { Add, ArrowLeft, Edit, TrashCan } from "@carbon/icons-react";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts";
import { KpiCard } from "@/shared/ui/dataCard";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import {
  createQuestion,
  deleteQuestion,
  listMine,
  listQuestions,
  updateQuestion,
} from "@/infrastructure/api/repositories/questionBank.repository";
import styles from "./QuestionBankDetailScreen.module.scss";

const parseNumericInput = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const QUESTION_TYPES: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

const TRUE_FALSE_OPTIONS = ["True", "False"];

const isExamQuestionType = (value: unknown): value is ExamQuestionType =>
  typeof value === "string" && QUESTION_TYPES.includes(value as ExamQuestionType);

const isChoiceExamQuestionType = (type: ExamQuestionType): boolean =>
  type === "single_choice" || type === "multiple_choice" || type === "true_false";

const resolveExamQuestionType = (question: BankQuestion): ExamQuestionType => {
  const meta = question.metadata && typeof question.metadata === "object"
    ? (question.metadata as Record<string, unknown>)
    : {};

  const direct = meta.exam_question_type;
  if (isExamQuestionType(direct)) return direct;

  const legacy = meta.legacy_question_type;
  if (isExamQuestionType(legacy)) return legacy;

  if (Array.isArray(question.correctAnswer)) return "multiple_choice";
  if (typeof question.correctAnswer === "string" && question.options.length === 0) {
    return "short_answer";
  }
  return "single_choice";
};

const trimPrompt = (raw: string): string => {
  const clean = raw.trim();
  if (clean.length <= 110) return clean;
  return `${clean.slice(0, 110)}...`;
};

const QuestionBankDetailScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { confirm, modalProps } = useConfirmModal();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);

  const [questionTitle, setQuestionTitle] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionDifficulty, setQuestionDifficulty] = useState("medium");
  const [questionScore, setQuestionScore] = useState("100");
  const [questionTimeLimit, setQuestionTimeLimit] = useState("1000");
  const [questionMemoryLimit, setQuestionMemoryLimit] = useState("128");

  const [examQuestionType, setExamQuestionType] = useState<ExamQuestionType>("single_choice");
  const [examOptions, setExamOptions] = useState<string[]>(["", ""]);
  const [examSingleAnswerIndex, setExamSingleAnswerIndex] = useState("");
  const [examMultiAnswerIndexesText, setExamMultiAnswerIndexesText] = useState("");
  const [examShortAnswer, setExamShortAnswer] = useState("");
  const [examEssayReferenceAnswer, setExamEssayReferenceAnswer] = useState("");

  const questionType = useMemo<"coding" | "exam">(
    () => (bank?.category === "exam" ? "exam" : "coding"),
    [bank?.category]
  );

  const totalScore = useMemo(
    () => questions.reduce((sum, question) => sum + Number(question.score || 0), 0),
    [questions]
  );

  const loadData = async () => {
    if (!bankId) return;
    try {
      setLoading(true);
      const mineBanks = await listMine();
      const targetBank = mineBanks.find((item) => item.id === bankId) || null;
      setBank(targetBank);
      if (!targetBank) return;

      const rows = await listQuestions(targetBank.id);
      setQuestions(rows);
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [bankId]);

  const resetExamForm = () => {
    setExamQuestionType("single_choice");
    setExamOptions(["", ""]);
    setExamSingleAnswerIndex("");
    setExamMultiAnswerIndexesText("");
    setExamShortAnswer("");
    setExamEssayReferenceAnswer("");
  };

  const resetQuestionForm = () => {
    setEditingQuestion(null);
    setQuestionTitle("");
    setQuestionPrompt("");
    setQuestionDifficulty("medium");
    setQuestionScore("100");
    setQuestionTimeLimit("1000");
    setQuestionMemoryLimit("128");
    resetExamForm();
  };

  const openCreateQuestionModal = () => {
    resetQuestionForm();
    setQuestionModalOpen(true);
  };

  const hydrateExamForm = (question: BankQuestion) => {
    const resolvedType = resolveExamQuestionType(question);
    setExamQuestionType(resolvedType);

    if (resolvedType === "true_false") {
      setExamOptions([...TRUE_FALSE_OPTIONS]);
    } else if (
      (resolvedType === "single_choice" || resolvedType === "multiple_choice") &&
      Array.isArray(question.options) &&
      question.options.length > 0
    ) {
      setExamOptions(question.options.map((item) => String(item)));
    } else if (resolvedType === "single_choice" || resolvedType === "multiple_choice") {
      setExamOptions(["", ""]);
    } else {
      setExamOptions([]);
    }

    if (resolvedType === "single_choice" || resolvedType === "true_false") {
      if (typeof question.correctAnswer === "number") {
        setExamSingleAnswerIndex(String(question.correctAnswer));
      } else {
        setExamSingleAnswerIndex("");
      }
      setExamMultiAnswerIndexesText("");
      setExamShortAnswer("");
      setExamEssayReferenceAnswer("");
      return;
    }

    if (resolvedType === "multiple_choice") {
      const values = Array.isArray(question.correctAnswer)
        ? question.correctAnswer
            .map((item) => (Number.isInteger(item) ? String(item) : ""))
            .filter(Boolean)
        : [];
      setExamMultiAnswerIndexesText(values.join(","));
      setExamSingleAnswerIndex("");
      setExamShortAnswer("");
      setExamEssayReferenceAnswer("");
      return;
    }

    if (resolvedType === "short_answer") {
      setExamShortAnswer(question.correctAnswer == null ? "" : String(question.correctAnswer));
      setExamSingleAnswerIndex("");
      setExamMultiAnswerIndexesText("");
      setExamEssayReferenceAnswer("");
      return;
    }

    setExamEssayReferenceAnswer(
      question.correctAnswer == null ? "" : String(question.correctAnswer)
    );
    setExamSingleAnswerIndex("");
    setExamMultiAnswerIndexesText("");
    setExamShortAnswer("");
  };

  const openEditQuestionModal = (question: BankQuestion) => {
    setEditingQuestion(question);
    setQuestionTitle(question.title);
    setQuestionPrompt(question.prompt || "");
    setQuestionDifficulty(question.difficulty || "medium");
    setQuestionScore(String(question.score ?? 100));
    setQuestionTimeLimit(String(question.timeLimit ?? 1000));
    setQuestionMemoryLimit(String(question.memoryLimit ?? 128));

    if (questionType === "exam") {
      hydrateExamForm(question);
    }

    setQuestionModalOpen(true);
  };

  const applyExamType = (nextType: ExamQuestionType) => {
    setExamQuestionType(nextType);
    setExamSingleAnswerIndex("");
    setExamMultiAnswerIndexesText("");
    setExamShortAnswer("");
    setExamEssayReferenceAnswer("");

    if (nextType === "true_false") {
      setExamOptions([...TRUE_FALSE_OPTIONS]);
      return;
    }
    if (nextType === "single_choice" || nextType === "multiple_choice") {
      setExamOptions((prev) => (prev.length > 0 ? prev : ["", ""]));
      return;
    }
    setExamOptions([]);
  };

  const appendExamOption = () => {
    setExamOptions((prev) => [...prev, ""]);
  };

  const updateExamOption = (index: number, value: string) => {
    setExamOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  };

  const removeExamOption = (index: number) => {
    setExamOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const buildQuestionPayload = (): UpsertBankQuestionPayload | null => {
    if (!questionTitle.trim()) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationTitle", "題目標題不可為空"),
      });
      return null;
    }
    if (!questionPrompt.trim()) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationPrompt", "題目敘述不可為空"),
      });
      return null;
    }

    const basePayload: UpsertBankQuestionPayload = {
      questionType,
      title: questionTitle.trim(),
      prompt: questionPrompt.trim(),
      score: Math.max(1, parseNumericInput(questionScore, 100)),
    };

    if (questionType === "coding") {
      return {
        ...basePayload,
        difficulty: questionDifficulty,
        timeLimit: Math.max(100, parseNumericInput(questionTimeLimit, 1000)),
        memoryLimit: Math.max(64, parseNumericInput(questionMemoryLimit, 128)),
      };
    }

    const existingMeta =
      editingQuestion?.metadata && typeof editingQuestion.metadata === "object"
        ? editingQuestion.metadata
        : {};
    const metadata = {
      ...existingMeta,
      exam_question_type: examQuestionType,
    };

    if (examQuestionType === "short_answer") {
      if (!examShortAnswer.trim()) {
        showToast({
          kind: "error",
          title: t("message.error"),
          subtitle: t("questionBank.validationShortAnswer", "請填入簡答題正確答案"),
        });
        return null;
      }
      return {
        ...basePayload,
        options: [],
        correctAnswer: examShortAnswer.trim(),
        metadata,
      };
    }

    if (examQuestionType === "essay") {
      return {
        ...basePayload,
        options: [],
        correctAnswer: examEssayReferenceAnswer.trim() || null,
        metadata,
      };
    }

    const normalizedOptions =
      examQuestionType === "true_false"
        ? [...TRUE_FALSE_OPTIONS]
        : examOptions.map((option) => option.trim());

    if (normalizedOptions.length < 2 || normalizedOptions.some((option) => !option)) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationOption", "選擇題至少需要兩個非空選項"),
      });
      return null;
    }

    if (examQuestionType === "multiple_choice") {
      const indexes = examMultiAnswerIndexesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item));

      const valid = indexes.every(
        (item) => Number.isInteger(item) && item >= 0 && item < normalizedOptions.length
      );
      if (!valid || indexes.length === 0) {
        showToast({
          kind: "error",
          title: t("message.error"),
          subtitle: t(
            "questionBank.validationMultiAnswer",
            "請輸入正確答案索引（以逗號分隔，例：0,2）"
          ),
        });
        return null;
      }

      return {
        ...basePayload,
        options: normalizedOptions,
        correctAnswer: indexes,
        metadata,
      };
    }

    const singleIndex = Number(examSingleAnswerIndex);
    const validSingle =
      Number.isInteger(singleIndex) &&
      singleIndex >= 0 &&
      singleIndex < normalizedOptions.length;
    if (!validSingle) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationSingleAnswer", "請選擇一個正確答案"),
      });
      return null;
    }

    return {
      ...basePayload,
      options: normalizedOptions,
      correctAnswer: singleIndex,
      metadata,
    };
  };

  const handleSubmitQuestion = async () => {
    if (!bank) return;

    const payload = buildQuestionPayload();
    if (!payload) return;

    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, payload);
        showToast({
          kind: "success",
          title: t("message.success"),
          subtitle: t("questionBank.questionUpdated", "題目已更新"),
        });
      } else {
        await createQuestion(bank.id, payload);
        showToast({
          kind: "success",
          title: t("message.success"),
          subtitle: t("questionBank.questionCreated", "題目已建立"),
        });
      }
      setQuestionModalOpen(false);
      resetQuestionForm();
      await loadData();
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    }
  };

  const handleDeleteQuestion = async (question: BankQuestion) => {
    const confirmed = await confirm({
      title: t("questionBank.deleteQuestion", "刪除題目"),
      body: t(
        "questionBank.deleteQuestionConfirmBody",
        "確定要刪除題目「{{title}}」嗎？",
        { title: question.title }
      ),
      confirmLabel: t("button.delete"),
      cancelLabel: t("button.cancel"),
      danger: true,
    });

    if (!confirmed) return;

    try {
      await deleteQuestion(question.id);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionDeleted", "題目已刪除"),
      });
      await loadData();
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", marginTop: "4rem" }}>
        <Loading withOverlay={false} description={t("message.loading")} />
      </div>
    );
  }

  if (!bank) {
    return (
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <Tile>
            <Stack gap={4}>
              <h3 style={{ margin: 0 }}>{t("questionBank.bankNotFound", "找不到題庫")}</h3>
              <p style={{ margin: 0 }}>{t("questionBank.bankNotFoundDesc", "請回題庫列表重新選擇。")}</p>
              <div>
                <Button
                  kind="ghost"
                  renderIcon={ArrowLeft}
                  onClick={() => navigate("/question-banks")}
                >
                  {t("button.back")}
                </Button>
              </div>
            </Stack>
          </Tile>
        </Column>
      </Grid>
    );
  }

  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.topRow}>
            <div className={styles.infoCol}>
              <p className={styles.overline}>{t("page.questionBanks", "題庫")}</p>
              <h1 className={styles.title}>{bank.name}</h1>
              <div className={styles.metaRow}>
                <Tag type="blue">{bank.category}</Tag>
                <Tag type={bank.visibility === "public" ? "green" : "gray"}>
                  {bank.visibility === "public"
                    ? t("questionBank.tagPublic", "公開")
                    : t("questionBank.tagPrivate", "私人")}
                </Tag>
              </div>
              <p className={styles.description}>{bank.description || t("message.noData")}</p>
            </div>

            <div className={styles.rightCol}>
              <div className={styles.actionRow}>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={ArrowLeft}
                  onClick={() => navigate("/question-banks")}
                >
                  {t("button.back")}
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Add}
                  onClick={openCreateQuestionModal}
                >
                  {t("questionBank.addQuestion", "新增題目")}
                </Button>
              </div>

              <div className={styles.kpiStrip}>
                <KpiCard
                  value={String(questions.length)}
                  label={t("questionBank.mockQuestionCount", "{{count}} 題", {
                    count: questions.length,
                  })}
                  showBorder={false}
                  className={styles.kpiCard}
                />
                <KpiCard
                  value={String(totalScore)}
                  label={t("questionBank.score", "分數總計")}
                  showBorder={false}
                  className={styles.kpiCard}
                />
                <KpiCard
                  value={bank.category}
                  label={t("questionBank.category", "分類")}
                  showBorder={false}
                  className={styles.kpiCard}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        {questions.length === 0 ? (
          <Tile>
            <p className={styles.emptyText}>{t("message.noData")}</p>
          </Tile>
        ) : (
          <div className={styles.questionList}>
            {questions.map((question) => {
              const examType =
                question.questionType === "exam"
                  ? getQuestionTypeLabel(resolveExamQuestionType(question))
                  : null;

              return (
                <Tile key={question.id} className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <div className={styles.questionTitleWrap}>
                      <h4 className={styles.questionTitle}>{question.title}</h4>
                      <div className={styles.questionTags}>
                        {examType ? <Tag type="purple">{examType}</Tag> : null}
                        {!examType ? <Tag type="teal">{question.difficulty}</Tag> : null}
                        <Tag type="gray">
                          {t("questionBank.score", "分數")}: {question.score}
                        </Tag>
                      </div>
                    </div>
                    <Stack orientation="horizontal" gap={3}>
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={Edit}
                        onClick={() => openEditQuestionModal(question)}
                      >
                        {t("button.edit")}
                      </Button>
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        renderIcon={TrashCan}
                        onClick={() => {
                          void handleDeleteQuestion(question);
                        }}
                      >
                        {t("button.delete")}
                      </Button>
                    </Stack>
                  </div>

                  <p className={styles.questionPrompt}>{trimPrompt(question.prompt || "")}</p>

                  <p className={styles.questionMeta}>
                    {question.questionType === "coding"
                      ? `${t("questionBank.timeLimit", "時間限制(ms)")}: ${question.timeLimit} · ${t("questionBank.memoryLimit", "記憶體限制(MB)")}: ${question.memoryLimit}`
                      : `${t("questionBank.options", "選項")}: ${question.options.length}`}
                  </p>
                </Tile>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={questionModalOpen}
        modalHeading={
          editingQuestion
            ? t("questionBank.editQuestion", "編輯題目")
            : t("questionBank.addQuestion", "新增題目")
        }
        primaryButtonText={editingQuestion ? t("button.save") : t("button.create")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => setQuestionModalOpen(false)}
        onRequestSubmit={() => {
          void handleSubmitQuestion();
        }}
        primaryButtonDisabled={!questionTitle.trim()}
      >
        <Stack gap={5}>
          <TextInput
            id="question-title"
            labelText={t("table.title")}
            value={questionTitle}
            onChange={(e) => setQuestionTitle(e.currentTarget.value)}
          />
          <TextArea
            id="question-prompt"
            labelText={t("questionBank.prompt", "題目敘述")}
            value={questionPrompt}
            onChange={(e) => setQuestionPrompt(e.currentTarget.value)}
          />

          {questionType === "coding" ? (
            <>
              <Select
                id="question-difficulty"
                labelText={t("questionBank.difficulty", "難度")}
                value={questionDifficulty}
                onChange={(e) => setQuestionDifficulty(e.currentTarget.value)}
              >
                <SelectItem value="easy" text={t("difficulty.easy", "簡單")} />
                <SelectItem value="medium" text={t("difficulty.medium", "中等")} />
                <SelectItem value="hard" text={t("difficulty.hard", "困難")} />
              </Select>
              <TextInput
                id="question-score"
                type="number"
                labelText={t("questionBank.score", "分數")}
                value={questionScore}
                onChange={(e) => setQuestionScore(e.currentTarget.value)}
              />
              <TextInput
                id="question-time-limit"
                type="number"
                labelText={t("questionBank.timeLimit", "時間限制(ms)")}
                value={questionTimeLimit}
                onChange={(e) => setQuestionTimeLimit(e.currentTarget.value)}
              />
              <TextInput
                id="question-memory-limit"
                type="number"
                labelText={t("questionBank.memoryLimit", "記憶體限制(MB)")}
                value={questionMemoryLimit}
                onChange={(e) => setQuestionMemoryLimit(e.currentTarget.value)}
              />
            </>
          ) : (
            <>
              <Select
                id="exam-question-type"
                labelText={t("questionBank.questionType", "題型")}
                value={examQuestionType}
                onChange={(e) => applyExamType(e.currentTarget.value as ExamQuestionType)}
              >
                <SelectItem value="single_choice" text={getQuestionTypeLabel("single_choice")} />
                <SelectItem value="multiple_choice" text={getQuestionTypeLabel("multiple_choice")} />
                <SelectItem value="true_false" text={getQuestionTypeLabel("true_false")} />
                <SelectItem value="short_answer" text={getQuestionTypeLabel("short_answer")} />
                <SelectItem value="essay" text={getQuestionTypeLabel("essay")} />
              </Select>
              <TextInput
                id="exam-score"
                type="number"
                labelText={t("questionBank.score", "分數")}
                value={questionScore}
                onChange={(e) => setQuestionScore(e.currentTarget.value)}
              />

              {isChoiceExamQuestionType(examQuestionType) ? (
                <Stack gap={3}>
                  <p className={styles.inlineLabel}>{t("questionBank.options", "選項")}</p>
                  {examOptions.map((option, index) => (
                    <div key={`option-${index}`} className={styles.optionRow}>
                      <TextInput
                        id={`exam-option-${index}`}
                        labelText=""
                        value={option}
                        onChange={(e) => updateExamOption(index, e.currentTarget.value)}
                        readOnly={examQuestionType === "true_false"}
                        className={styles.optionInput}
                      />
                      {examQuestionType !== "true_false" ? (
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={TrashCan}
                          onClick={() => removeExamOption(index)}
                          disabled={examOptions.length <= 2}
                        >
                          {t("button.delete")}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {examQuestionType !== "true_false" ? (
                    <div>
                      <Button kind="tertiary" size="sm" renderIcon={Add} onClick={appendExamOption}>
                        {t("questionBank.addOption", "新增選項")}
                      </Button>
                    </div>
                  ) : null}
                </Stack>
              ) : null}

              {(examQuestionType === "single_choice" || examQuestionType === "true_false") && (
                <Select
                  id="exam-single-answer"
                  labelText={t("questionBank.correctAnswer", "正確答案")}
                  value={examSingleAnswerIndex}
                  onChange={(e) => setExamSingleAnswerIndex(e.currentTarget.value)}
                >
                  <SelectItem
                    value=""
                    text={t("questionBank.selectCorrectAnswer", "請選擇正確答案")}
                  />
                  {examOptions.map((option, index) => (
                    <SelectItem
                      key={`answer-option-${index}`}
                      value={String(index)}
                      text={`${index}. ${option || t("message.noData", "暫無資料")}`}
                    />
                  ))}
                </Select>
              )}

              {examQuestionType === "multiple_choice" && (
                <TextInput
                  id="exam-multi-answer"
                  labelText={t("questionBank.correctAnswer", "正確答案")}
                  value={examMultiAnswerIndexesText}
                  onChange={(e) => setExamMultiAnswerIndexesText(e.currentTarget.value)}
                  placeholder={t(
                    "questionBank.multiAnswerHint",
                    "請輸入正確選項索引，以逗號分隔（例：0,2）"
                  )}
                />
              )}

              {examQuestionType === "short_answer" && (
                <TextInput
                  id="exam-short-answer"
                  labelText={t("questionBank.correctAnswer", "正確答案")}
                  value={examShortAnswer}
                  onChange={(e) => setExamShortAnswer(e.currentTarget.value)}
                />
              )}

              {examQuestionType === "essay" && (
                <TextArea
                  id="exam-essay-reference"
                  labelText={t("questionBank.referenceAnswer", "參考答案（選填）")}
                  value={examEssayReferenceAnswer}
                  onChange={(e) => setExamEssayReferenceAnswer(e.currentTarget.value)}
                />
              )}
            </>
          )}
        </Stack>
      </Modal>

      <ConfirmModal {...modalProps} />
    </div>
  );
};

export default QuestionBankDetailScreen;
