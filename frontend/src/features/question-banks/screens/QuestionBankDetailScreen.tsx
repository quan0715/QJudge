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
  UnorderedList,
  ListItem,
} from "@carbon/react";
import { Add, ArrowLeft, Edit, TrashCan } from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import {
  createQuestion,
  deleteQuestion,
  listMine,
  listQuestions,
  updateQuestion,
} from "@/infrastructure/api/repositories/questionBank.repository";

const parseNumericInput = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(
    null
  );
  const [questionTitle, setQuestionTitle] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionDifficulty, setQuestionDifficulty] = useState("medium");
  const [questionScore, setQuestionScore] = useState("100");
  const [questionTimeLimit, setQuestionTimeLimit] = useState("1000");
  const [questionMemoryLimit, setQuestionMemoryLimit] = useState("128");

  const questionType = useMemo<"coding" | "exam">(
    () => (bank?.category === "exam" ? "exam" : "coding"),
    [bank?.category]
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

  const resetQuestionForm = () => {
    setEditingQuestion(null);
    setQuestionTitle("");
    setQuestionPrompt("");
    setQuestionDifficulty("medium");
    setQuestionScore("100");
    setQuestionTimeLimit("1000");
    setQuestionMemoryLimit("128");
  };

  const openCreateQuestionModal = () => {
    resetQuestionForm();
    setQuestionModalOpen(true);
  };

  const openEditQuestionModal = (question: BankQuestion) => {
    setEditingQuestion(question);
    setQuestionTitle(question.title);
    setQuestionPrompt(question.prompt || "");
    setQuestionDifficulty(question.difficulty || "medium");
    setQuestionScore(String(question.score ?? 100));
    setQuestionTimeLimit(String(question.timeLimit ?? 1000));
    setQuestionMemoryLimit(String(question.memoryLimit ?? 128));
    setQuestionModalOpen(true);
  };

  const handleSubmitQuestion = async () => {
    if (!bank || !questionTitle.trim()) return;

    const payload = {
      questionType,
      title: questionTitle.trim(),
      prompt: questionPrompt.trim(),
      difficulty: questionDifficulty,
      score: parseNumericInput(questionScore, 100),
      timeLimit: parseNumericInput(questionTimeLimit, 1000),
      memoryLimit: parseNumericInput(questionMemoryLimit, 128),
    } as const;

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
          <PageHeader
            title={t("questionBank.bankNotFound", "找不到題庫")}
            action={
              <Button
                kind="ghost"
                renderIcon={ArrowLeft}
                onClick={() => navigate("/question-banks")}
              >
                {t("button.back")}
              </Button>
            }
          />
          <Tile>{t("questionBank.bankNotFoundDesc", "請回題庫列表重新選擇。")}</Tile>
        </Column>
      </Grid>
    );
  }

  return (
    <div>
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={bank.name}
            subtitle={bank.description || t("message.noData")}
            tags={[
              <Tag key="category" type="blue">
                {bank.category}
              </Tag>,
              <Tag key="count" type="gray">
                {t("questionBank.mockQuestionCount", "{{count}} 題", {
                  count: bank.questionCount,
                })}
              </Tag>,
            ]}
            action={
              <Stack orientation="horizontal" gap={3}>
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
              </Stack>
            }
          />
        </Column>

        <Column lg={16} md={8} sm={4}>
          <Tile>
            {questions.length === 0 ? (
              <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
                {t("message.noData")}
              </p>
            ) : (
              <UnorderedList>
                {questions.map((question) => (
                  <ListItem key={question.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                      }}
                    >
                      <div>
                        <strong>{question.title}</strong>
                        <div style={{ marginTop: "0.25rem" }}>
                          <Tag type="teal">{question.difficulty}</Tag>
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
                  </ListItem>
                ))}
              </UnorderedList>
            )}
          </Tile>
        </Column>
      </Grid>

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
        </Stack>
      </Modal>

      <ConfirmModal {...modalProps} />
    </div>
  );
};

export default QuestionBankDetailScreen;
