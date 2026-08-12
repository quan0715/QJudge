import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  ExpandableSearch,
  FluidDropdown,
  Loading,
  Stack,
  Tile,
} from "@carbon/react";
import {
  Add,
  ArrowLeft,
  Document,
  Download,
  Settings,
  Tag as TagIcon,
} from "@carbon/icons-react";
import { FilterPopover } from "@/shared/ui/filter/FilterPopover";
import { KpiCard } from "@/shared/ui/dataCard";
import { SettingsModal } from "@/shared/ui/modal/SettingsModal";
import { useToast } from "@/shared/contexts";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import {
  createQuestion,
  deleteQuestion,
  getBank,
  listQuestions,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { WorkspaceToolBar } from "@/features/app/components/WorkspaceToolBar";
import { QuestionBankSettingsGeneralPanel } from "@/features/question-banks/components/QuestionBankSettingsGeneralPanel";
import { ImportInboxModal } from "@/features/question-banks/components/ImportInboxModal";
import QuestionBankProblemManagementPanel from "@/features/question-banks/components/QuestionBankProblemManagementPanel";
import QuestionEditModal from "@/features/question-banks/components/QuestionEditModal";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import {
  resolveExamQuestionType,
  toExamBankPayload,
  type QuestionFilterState,
  type QuestionSortKey,
} from "@/features/question-banks/components/questionBankProblemManagement.utils";
import styles from "./QuestionBankDetailScreen.module.scss";

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const QuestionBankDetailScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [filterState, setFilterState] = useState<QuestionFilterState>({
    keyword: "",
    difficulty: [],
    tags: [],
    questionTypes: [],
  });
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);
  const [importInboxOpen, setImportInboxOpen] = useState(false);
  const [examTypePickerOpen, setExamTypePickerOpen] = useState(false);
  // filterOpen removed — FilterPopover manages its own open/close

  // Sync editingQuestion ↔ ?q= URL param
  const openQuestionFromUrl = useCallback(
    (qs: BankQuestion[]) => {
      const qId = searchParams.get("q");
      if (qId) {
        const found = qs.find((q) => q.bankItemId === qId);
        if (found) setEditingQuestion(found);
      }
    },
    [searchParams],
  );

  const setEditingQuestionWithUrl = useCallback(
    (question: BankQuestion | null) => {
      setEditingQuestion(question);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (question) {
            next.set("q", question.bankItemId);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const questionCountLabel = useMemo(
    () => t("examEditor.questionList", "題目列表"),
    [t]
  );
  const loadData = useCallback(async () => {
    if (!bankId) return;
    try {
      setLoading(true);
      const target = await getBank(bankId);
      setBank(target);

      const rows = await listQuestions(target.id);
      setQuestions(rows);
      openQuestionFromUrl(rows);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setLoading(false);
    }
  }, [bankId, openQuestionFromUrl, showToast, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const questionTypeFilterOptions = useMemo(
    () => [
      { id: "all", label: t("questionBank.allTypes", "全部題型") },
      { id: "coding", label: t("questionType.label.coding", "程式題") },
      { id: "exam:single_choice", label: t("questionType.label.single_choice", "單選題") },
      { id: "exam:multiple_choice", label: t("questionType.label.multiple_choice", "多選題") },
      { id: "exam:true_false", label: t("questionType.label.true_false", "是非題") },
      { id: "exam:short_answer", label: t("questionType.label.short_answer", "簡答題") },
      { id: "exam:essay", label: t("questionType.label.essay", "問答題") },
    ],
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { id: "order", label: t("questionBank.sortOrder", "預設排序") },
      { id: "type", label: t("questionBank.sortType", "依題型") },
      { id: "newest", label: t("questionBank.sortNewest", "最新更新") },
      { id: "oldest", label: t("questionBank.sortOldest", "最早更新") },
    ],
    [t]
  );

  const hasActiveFilters = useMemo(
    () =>
      filterState.questionTypes.length > 0 ||
      (filterState.sort !== undefined && filterState.sort !== "order"),
    [filterState]
  );

  const handleCreateCodingQuestionFromHeader = async () => {
    if (!bank) return;
    const maxOrder =
      questions.length === 0
        ? 0
        : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const payload: UpsertBankQuestionPayload = {
      questionType: "coding",
      title: "Untitled",
      order: maxOrder,
    };
    try {
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCreated", "題目已建立"),
      });
      await loadData();
      setEditingQuestionWithUrl(created);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleDeleteQuestion = async (question: BankQuestion) => {
    if (!bank) return;
    try {
      await deleteQuestion(bank.id, question.bankItemId);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionDeleted", "題目已刪除"),
      });
      setEditingQuestionWithUrl(null);
      await loadData();
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleDuplicateQuestion = async (question: BankQuestion) => {
    if (!bank) return;
    const nextOrder =
      questions.length === 0
        ? 0
        : Math.max(...questions.map((row) => Number(row.order || 0))) + 1;
    const metadata =
      question.metadata && typeof question.metadata === "object"
        ? (question.metadata as Record<string, unknown>)
        : {};

    const payload: UpsertBankQuestionPayload =
      question.questionType === "exam"
        ? {
            ...toExamBankPayload(
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
            ),
            title: `${question.title} (copy)`,
          }
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

    try {
      const created = await createQuestion(bank.id, payload);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCloned", "題目已複製"),
      });
      await loadData();
      setEditingQuestionWithUrl(created);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleRefreshBank = useCallback(async () => {
    if (!bankId) return;
    try {
      const freshBank = await getBank(bankId);
      setBank(freshBank);
    } catch {
      // Settings panel shows its own error toast
    }
  }, [bankId]);

  if (loading && !bank) {
    return (
      <div className={styles.loadingWrap}>
        <Loading withOverlay={false} description={t("message.loading", "載入中")} />
      </div>
    );
  }

  if (!bank) {
    return (
      <div className={styles.emptyWrap}>
        <Tile>
          <Stack gap={4}>
            <h3 style={{ margin: 0 }}>{t("questionBank.bankNotFound", "找不到題庫")}</h3>
            <p style={{ margin: 0 }}>
              {t("questionBank.bankNotFoundDesc", "請回題庫列表重新選擇。")}
            </p>
            <div>
              <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/dashboard")}>
                {t("button.back", "返回")}
              </Button>
            </div>
          </Stack>
        </Tile>
      </div>
    );
  }

  const HeroIcon = getClassroomIcon(bank.icon);
  const HeroWidgetIcon = ({
    size,
  }: {
    size: number;
    className?: string;
  }) => <HeroIcon size={size} />;

  return (
    <div className={styles.shell}>
      <WorkspaceToolBar
        className={styles.localToolbar}
        title={(
          <div className={styles.localToolbarLeft}>
            <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
              <BreadcrumbItem>
                <Link to="/dashboard">{t("nav.dashboard", "首頁")}</Link>
              </BreadcrumbItem>
              <BreadcrumbItem isCurrentPage>
                {bank.name}
              </BreadcrumbItem>
            </Breadcrumb>
            <div className={styles.titleBlock}>
              <h4 className={styles.localToolbarTitle}>
                {t("page.problemManagement", "題目管理")}
              </h4>
              <span className={styles.localToolbarMeta}>
                {t("questionBank.questionCount", "共 {{count}} 題", { count: questions.length })}
              </span>
            </div>
          </div>
        )}
        actions={(
          <div className={styles.localToolbarRight}>
            <ExpandableSearch
              id="qb-toolbar-search"
              size="md"
              className={styles.localToolbarSearch}
              labelText={t("questionBank.searchQuestion", "搜尋題目")}
              placeholder={t("questionBank.searchQuestion", "搜尋題目") + "..."}
              value={filterState.keyword}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  keyword: (e.target as HTMLInputElement).value || "",
                }))
              }
            />
            <FilterPopover
              hasActiveFilters={hasActiveFilters}
              triggerLabel={t("questionBank.showFilters", "篩選")}
              onReset={() =>
                setFilterState((prev) => ({
                  keyword: prev.keyword,
                  difficulty: [],
                  tags: [],
                  questionTypes: [],
                  sort: "order",
                }))
              }
              className={styles.localToolbarIconButton}
            >
              <FluidDropdown
                id="qb-filter-type"
                titleText={t("questionBank.questionType", "題型")}
                label={t("questionBank.questionType", "題型")}
                items={questionTypeFilterOptions}
                itemToString={(item: { label: string } | null) => item?.label ?? ""}
                selectedItem={
                  filterState.questionTypes.length === 1
                    ? questionTypeFilterOptions.find((o) => o.id === filterState.questionTypes[0]) ??
                      questionTypeFilterOptions[0]
                    : questionTypeFilterOptions[0]
                }
                onChange={({ selectedItem }: { selectedItem: { id: string } | null }) =>
                  setFilterState((prev) => ({
                    ...prev,
                    questionTypes: selectedItem && selectedItem.id !== "all" ? [selectedItem.id] : [],
                  }))
                }
              />
              <FluidDropdown
                id="qb-filter-sort"
                titleText={t("dashboard.sortLabel", "排序")}
                label={t("dashboard.sortLabel", "排序")}
                items={sortOptions}
                itemToString={(item: { label: string } | null) => item?.label ?? ""}
                selectedItem={
                  sortOptions.find((o) => o.id === (filterState.sort || "order")) ??
                  sortOptions[0]
                }
                onChange={({ selectedItem }: { selectedItem: { id: string } | null }) =>
                  setFilterState((prev) => ({
                    ...prev,
                    sort: (selectedItem?.id as QuestionSortKey) || "order",
                  }))
                }
              />
            </FilterPopover>
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={Download}
              iconDescription={t("questionBank.importFromInbox", "匯入草稿")}
              tooltipPosition="bottom"
              tooltipAlignment="center"
              onClick={() => setImportInboxOpen(true)}
              className={styles.localToolbarIconButton}
            />
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={Add}
              iconDescription={t("questionBank.addQuestion", "新增題目")}
              tooltipPosition="bottom"
              tooltipAlignment="center"
              onClick={() => {
                if (bank.category === "exam") {
                  setExamTypePickerOpen(true);
                } else {
                  void handleCreateCodingQuestionFromHeader();
                }
              }}
              className={styles.localToolbarIconButton}
            />
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={Settings}
              iconDescription={t("tab.settings", "設定")}
              tooltipPosition="bottom"
              tooltipAlignment="center"
              onClick={() => setSettingsModalOpen(true)}
              className={styles.localToolbarIconButton}
            />
          </div>
        )}
      />

      <main className={styles.content}>
        <QJudgeHeroWidget
          title={bank.name}
          description={bank.description || t("message.noData", "暫無資料")}
          icon={HeroWidgetIcon}
          coverUrl={bank.coverUrl || undefined}
          kpiCards={
            <>
              <KpiCard
                icon={Document}
                value={String(questions.length)}
                label={questionCountLabel}
                showBorder={true}
              />
              <KpiCard
                icon={TagIcon}
                value={
                  bank.category === "coding"
                    ? t("questionBank.categoryCoding", "程式題")
                    : t("questionBank.categoryExam", "考卷題")
                }
                label={t("questionBank.category", "分類")}
                showBorder={true}
              />
            </>
          }
        />

        <QuestionBankProblemManagementPanel
          bank={bank}
          questions={questions}
          loading={loading}
          onReload={loadData}
          onCardClick={(q) => setEditingQuestionWithUrl(q)}
          onQuestionCreated={(q) => setEditingQuestionWithUrl(q)}
          filterState={filterState}
          examTypePickerOpen={examTypePickerOpen}
          onExamTypePickerClose={() => setExamTypePickerOpen(false)}
        />

        {/* Settings Modal */}
        <SettingsModal
          open={settingsModalOpen}
          onRequestClose={() => setSettingsModalOpen(false)}
          modalHeading={t("tab.settings", "設定")}
          navItems={[
            { id: "general", label: t("questionBank.basicInfo", "基本資訊"), icon: Settings },
          ]}
          renderPanel={() => (
            <QuestionBankSettingsGeneralPanel bank={bank} onRefresh={handleRefreshBank} />
          )}
        />

        {/* Import Inbox Modal (controlled from header) */}
        <ImportInboxModal
          open={importInboxOpen}
          onClose={() => setImportInboxOpen(false)}
          bankId={bank.id}
          bankCategory={bank.category}
          onIngested={() => void loadData()}
        />
      </main>

      {/* Question Edit Modal */}
      <QuestionEditModal
        open={editingQuestion !== null}
        question={editingQuestion}
        bank={bank}
        onRequestClose={() => setEditingQuestionWithUrl(null)}
        onDelete={handleDeleteQuestion}
        onDuplicate={handleDuplicateQuestion}
        onSaved={() => void loadData()}
      />
    </div>
  );
};

export default QuestionBankDetailScreen;
