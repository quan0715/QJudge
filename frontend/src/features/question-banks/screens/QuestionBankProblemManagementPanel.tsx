import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ClickableTile,
  ExpandableSearch,
  Loading,
  Modal,
  MultiSelect,
  Select,
  SelectItem,
  Stack,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Add,
  ArrowLeft,
  CheckmarkFilled,
  Download,
  Filter,
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
import { AcrBadge } from "@/shared/ui/tag";
import { EXAM_QUESTION_TYPE_ICON as QUESTION_TYPE_ICONS } from "@/shared/ui/examQuestionTypeVisual";
import {
  getQuestionVisualFromBankQuestion,
} from "@/shared/ui/questionVisual";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import ExamQuestionEditCard from "@/features/contest/components/admin/examEditor/ExamQuestionEditCard";
import EmbeddedBankCodingEditor from "@/features/question-banks/components/EmbeddedBankCodingEditor";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import {
  buildQuestionPreviewMeta,
  extractQuestionTags,
  filterQuestions,
  formatDownloadCount,
  getQuestionTypeLabel as getTypeTokenLabel,
  getQuestionTypeToken,
  getQuestionDisplayTitle,
  resolveExamQuestionType,
  toExamBankPayload,
  toExamQuestion,
  type ProblemManagementViewState,
  type QuestionFilterState,
} from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankProblemManagementPanel.module.scss";

const DIFFICULTY_TAG_TYPE: Record<string, "green" | "cyan" | "red" | "gray"> = {
  easy: "green",
  medium: "cyan",
  hard: "red",
};

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

