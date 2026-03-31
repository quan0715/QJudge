import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  ExpandableSearch,
  FluidDropdown,
  Header,
  HeaderGlobalBar,
  Layer,
  Loading,
  Popover,
  PopoverContent,
  Stack,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Add,
  ArrowLeft,
  Document,
  Download,
  Filter,
  Microscope,
  Settings,
  Tag as TagIcon,
} from "@carbon/icons-react";
import { KpiCard } from "@/shared/ui/dataCard";
import { SettingsModal } from "@/shared/ui/modal/SettingsModal";
import { Section, FieldRow } from "@/shared/layout/SettingsPanel";
import { useToast } from "@/shared/contexts";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import {
  createQuestion,
  deleteQuestion,
  getBank,
  listMine,
  listQuestions,
  review as reviewQuestionBank,
  submitForReview,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { useAuth } from "@/features/auth";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";
import { UserMenu } from "@/features/app/components/UserMenu";
import { QuestionBankSettingsGeneralPanel } from "@/features/question-banks/components/QuestionBankSettingsGeneralPanel";
import { ImportInboxModal } from "@/features/question-banks/components/ImportInboxModal";
import QuestionBankProblemManagementPanel from "./QuestionBankProblemManagementPanel";
import QuestionEditModal from "./QuestionEditModal";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import {
  resolveExamQuestionType,
  toExamBankPayload,
  type QuestionFilterState,
  type QuestionSortKey,
} from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankDetailScreen.module.scss";

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const QuestionBankDetailScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [isExplore, setIsExplore] = useState(false);

  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewing, setReviewing] = useState<"approve" | "reject" | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [filterState, setFilterState] = useState<QuestionFilterState>({
    keyword: "",
    difficulty: [],
    tags: [],
    questionTypes: [],
  });
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);
  const [importInboxOpen, setImportInboxOpen] = useState(false);
  const [examTypePickerOpen, setExamTypePickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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
  const isAdmin = user?.role === "admin";
  const canEditSettings = !isExplore || isAdmin;

  const loadData = useCallback(async () => {
    if (!bankId) return;
    try {
      setLoading(true);
      const [target, mine] = await Promise.all([getBank(bankId), listMine()]);
      setBank(target);

      const owned = mine.some((item) => item.id === bankId);
      setIsExplore(!owned);

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
    try {
      await deleteQuestion(question.bankItemId);
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

  const handleSubmitForReview = async () => {
    if (!bank) return;
    try {
      setSubmittingReview(true);
      const updated = await submitForReview(bank.id);
      setBank(updated);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.submitForReviewSuccess", "已送出審核"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAdminReview = async (decision: "approve" | "reject") => {
    if (!bank || !isAdmin) return;
    try {
      setReviewing(decision);
      const updated = await reviewQuestionBank(bank.id, { decision });
      setBank(updated);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle:
          decision === "approve"
            ? t("questionBank.reviewApproved", "已核准上架")
            : t("questionBank.reviewRejected", "已退回題庫"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setReviewing(null);
    }
  };

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
      {/* Breadcrumb Header */}
      <Header
        aria-label={t("questionBank.adminTitle", "題庫管理")}
        className={styles.header}
      >
        <div className={styles.headerLeft}>
          <SideMenuToggle
            isOpen={sideMenuOpen}
            onClick={() => setSideMenuOpen((o) => !o)}
          />
          <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
            <BreadcrumbItem>
              <Link to="/question-banks">{t("questionBank.title", "題庫")}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              {bank.name}
            </BreadcrumbItem>
          </Breadcrumb>
        </div>
        <HeaderGlobalBar>
          <UserMenu />
        </HeaderGlobalBar>
        <SideMenu
          isOpen={sideMenuOpen}
          onClose={() => setSideMenuOpen(false)}
        />
      </Header>

      {/* Toolbar (below header, above hero) */}
      <div className={styles.localToolbar}>
          <div className={styles.localToolbarLeft}>
            <h4 className={styles.localToolbarTitle}>
              {t("page.problemManagement", "題目管理")}
            </h4>
            <span className={styles.localToolbarMeta}>
              {t("questionBank.questionCount", "共 {{count}} 題", { count: questions.length })}
            </span>
          </div>
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
            <Layer>
              <Popover
                open={filterOpen}
                align="bottom-right"
                isTabTip
                onRequestClose={() => setFilterOpen(false)}
              >
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Filter}
                  iconDescription={t("questionBank.showFilters", "篩選")}
                  tooltipPosition="bottom"
                  tooltipAlignment="center"
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`${styles.localToolbarIconButton} ${
                    hasActiveFilters ? styles.localToolbarIconActive : ""
                  }`}
                />
                <PopoverContent className={styles.filterPopoverContent}>
                  <div className={styles.filterPopoverFields}>
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
                  </div>
                  <div className={styles.filterPopoverActions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterState((prev) => ({
                          keyword: prev.keyword,
                          difficulty: [],
                          tags: [],
                          questionTypes: [],
                          sort: "order",
                        }));
                      }}
                    >
                      {t("common.reset", "重設")}
                    </Button>
                    <Button kind="primary" size="sm" onClick={() => setFilterOpen(false)}>
                      {t("common.done", "完成")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </Layer>
            {canEditSettings && (
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
            )}
            {canEditSettings && (
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
            )}
            {canEditSettings && (
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
            )}
          </div>
        </div>

      <main className={styles.content}>
        <QJudgeHeroWidget
          title={bank.name}
          description={bank.description || t("message.noData", "暫無資料")}
          icon={HeroWidgetIcon}
          coverUrl={bank.coverUrl || undefined}
          badges={
            isExplore ? (
              <Tag type="blue">{t("questionBank.tabs.explore", "探索題庫")}</Tag>
            ) : undefined
          }
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
        {canEditSettings && (
          <SettingsModal
            open={settingsModalOpen}
            onRequestClose={() => setSettingsModalOpen(false)}
            modalHeading={t("tab.settings", "設定")}
            navItems={[
              { id: "general", label: t("questionBank.basicInfo", "基本資訊"), icon: Settings },
              { id: "review", label: t("questionBank.publishReview", "上架審核"), icon: Microscope },
            ]}
            renderPanel={(activeId) => {
              if (activeId === "general") {
                return (
                  <QuestionBankSettingsGeneralPanel
                    bank={bank}
                    onRefresh={handleRefreshBank}
                  />
                );
              }
              if (activeId === "review") {
                return (
                  <Section title={t("questionBank.publishReview", "上架審核")}>
                    <FieldRow
                      label={t("questionBank.currentReviewStatus", "目前狀態")}
                      description={t("questionBank.reviewHint", "教師送審後由 Admin 核准上架 Marketplace")}
                    >
                      <Tag
                        type={
                          bank.reviewStatus === "approved"
                            ? "green"
                            : bank.reviewStatus === "pending"
                            ? "purple"
                            : "gray"
                        }
                      >
                        {bank.reviewStatus === "approved"
                          ? t("questionBank.reviewStatus.approved", "已核准")
                          : bank.reviewStatus === "pending"
                          ? t("questionBank.reviewStatus.pending", "審核中")
                          : bank.reviewStatus === "rejected"
                          ? t("questionBank.reviewStatus.rejected", "已退回")
                          : t("questionBank.reviewStatus.draft", "草稿")}
                      </Tag>
                    </FieldRow>
                    {!isAdmin && (
                      <Button
                        kind="tertiary"
                        disabled={submittingReview || bank.reviewStatus === "pending"}
                        onClick={() => {
                          void handleSubmitForReview();
                        }}
                      >
                        {submittingReview
                          ? t("questionBank.submittingReview", "送審中...")
                          : t("questionBank.submitForReview", "送審上架")}
                      </Button>
                    )}
                    {isAdmin && bank.reviewStatus === "pending" && (
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <Button
                          kind="primary"
                          disabled={reviewing !== null}
                          onClick={() => {
                            void handleAdminReview("approve");
                          }}
                        >
                          {reviewing === "approve"
                            ? t("questionBank.approving", "核准中...")
                            : t("questionBank.approve", "核准上架")}
                        </Button>
                        <Button
                          kind="danger--tertiary"
                          disabled={reviewing !== null}
                          onClick={() => {
                            void handleAdminReview("reject");
                          }}
                        >
                          {reviewing === "reject"
                            ? t("questionBank.rejecting", "退回中...")
                            : t("questionBank.reject", "退回")}
                        </Button>
                      </div>
                    )}
                  </Section>
                );
              }
              return null;
            }}
          />
        )}

        {/* Import Inbox Modal (controlled from header) */}
        {canEditSettings && (
          <ImportInboxModal
            open={importInboxOpen}
            onClose={() => setImportInboxOpen(false)}
            bankId={bank.id}
            bankCategory={bank.category}
            onIngested={() => void loadData()}
          />
        )}
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
