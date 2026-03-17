import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ClickableTile,
  Column,
  Grid,
  Loading,
  Modal,
  MultiSelect,
  Select,
  SelectItem,
  Stack,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Add,
  ArrowLeft,
  CheckmarkFilled,
  Code,
  Download,
  Edit,
  Filter,
  TrashCan,
  Copy,
  RadioButton as RadioButtonIcon,
  Checkbox as CheckboxIcon,
  Boolean as BooleanIcon,
  Pen,
  Document,
} from "@carbon/icons-react";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import {
  createQuestion,
  deleteQuestion,
  updateQuestion,
} from "@/infrastructure/api/repositories/questionBank.repository";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories/examQuestions.repository";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import ExamQuestionEditCard from "@/features/contest/components/admin/examEditor/ExamQuestionEditCard";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import {
  buildQuestionPreviewMeta,
  extractQuestionTags,
  filterQuestions,
  formatDownloadCount,
  getQuestionTypeLabel as getTypeTokenLabel,
  getQuestionTypeToken,
  resolveExamQuestionType,
  toExamBankPayload,
  toExamQuestion,
  type ProblemManagementViewState,
  type QuestionFilterState,
} from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankProblemManagementPanel.module.scss";

const EXAM_DEFAULT_PAYLOADS: Record<ExamQuestionType, Omit<ExamQuestionUpsertPayload, "order">> = {
  single_choice: {
    question_type: "single_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: 0,
  },
  multiple_choice: {
    question_type: "multiple_choice",
    prompt: "New question",
    score: 5,
    options: ["Option A", "Option B"],
    correct_answer: [0],
  },
  true_false: {
    question_type: "true_false",
    prompt: "New question",
    score: 5,
    options: ["True", "False"],
    correct_answer: true,
  },
  short_answer: { question_type: "short_answer", prompt: "New question", score: 5 },
  essay: { question_type: "essay", prompt: "New question", score: 5 },
};

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

const QUESTION_TYPE_ICONS: Record<ExamQuestionType, ComponentType<{ size?: number }>> = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: BooleanIcon,
  short_answer: Pen,
  essay: Document,
};

interface QuestionBankProblemManagementPanelProps {
  bank: QuestionBank;
  questions: BankQuestion[];
  loading?: boolean;
  onReload: () => Promise<void>;
  viewState: ProblemManagementViewState;
  onViewStateChange: (next: Partial<ProblemManagementViewState>) => void;
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const QuestionBankProblemManagementPanel = ({
  bank,
  questions,
  loading = false,
  onReload,
  viewState,
  onViewStateChange,
}: QuestionBankProblemManagementPanelProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { confirm, modalProps } = useConfirmModal();

  const [showFilters, setShowFilters] = useState(false);
  const [examTypePickerOpen, setExamTypePickerOpen] = useState(false);
  const [examEditSignal, setExamEditSignal] = useState(0);

  const [codingModalOpen, setCodingModalOpen] = useState(false);
  const [editingCodingQuestion, setEditingCodingQuestion] = useState<BankQuestion | null>(null);
  const [codingTitle, setCodingTitle] = useState("");
  const [codingPrompt, setCodingPrompt] = useState("");
  const [codingDifficulty, setCodingDifficulty] = useState("medium");
  const [codingScore, setCodingScore] = useState("100");
  const [codingTimeLimit, setCodingTimeLimit] = useState("1000");
  const [codingMemoryLimit, setCodingMemoryLimit] = useState("128");

  const [filterState, setFilterState] = useState<QuestionFilterState>({
    keyword: "",
    difficulty: [],
    tags: [],
    questionTypes: [],
  });

  const byId = useMemo(() => {
    const map = new Map<string, BankQuestion>();
    questions.forEach((question) => map.set(question.id, question));
    return map;
  }, [questions]);

  const tagOptions = useMemo(
    () =>
      Array.from(new Set(questions.flatMap((question) => extractQuestionTags(question)))).map(
        (tag) => ({
          id: tag,
          label: tag,
        })
      ),
    [questions]
  );

  const typeOptions = useMemo(
    () =>
      Array.from(new Set(questions.map((question) => getQuestionTypeToken(question)))).map(
        (token) => ({
          id: token,
          label: getTypeTokenLabel(token),
        })
      ),
    [questions]
  );

  const difficultyOptions = useMemo(
    () => [
      { id: "easy", label: t("difficulty.easy", "簡單") },
      { id: "medium", label: t("difficulty.medium", "中等") },
      { id: "hard", label: t("difficulty.hard", "困難") },
    ],
    [t]
  );

  const filteredQuestions = useMemo(
    () =>
      filterQuestions(
        [...questions].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
        filterState
      ),
    [questions, filterState]
  );

  const selectedQuestion = useMemo(
    () =>
      viewState.selectedId
        ? filteredQuestions.find((question) => question.id === viewState.selectedId) || null
        : null,
    [filteredQuestions, viewState.selectedId]
  );

  useEffect(() => {
    if (viewState.mode !== "split") return;
    if (filteredQuestions.length === 0 && viewState.selectedId !== null) {
      onViewStateChange({ selectedId: null });
      return;
    }
    if (filteredQuestions.length > 0 && !selectedQuestion) {
      onViewStateChange({ selectedId: filteredQuestions[0].id });
    }
  }, [filteredQuestions, onViewStateChange, selectedQuestion, viewState.mode, viewState.selectedId]);

  const parseNumberInput = (value: string, fallback: number, min = 0): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(parsed, min);
  };