interface QuestionBankProblemManagementPanelProps {
  bank: QuestionBank;
  questions: BankQuestion[];
  loading?: boolean;
  onReload: () => Promise<void>;
  viewState: ProblemManagementViewState;
  onViewStateChange: (next: Partial<ProblemManagementViewState>) => void;
  readOnly?: boolean;
  myBanks?: QuestionBank[];
  onClone?: (questionId: string, targetBankId: string) => Promise<void>;
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
  readOnly = false,
  myBanks = [],
  onClone,
}: QuestionBankProblemManagementPanelProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { confirm, modalProps } = useConfirmModal();

  const [showFilters, setShowFilters] = useState(false);
  const [examTypePickerOpen, setExamTypePickerOpen] = useState(false);
  const [examEditSignal, setExamEditSignal] = useState(0);

  const [creatingCoding, setCreatingCoding] = useState(false);

  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneTargetBankId, setCloneTargetBankId] = useState("");
  const [cloning, setCloning] = useState(false);

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

  const handleCreateCodingQuestion = async () => {
    if (creatingCoding) return;
    const maxOrder =
      questions.length === 0 ? 0 : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const payload: UpsertBankQuestionPayload = {
      questionType: "coding",
      title: "Untitled",
      order: maxOrder,
    };

    try {
      setCreatingCoding(true);
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCreated", "題目已建立"),
      });
      onViewStateChange({ mode: "split", selectedId: created.id });
      await onReload();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setCreatingCoding(false);
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
              score: Number(question.score || 5),
              options: question.options as string[],
              correct_answer: question.correctAnswer,
              order: nextOrder,
            },
            question,
            nextOrder
          )
        : {
            questionType: "coding",
            title: `${question.title} (copy)`,
            prompt: question.prompt || "",
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

  const handleCloneToBank = async () => {
    if (!selectedQuestion || !cloneTargetBankId || !onClone) return;
    try {
      setCloning(true);
      await onClone(selectedQuestion.id, cloneTargetBankId);
      setCloneModalOpen(false);
    } catch {
      // error toast is handled by parent onClone
    } finally {
      setCloning(false);
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
        <div className={styles.toolbarLeft}>
          <h4 className={styles.toolbarTitle}>
            {t("page.problemManagement", "題目管理")}
          </h4>
        </div>
        <div className={styles.toolbarRight}>
          <ExpandableSearch
            id="question-bank-question-search"
            size="md"
            className={styles.toolbarSearch}
            labelText={t("questionBank.searchQuestion", "搜尋題目")}
            placeholder={t("questionBank.searchQuestion", "搜尋題目...")}
            value={filterState.keyword}
            onChange={(event) =>
              setFilterState((prev) => ({ ...prev, keyword: (event.target as HTMLInputElement).value || "" }))
            }
          />
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Filter}
            iconDescription={t("questionBank.showFilters", "篩選")}
            className={`${styles.toolbarAction} ${showFilters ? styles.toolbarActionActive : ""}`}
            onClick={() => setShowFilters((value) => !value)}
          />
          {viewState.mode === "split" ? (
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ArrowLeft}
              iconDescription={t("questionBank.backToGallery", "回到畫廊")}
              className={styles.toolbarAction}
              onClick={() => onViewStateChange({ mode: "gallery", selectedId: null })}
            />
          ) : null}
          {!readOnly && (
            <Button
              kind="primary"
              size="sm"
              hasIconOnly
              renderIcon={Add}
              iconDescription={t("questionBank.addQuestion", "新增題目")}
              className={styles.toolbarAction}
              onClick={() => {
                if (bank.category === "exam") {
                  setExamTypePickerOpen(true);
                  return;
                }
                void handleCreateCodingQuestion();
              }}
            />
          )}
        </div>
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
            <div className={styles.galleryGrid}>
              {filteredQuestions.map((question) => (
                <div key={question.id} className={styles.galleryCell}>
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
                </div>
              ))}
            </div>
          )}
        </div>

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
            {readOnly && (
              <div className={styles.detailActionRow}>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Download}
                  onClick={() => {
                    setCloneTargetBankId(myBanks[0]?.id || "");
                    setCloneModalOpen(true);
                  }}
                >
                  {t("questionBank.cloneToMyBank", "複製到我的題庫")}
                </Button>
              </div>
            )}

            {selectedQuestion.questionType === "exam" ? (
              <div className={styles.flatEditorWrap}>
                <ExamQuestionEditCard
                  question={toExamQuestion(bank.id, selectedQuestion)}
                  index={Number(selectedQuestion.order || 0)}
                  showScoreField={false}
                  onSave={handleSaveExamQuestion}
                  onDelete={(id) => handleDeleteQuestion(byId.get(id) || selectedQuestion)}
                  onDuplicate={(id) => handleDuplicateQuestion(byId.get(id) || selectedQuestion)}
                  startEditingSignal={examEditSignal}
                />
              </div>
            ) : (
              <EmbeddedBankCodingEditor
                bankQuestion={selectedQuestion}
                bankId={bank.id}
                onSaved={() => void onReload()}
              />
            )}
          </div>
        )}
      </AdminSplitLayout>

      <ExamTypePickerModal
        open={examTypePickerOpen}
        onClose={() => setExamTypePickerOpen(false)}
        onSelect={handleCreateExamQuestion}
      />

      <ConfirmModal {...modalProps} />

      {readOnly && (
        <Modal
          open={cloneModalOpen}
          modalHeading={t("questionBank.cloneToMyBank", "複製到我的題庫")}
          primaryButtonText={cloning ? t("message.loading", "載入中") : t("button.confirm", "確認")}
          secondaryButtonText={t("button.cancel", "取消")}
          onRequestClose={() => setCloneModalOpen(false)}
          onRequestSubmit={() => { void handleCloneToBank(); }}
          primaryButtonDisabled={!cloneTargetBankId || cloning}
          size="sm"
        >
          <Stack gap={4}>
            <p>{t("questionBank.cloneToMyBankDesc", "選擇要複製到的目標題庫：")}</p>
            <Select
              id="clone-target-bank"
              labelText={t("questionBank.targetBank", "目標題庫")}
              value={cloneTargetBankId}
              onChange={(e) => setCloneTargetBankId(e.currentTarget.value)}
            >
              {myBanks.length === 0 ? (
                <SelectItem value="" text={t("questionBank.noBank", "尚無題庫")} />
              ) : (
                myBanks.map((b) => (
                  <SelectItem key={b.id} value={b.id} text={b.name} />
                ))
              )}
            </Select>
          </Stack>
        </Modal>
      )}
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
  const { t } = useTranslation("common");
  const meta = buildQuestionPreviewMeta(question, bank);
  const { Icon } = getQuestionVisualFromBankQuestion(question, "colored");
  const displayTitle = getQuestionDisplayTitle(question);
  const visibleTags = meta.tags.slice(0, 2);
  const difficultyType = DIFFICULTY_TAG_TYPE[meta.difficulty] || "gray";
  const difficultyLabel = t(`difficulty.${meta.difficulty}`, meta.difficulty);
  const questionTypeLabel =
    question.questionType === "exam"
      ? getQuestionTypeLabel(resolveExamQuestionType(question))
      : t("questionType.label.coding", "程式題");

  return (
    <ClickableTile onClick={onClick} className={styles.previewCard}>
      <div className={styles.previewCardBody}>
        <div className={styles.previewRowTop}>
          <div className={styles.previewTypeInfo}>
            <span className={styles.previewIconWrap}>
              <Icon size={18} />
            </span>
            <span className={styles.previewTypeLabel}>{questionTypeLabel}</span>
          </div>
          {meta.isVerified ? <CheckmarkFilled size={16} className={styles.verifiedIcon} /> : null}
        </div>

        <h4 className={styles.previewTitle}>{displayTitle}</h4>

        <div className={styles.previewRowBottom}>
          <div className={styles.previewBadges}>
            <Tag size="sm" type={difficultyType}>
              {difficultyLabel}
            </Tag>
            {visibleTags.map((tag) => (
              <Tag key={tag} size="sm" type="gray">
                {tag}
              </Tag>
            ))}
          </div>
          <div className={styles.previewMetaGroup}>
            {meta.passRate == null ? (
              <Tag size="sm" type="cool-gray">
                {t("questionBank.passRate", "通過率")}: --
              </Tag>
            ) : (
              <AcrBadge value={meta.passRate} size="sm" label={t("questionBank.passRate", "通過率")} />
            )}
            <span className={styles.previewDownload}>
              <Download size={12} />
              {formatDownloadCount(meta.downloadCount)}
            </span>
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
                  <span className={styles.listTitle}>{getQuestionDisplayTitle(question)}</span>
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
      <div className={styles.listSidebarFooter}>
        {t("questionBank.questionCount", "共 {{count}} 題", { count: questions.length })}
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

export default QuestionBankProblemManagementPanel;