  const openCodingEditor = (question?: BankQuestion) => {
    const target = question || null;
    setEditingCodingQuestion(target);
    setCodingTitle(target?.title || "");
    setCodingPrompt(target?.prompt || "");
    setCodingDifficulty(target?.difficulty || "medium");
    setCodingScore(String(target?.score ?? 100));
    setCodingTimeLimit(String(target?.timeLimit ?? 1000));
    setCodingMemoryLimit(String(target?.memoryLimit ?? 128));
    setCodingModalOpen(true);
  };

  const handleSaveCoding = async () => {
    if (!codingTitle.trim()) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationTitle", "題目標題不可為空"),
      });
      return;
    }
    if (!codingPrompt.trim()) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: t("questionBank.validationPrompt", "題目敘述不可為空"),
      });
      return;
    }

    const payload: UpsertBankQuestionPayload = {
      questionType: "coding",
      title: codingTitle.trim(),
      prompt: codingPrompt.trim(),
      difficulty: codingDifficulty,
      score: parseNumberInput(codingScore, 100, 1),
      timeLimit: parseNumberInput(codingTimeLimit, 1000, 100),
      memoryLimit: parseNumberInput(codingMemoryLimit, 128, 64),
      order:
        editingCodingQuestion?.order ??
        (questions.length === 0 ? 0 : Math.max(...questions.map((row) => Number(row.order || 0))) + 1),
    };

    try {
      if (editingCodingQuestion) {
        await updateQuestion(editingCodingQuestion.id, payload);
      } else {
        const created = await createQuestion(bank.id, payload);
        onViewStateChange({
          mode: "split",
          selectedId: created.id,
        });
      }
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: editingCodingQuestion
          ? t("questionBank.questionUpdated", "題目已更新")
          : t("questionBank.questionCreated", "題目已建立"),
      });
      setCodingModalOpen(false);
      await onReload();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleCreateExamQuestion = async (questionType: ExamQuestionType) => {
    const maxOrder =
      questions.length === 0 ? 0 : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const payload = toExamBankPayload({ ...EXAM_DEFAULT_PAYLOADS[questionType], order: maxOrder });

    try {
      setExamTypePickerOpen(false);
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCreated", "題目已建立"),
      });
      onViewStateChange({
        mode: "split",
        selectedId: created.id,
      });
      await onReload();
      setExamEditSignal((value) => value + 1);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleDeleteQuestion = async (question: BankQuestion) => {
    const accepted = await confirm({
      title: t("questionBank.deleteQuestion", "刪除題目"),
      body: t("questionBank.deleteQuestionConfirmBody", "確定要刪除題目「{{title}}」嗎？", {
        title: question.title,
      }),
      confirmLabel: t("button.delete", "刪除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!accepted) return;

    try {
      await deleteQuestion(question.id);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionDeleted", "題目已刪除"),
      });
      const next = filteredQuestions.find((item) => item.id !== question.id);
      onViewStateChange({
        selectedId: next?.id || null,
        mode: next ? "split" : "gallery",
      });
      await onReload();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleDuplicateQuestion = async (question: BankQuestion) => {
    const nextOrder =
      questions.length === 0 ? 0 : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const metadata =
      question.metadata && typeof question.metadata === "object"
        ? (question.metadata as Record<string, unknown>)
        : {};

    const payload: UpsertBankQuestionPayload =
      question.questionType === "exam"
        ? toExamBankPayload(
            {
              question_type: resolveExamQuestionType(question),
              prompt: question.prompt || "",
              options: question.options as string[],
              correct_answer: question.correctAnswer,
              score: question.score,
              order: nextOrder,
            },
            question,
            nextOrder
          )
        : {
            questionType: "coding",
            title: `${question.title} (copy)`,
            prompt: question.prompt || "",
            score: Number(question.score || 0),
            order: nextOrder,
            difficulty: question.difficulty || "medium",
            timeLimit: Number(question.timeLimit || 1000),
            memoryLimit: Number(question.memoryLimit || 128),
            metadata,
            codingExt: question.codingExt,
          };

    if (question.questionType === "exam") {
      payload.title = `${question.title} (copy)`;
    }

    try {
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCloned", "題目已複製"),
      });
      onViewStateChange({
        mode: "split",
        selectedId: created.id,
      });
      await onReload();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleSaveExamQuestion = async (
    payload: ExamQuestionUpsertPayload,
    questionId?: string
  ) => {
    if (!questionId) return;
    const source = byId.get(questionId);
    if (!source) return;

    try {
      await updateQuestion(questionId, toExamBankPayload(payload, source));
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionUpdated", "題目已更新"),
      });
      await onReload();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const selectedDifficultyItems = difficultyOptions.filter((item) =>
    filterState.difficulty.includes(item.id)
  );
  const selectedTypeItems = typeOptions.filter((item) =>
    filterState.questionTypes.includes(item.id)
  );
  const selectedTagItems = tagOptions.filter((item) => filterState.tags.includes(item.id));

  const toIdList = (
    items: ReadonlyArray<{ id: string } | null | undefined> | null | undefined
  ): string[] => (items ?? []).flatMap((item) => (item?.id ? [item.id] : []));

  const toolbar = (
    <div className={styles.toolbarBlock}>
      <div className={styles.toolbarTopRow}>
        <TextInput
          id="question-bank-question-search"
          labelText=""
          placeholder={t("questionBank.searchQuestion", "搜尋題目...")}
          value={filterState.keyword}
          onChange={(event) =>
            setFilterState((prev) => ({ ...prev, keyword: event.currentTarget.value }))
          }
        />
        <Button
          kind="ghost"
          renderIcon={Filter}
          onClick={() => setShowFilters((value) => !value)}
        >
          {showFilters
            ? t("questionBank.hideFilters", "收合篩選")
            : t("questionBank.showFilters", "展開篩選")}
        </Button>
        {viewState.mode === "split" ? (
          <Button
            kind="ghost"
            renderIcon={ArrowLeft}
            onClick={() => onViewStateChange({ mode: "gallery", selectedId: null })}
          >
            {t("questionBank.backToGallery", "回到畫廊")}
          </Button>
        ) : null}
        <Button
          kind="primary"
          renderIcon={Add}
          onClick={() => {
            if (bank.category === "exam") {
              setExamTypePickerOpen(true);
              return;
            }
            openCodingEditor();
          }}
        >
          {t("questionBank.addQuestion", "新增題目")}
        </Button>
      </div>

      {showFilters ? (
        <div className={styles.filterRow}>
          <MultiSelect
            id="question-bank-filter-difficulty"
            titleText=""
            label={t("questionBank.difficulty", "難度")}
            items={difficultyOptions}
            itemToString={(item) => item?.label || ""}
            selectedItems={selectedDifficultyItems}
            onChange={(data) =>
              setFilterState((prev) => ({
                ...prev,
                difficulty: toIdList(data.selectedItems),
              }))
            }
            size="sm"
          />
          <MultiSelect
            id="question-bank-filter-type"
            titleText=""
            label={t("questionBank.questionType", "題型")}
            items={typeOptions}
            itemToString={(item) => item?.label || ""}
            selectedItems={selectedTypeItems}
            onChange={(data) =>
              setFilterState((prev) => ({
                ...prev,
                questionTypes: toIdList(data.selectedItems),
              }))
            }
            size="sm"
          />
          {tagOptions.length > 0 ? (
            <MultiSelect
              id="question-bank-filter-tags"
              titleText=""
              label={t("questionBank.tags", "標籤")}
              items={tagOptions}
              itemToString={(item) => item?.label || ""}
              selectedItems={selectedTagItems}
              onChange={(data) =>
                setFilterState((prev) => ({
                  ...prev,
                  tags: toIdList(data.selectedItems),
                }))
              }
              size="sm"
            />
          ) : null}
          <Button
            kind="ghost"
            size="sm"
            onClick={() =>
              setFilterState({
                keyword: "",
                difficulty: [],
                tags: [],
                questionTypes: [],
              })
            }
          >
            {t("button.clear", "清除")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (loading && questions.length === 0) {
    return (
      <div className={styles.loadingWrap}>
        <Loading withOverlay={false} description={t("message.loading", "載入中")} />
      </div>
    );
  }

  if (viewState.mode === "gallery") {
    return (
      <>
        <div className={styles.galleryRoot}>
          {toolbar}

          {filteredQuestions.length === 0 ? (
            <Tile>
              <p className={styles.emptyText}>{t("message.noData", "暫無資料")}</p>
            </Tile>
          ) : (
            <Grid fullWidth condensed className={styles.galleryGrid}>
              {filteredQuestions.map((question) => (
                <Column key={question.id} lg={4} md={4} sm={4}>
                  <QuestionPreviewCard
                    bank={bank}
                    question={question}
                    onClick={() =>
                      onViewStateChange({
                        mode: "split",
                        selectedId: question.id,
                      })
                    }
                  />
                </Column>
              ))}
            </Grid>
          )}
        </div>

        <CodingQuestionModal
          open={codingModalOpen}
          title={codingTitle}
          prompt={codingPrompt}
          difficulty={codingDifficulty}
          score={codingScore}
          timeLimit={codingTimeLimit}
          memoryLimit={codingMemoryLimit}
          editing={Boolean(editingCodingQuestion)}
          onClose={() => setCodingModalOpen(false)}
          onTitleChange={setCodingTitle}
          onPromptChange={setCodingPrompt}
          onDifficultyChange={setCodingDifficulty}
          onScoreChange={setCodingScore}
          onTimeLimitChange={setCodingTimeLimit}
          onMemoryLimitChange={setCodingMemoryLimit}
          onSubmit={handleSaveCoding}
        />

        <ExamTypePickerModal
          open={examTypePickerOpen}
          onClose={() => setExamTypePickerOpen(false)}
          onSelect={handleCreateExamQuestion}
        />

        <ConfirmModal {...modalProps} />
      </>
    );
  }

  return (
    <>
      <AdminSplitLayout
        toolbar={toolbar}
        sidebar={
          <QuestionListSidebar
            bank={bank}
            questions={filteredQuestions}
            selectedQuestionId={selectedQuestion?.id || null}
            onSelect={(id) => onViewStateChange({ mode: "split", selectedId: id })}
          />
        }
        sidebarWidth={320}
        contentMaxWidth={920}
        contentClassName={styles.splitContent}
      >
        {!selectedQuestion ? (
          <Tile>
            <p className={styles.emptyText}>{t("message.noData", "暫無資料")}</p>
          </Tile>
        ) : (
          <div className={styles.detailPane}>
            <Tile className={styles.detailHeaderTile}>
              <div className={styles.detailHeaderTop}>
                <div>
                  <h3 className={styles.detailTitle}>{selectedQuestion.title}</h3>
                  <div className={styles.detailTags}>
                    <Tag type="blue">{selectedQuestion.questionType}</Tag>
                    {selectedQuestion.questionType === "exam" ? (
                      <Tag type="purple">{getQuestionTypeLabel(resolveExamQuestionType(selectedQuestion))}</Tag>
                    ) : (
                      <Tag type="teal">{selectedQuestion.difficulty || "medium"}</Tag>
                    )}
                  </div>
                </div>
                <div className={styles.detailActionRow}>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Edit}
                    onClick={() => {
                      if (selectedQuestion.questionType === "exam") {
                        setExamEditSignal((value) => value + 1);
                        return;
                      }
                      openCodingEditor(selectedQuestion);
                    }}
                  >
                    {t("button.edit", "編輯")}
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Copy}
                    onClick={() => {
                      void handleDuplicateQuestion(selectedQuestion);
                    }}
                  >
                    {t("button.copy", "複製")}
                  </Button>
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    onClick={() => {
                      void handleDeleteQuestion(selectedQuestion);
                    }}
                  >
                    {t("button.delete", "刪除")}
                  </Button>
                </div>
              </div>
            </Tile>

            {selectedQuestion.questionType === "exam" ? (
              <ExamQuestionEditCard
                question={toExamQuestion(bank.id, selectedQuestion)}
                index={Number(selectedQuestion.order || 0)}
                onSave={handleSaveExamQuestion}
                onDelete={(id) => handleDeleteQuestion(byId.get(id) || selectedQuestion)}
                onDuplicate={(id) => handleDuplicateQuestion(byId.get(id) || selectedQuestion)}
                startEditingSignal={examEditSignal}
              />
            ) : (
              <Tile className={styles.codingPreviewTile}>
                <Stack gap={3}>
                  <p className={styles.previewPrompt}>{selectedQuestion.prompt || t("message.noData", "暫無資料")}</p>
                  <p className={styles.previewMeta}>
                    {t("questionBank.score", "分數")}: {selectedQuestion.score} ·{" "}
                    {t("questionBank.timeLimit", "時間限制(ms)")}: {selectedQuestion.timeLimit} ·{" "}
                    {t("questionBank.memoryLimit", "記憶體限制(MB)")}: {selectedQuestion.memoryLimit}
                  </p>
                </Stack>
              </Tile>
            )}
          </div>
        )}
      </AdminSplitLayout>

      <CodingQuestionModal
        open={codingModalOpen}
        title={codingTitle}
        prompt={codingPrompt}
        difficulty={codingDifficulty}
        score={codingScore}
        timeLimit={codingTimeLimit}
        memoryLimit={codingMemoryLimit}
        editing={Boolean(editingCodingQuestion)}
        onClose={() => setCodingModalOpen(false)}
        onTitleChange={setCodingTitle}
        onPromptChange={setCodingPrompt}
        onDifficultyChange={setCodingDifficulty}
        onScoreChange={setCodingScore}
        onTimeLimitChange={setCodingTimeLimit}
        onMemoryLimitChange={setCodingMemoryLimit}
        onSubmit={handleSaveCoding}
      />

      <ExamTypePickerModal
        open={examTypePickerOpen}
        onClose={() => setExamTypePickerOpen(false)}
        onSelect={handleCreateExamQuestion}
      />

      <ConfirmModal {...modalProps} />
    </>
  );
};

const QuestionPreviewCard = ({
  bank,
  question,
  onClick,
}: {
  bank: QuestionBank;
  question: BankQuestion;
  onClick: () => void;
}) => {
  const meta = buildQuestionPreviewMeta(question, bank);

  return (
    <ClickableTile onClick={onClick} className={styles.previewCard}>
      <div className={styles.previewCardBody}>
        <div className={styles.previewTitleRow}>
          <div className={styles.previewIconWrap}>
            <Code size={16} />
          </div>
          <div className={styles.previewTitleContent}>
            <div className={styles.previewTitleLine}>
              <h4 className={styles.previewTitle}>{question.title}</h4>
              {meta.isVerified ? <CheckmarkFilled size={16} className={styles.verifiedIcon} /> : null}
            </div>
            <p className={styles.previewMetaRow}>
              <span className={styles.previewProvider}>by {meta.providerName}</span>
              <span className={styles.previewDownload}>
                <Download size={12} />
                {formatDownloadCount(meta.downloadCount)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </ClickableTile>
  );
};

const QuestionListSidebar = ({
  bank,
  questions,
  selectedQuestionId,
  onSelect,
}: {
  bank: QuestionBank;
  questions: BankQuestion[];
  selectedQuestionId: string | null;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation("common");

  return (
    <div className={styles.listSidebar}>
      <div className={styles.listSidebarHeader}>
        <h4>{t("page.problemManagement", "題目管理")}</h4>
        <span>{questions.length}</span>
      </div>
      <div className={styles.listSidebarBody}>
        {questions.length === 0 ? (
          <p className={styles.emptyText}>{t("message.noData", "暫無資料")}</p>
        ) : (
          questions.map((question, index) => {
            const meta = buildQuestionPreviewMeta(question, bank);
            return (
              <button
                key={question.id}
                type="button"
                className={`${styles.listItem} ${
                  selectedQuestionId === question.id ? styles.listItemActive : ""
                }`}
                onClick={() => onSelect(question.id)}
              >
                <span className={styles.listOrder}>{index + 1}</span>
                <div className={styles.listMain}>
                  <span className={styles.listTitle}>{question.title}</span>
                  <span className={styles.listMeta}>
                    {question.questionType === "exam"
                      ? getQuestionTypeLabel(resolveExamQuestionType(question))
                      : question.difficulty || "medium"}
                    {" · "}
                    {formatDownloadCount(meta.downloadCount)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const ExamTypePickerModal = ({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (questionType: ExamQuestionType) => void;
}) => {
  const { t } = useTranslation("common");
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={t("examEditor.selectQuestionType", "選擇題目類型")}
      passiveModal
      size="sm"
    >
      <div className={styles.typePickerGrid}>
        {QUESTION_TYPE_ORDER.map((questionType) => {
          const Icon = QUESTION_TYPE_ICONS[questionType];
          return (
            <button
              key={questionType}
              type="button"
              className={styles.typePickerCard}
              onClick={() => onSelect(questionType)}
            >
              <Icon size={24} />
              <div className={styles.typePickerInfo}>
                <span className={styles.typePickerLabel}>
                  {t(`questionType.label.${questionType}`, questionType)}
                </span>
                <span className={styles.typePickerDesc}>
                  {t(`questionType.description.${questionType}`, "")}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
};

const CodingQuestionModal = ({
  open,
  editing,
  title,
  prompt,
  difficulty,
  score,
  timeLimit,
  memoryLimit,
  onClose,
  onTitleChange,
  onPromptChange,
  onDifficultyChange,
  onScoreChange,
  onTimeLimitChange,
  onMemoryLimitChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  title: string;
  prompt: string;
  difficulty: string;
  score: string;
  timeLimit: string;
  memoryLimit: string;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onScoreChange: (value: string) => void;
  onTimeLimitChange: (value: string) => void;
  onMemoryLimitChange: (value: string) => void;
  onSubmit: () => void;
}) => {
  const { t } = useTranslation("common");

  return (
    <Modal
      open={open}
      modalHeading={editing ? t("questionBank.editQuestion", "編輯題目") : t("questionBank.addQuestion", "新增題目")}
      primaryButtonText={editing ? t("button.save", "儲存") : t("button.create", "建立")}
      secondaryButtonText={t("button.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onSubmit}
      primaryButtonDisabled={!title.trim()}
    >
      <Stack gap={5}>
        <TextInput
          id="coding-question-title"
          labelText={t("table.title", "標題")}
          value={title}
          onChange={(event) => onTitleChange(event.currentTarget.value)}
        />
        <TextArea
          id="coding-question-prompt"
          labelText={t("questionBank.prompt", "題目敘述")}
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
        />
        <Select
          id="coding-question-difficulty"
          labelText={t("questionBank.difficulty", "難度")}
          value={difficulty}
          onChange={(event) => onDifficultyChange(event.currentTarget.value)}
        >
          <SelectItem value="easy" text={t("difficulty.easy", "簡單")} />
          <SelectItem value="medium" text={t("difficulty.medium", "中等")} />
          <SelectItem value="hard" text={t("difficulty.hard", "困難")} />
        </Select>
        <TextInput
          id="coding-question-score"
          type="number"
          labelText={t("questionBank.score", "分數")}
          value={score}
          onChange={(event) => onScoreChange(event.currentTarget.value)}
        />
        <TextInput
          id="coding-question-time-limit"
          type="number"
          labelText={t("questionBank.timeLimit", "時間限制(ms)")}
          value={timeLimit}
          onChange={(event) => onTimeLimitChange(event.currentTarget.value)}
        />
        <TextInput
          id="coding-question-memory-limit"
          type="number"
          labelText={t("questionBank.memoryLimit", "記憶體限制(MB)")}
          value={memoryLimit}
          onChange={(event) => onMemoryLimitChange(event.currentTarget.value)}
        />
      </Stack>
    </Modal>
  );
};

export default QuestionBankProblemManagementPanel;
