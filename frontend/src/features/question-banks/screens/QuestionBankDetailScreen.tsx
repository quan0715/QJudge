import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Column, Grid, Loading, Modal, Select, SelectItem, Stack, Tag, TextArea, TextInput, Tile } from "@carbon/react";
import { ArrowLeft, Document, Settings, Tag as TagIcon, View, ViewOff, Microscope } from "@carbon/icons-react";
import { KpiCard } from "@/shared/ui/dataCard";
import { SettingsModal } from "@/shared/ui/modal/SettingsModal";
import { Section, FieldRow } from "@/shared/layout/SettingsPanel";
import { useToast } from "@/shared/contexts";
import type { BankQuestion, BankVisibility, QuestionBank } from "@/core/entities/question-bank.entity";
import {
  clone,
  getBank,
  listMine,
  review as reviewQuestionBank,
  listQuestions,
  submitForReview,
  uploadCover,
  update as updateQuestionBank,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { ImageEditDialog } from "@/shared/ui/image";
import { CLASSROOM_ICON_OPTIONS, getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { useAuth } from "@/features/auth";
import QuestionBankAdminLayout, {
  type QuestionBankAdminPanelId,
} from "./QuestionBankAdminLayout";
import QuestionBankProblemManagementPanel from "./QuestionBankProblemManagementPanel";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import type { ProblemManagementViewState } from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankDetailScreen.module.scss";

const PANEL_ALIAS: Record<string, QuestionBankAdminPanelId> = {
  overview: "overview",
  problems: "problem_management",
  problem_management: "problem_management",
};

const normalizePanel = (value: string | null): QuestionBankAdminPanelId =>
  value && PANEL_ALIAS[value] ? PANEL_ALIAS[value] : "overview";

const normalizeViewMode = (value: string | null): ProblemManagementViewState["mode"] =>
  value === "split" ? "split" : "gallery";

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const QuestionBankDetailScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [isExplore, setIsExplore] = useState(false);
  const [myBanks, setMyBanks] = useState<QuestionBank[]>([]);

  const [settingName, setSettingName] = useState("");
  const [settingDescription, setSettingDescription] = useState("");
  const [settingIcon, setSettingIcon] = useState("");
  const [settingCoverUrl, setSettingCoverUrl] = useState("");
  const [settingVisibility, setSettingVisibility] = useState<BankVisibility>("private");
  const [savingSettings, setSavingSettings] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewing, setReviewing] = useState<"approve" | "reject" | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const panelParam = searchParams.get("panel");
  const activePanel = useMemo(() => normalizePanel(panelParam), [panelParam]);
  const viewMode = useMemo(
    () => normalizeViewMode(searchParams.get("viewMode")),
    [searchParams]
  );
  const selectedQuestionId = searchParams.get("selectedQuestionId");

  const questionCountLabel = useMemo(
    () => t("examEditor.questionList", "題目列表"),
    [t]
  );
  const isAdmin = user?.role === "admin";
  const canEditSettings = !isExplore || isAdmin;

  const syncProblemViewState = (next: Partial<ProblemManagementViewState>) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      const mode = next.mode ?? viewMode;
      const selectedId =
        next.selectedId !== undefined ? next.selectedId : selectedQuestionId;

      if (mode === "gallery") {
        params.delete("viewMode");
      } else {
        params.set("viewMode", mode);
      }

      if (selectedId) {
        params.set("selectedQuestionId", selectedId);
      } else {
        params.delete("selectedQuestionId");
      }
      return params;
    });
  };

  const loadData = useCallback(async () => {
    if (!bankId) return;
    try {
      setLoading(true);
      const [target, mine] = await Promise.all([getBank(bankId), listMine()]);
      setBank(target);
      setMyBanks(mine);

      const owned = mine.some((item) => item.id === bankId);
      setIsExplore(!owned);

      if (owned) {
        setSettingName(target.name);
        setSettingDescription(target.description || "");
        setSettingIcon(target.icon || "");
        setSettingCoverUrl(target.coverUrl || "");
        setSettingVisibility(target.visibility);
      }

      const rows = await listQuestions(target.id);
      setQuestions(rows);
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setLoading(false);
    }
  }, [bankId, showToast, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const normalized = normalizePanel(panelParam);
    if (panelParam === normalized || (panelParam == null && normalized === "overview")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (normalized === "overview") next.delete("panel");
      else next.set("panel", normalized);
      return next;
    });
  }, [panelParam, setSearchParams]);

  const handlePanelChange = (panel: QuestionBankAdminPanelId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (panel === "overview") next.delete("panel");
      else next.set("panel", panel);
      return next;
    });
  };

  const handleSaveSettings = async () => {
    if (!bank || !settingName.trim()) return;
    try {
      setSavingSettings(true);
      const updated = await updateQuestionBank(bank.id, {
        name: settingName.trim(),
        description: settingDescription.trim(),
        icon: settingIcon,
        cover_url: settingCoverUrl,
        visibility: settingVisibility,
      });
      setBank(updated);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.bankUpdated", "題庫已更新"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUploadCover = async (file: File) => {
    if (!bank) return;
    setUploadingCover(true);
    try {
      const url = await uploadCover(bank.id, file);
      setSettingCoverUrl(url);
      const updated = await updateQuestionBank(bank.id, { cover_url: url });
      setBank(updated);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.coverUpdated", "封面已更新"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSetCoverUrl = async (value: string) => {
    const url = value.trim();
    if (!url) return;
    setSettingCoverUrl(url);
  };

  const handleRemoveCover = async () => {
    setSettingCoverUrl("");
    if (!bank) return;
    try {
      const updated = await updateQuestionBank(bank.id, { cover_url: "" });
      setBank(updated);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.coverRemoved", "封面已移除"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

  const handleClone = async (questionId: string, targetBankId: string) => {
    try {
      await clone(questionId, targetBankId);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.questionCloned", "題目已複製到我的題庫"),
      });
    } catch (error: unknown) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: getErrorMessage(error, t("message.error")),
      });
    }
  };

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
              <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/question-banks")}>
                {t("button.back", "返回")}
              </Button>
            </div>
          </Stack>
        </Tile>
      </div>
    );
  }

  const HeroIcon = getClassroomIcon(bank.icon);
  const heroStyle = bank.coverUrl
    ? { backgroundImage: `url(${bank.coverUrl})` }
    : undefined;

  return (
    <QuestionBankAdminLayout
      bankName={bank.name}
      activePanel={activePanel}
      onPanelChange={handlePanelChange}
      onBack={() => navigate(isExplore ? "/marketplace" : "/question-banks")}
      onOpenSettings={() => {
        setSettingsModalOpen(true);
      }}
      readOnly={!canEditSettings}
    >
      <div className={styles.pageScroll}>
        {activePanel === "overview" && (
          <>
            <QJudgeHeroWidget
              title={bank.name}
              description={bank.description || t("message.noData", "暫無資料")}
              icon={HeroIcon}
              coverUrl={bank.coverUrl || undefined}
              badges={
                isExplore ? (
                  <Tag type="blue">{t("questionBank.tabs.explore", "探索題庫")}</Tag>
                ) : undefined
              }
              kpiCards={
                <KpiCard
                  icon={Document}
                  value={String(questions.length)}
                  label={questionCountLabel}
                  showBorder={true}
                />
              }
            />

            <section className={styles.panelSection}>
              <Grid fullWidth className={styles.overviewGrid}>
                <Column lg={8} md={8} sm={4}>
                  <Tile>
                    <Stack gap={3}>
                      <h4 className={styles.panelTitle}>{t("tab.overview", "總覽")}</h4>
                      <p className={styles.panelDesc}>
                        {t("questionBank.overviewDescription", "快速檢視題庫題量與題型分佈。")}
                      </p>
                    </Stack>
                  </Tile>
                </Column>
                <Column lg={8} md={8} sm={4}>
                  <Tile>
                    <Stack gap={3}>
                      <h4 className={styles.panelTitle}>{t("questionBank.recentQuestions", "近期題目")}</h4>
                      {questions.length === 0 ? (
                        <p className={styles.emptyText}>{t("message.noData", "暫無資料")}</p>
                      ) : (
                        <div className={styles.recentList}>
                          {questions.slice(0, 5).map((question) => (
                            <div key={question.id} className={styles.recentItem}>
                              <p className={styles.recentTitle}>{question.title}</p>
                              <p className={styles.recentMeta}>{question.questionType}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Stack>
                  </Tile>
                </Column>
              </Grid>
            </section>
          </>
        )}

        {activePanel === "problem_management" && (
          <QuestionBankProblemManagementPanel
            bank={bank}
            questions={questions}
            loading={loading}
            onReload={loadData}
            viewState={{
              mode: viewMode,
              selectedId: selectedQuestionId,
            }}
            onViewStateChange={syncProblemViewState}
            readOnly={isExplore}
            myBanks={isExplore ? myBanks : undefined}
            onClone={isExplore ? handleClone : undefined}
          />
        )}

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
                  <>
                    <Section title={t("questionBank.basicInfo", "基本資訊")}>
                      <FieldRow
                        label={t("questionBank.bankName", "題庫名稱")}
                        description={t("questionBank.bankNameDesc", "顯示在題庫列表和頁首的名稱")}
                      >
                        <TextInput
                          id="bank-name-setting"
                          labelText=""
                          hideLabel
                          value={settingName}
                          onChange={(event) => setSettingName(event.currentTarget.value)}
                        />
                      </FieldRow>
                      <FieldRow
                        label={t("questionBank.description", "題庫描述")}
                        description={t("questionBank.descriptionDesc", "簡短描述，出現在題庫概覽頁面")}
                      >
                        <TextArea
                          id="bank-description-setting"
                          labelText=""
                          hideLabel
                          value={settingDescription}
                          onChange={(event) => setSettingDescription(event.currentTarget.value)}
                        />
                      </FieldRow>
                      <FieldRow
                        label={t("questionBank.icon", "題庫圖示")}
                        description={t("questionBank.iconDesc", "顯示在題庫概覽頁首")}
                      >
                        <div className={styles.iconPicker}>
                          {CLASSROOM_ICON_OPTIONS.map((option) => {
                            const selected = settingIcon === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                className={`${styles.iconButton}${selected ? ` ${styles.iconButtonActive}` : ""}`}
                                onClick={() => setSettingIcon(option.key)}
                                title={option.label}
                              >
                                <option.Icon size={18} />
                              </button>
                            );
                          })}
                        </div>
                      </FieldRow>
                      <FieldRow
                        label={t("questionBank.coverImage", "封面圖片")}
                        description={t("questionBank.coverImageDesc", "顯示於題庫概覽頁首背景")}
                      >
                        <ImageEditDialog
                          variant="cover"
                          previewUrl={settingCoverUrl || undefined}
                          alt="question bank cover"
                          emptyLabel={t("questionBank.addCover", "新增封面")}
                          modalHeading={t("questionBank.editCover", "編輯封面")}
                          urlPlaceholder="https://images.unsplash.com/..."
                          uploadLabel={t("questionBank.uploadFile", "上傳檔案")}
                          removeLabel={t("questionBank.removeCover", "移除封面")}
                          applyLabel={t("button.apply", "套用")}
                          dropzoneLabel={t("questionBank.coverDropzoneTitle", "拖曳圖片到此處")}
                          dropzoneHint={t("questionBank.coverDropzoneHint", "支援 png / jpg / webp")}
                          disabled={uploadingCover}
                          onUpload={handleUploadCover}
                          onApplyUrl={handleSetCoverUrl}
                          onRemove={settingCoverUrl ? handleRemoveCover : undefined}
                        />
                      </FieldRow>
                      <FieldRow
                        label={t("questionBank.visibility", "可見性")}
                        description={t("questionBank.visibilityDesc", "公開題庫可被所有人瀏覽")}
                      >
                        <Select
                          id="bank-visibility-setting"
                          labelText=""
                          hideLabel
                          value={settingVisibility}
                          onChange={(event) => setSettingVisibility(event.currentTarget.value as BankVisibility)}
                        >
                          <SelectItem value="private" text={t("questionBank.tagPrivate", "私人")} />
                          <SelectItem value="public" text={t("questionBank.tagPublic", "公開")} />
                        </Select>
                      </FieldRow>
                    </Section>
                    <div style={{ marginTop: "1.5rem" }}>
                      <Button
                        kind="primary"
                        disabled={!settingName.trim() || savingSettings}
                        onClick={() => {
                          void handleSaveSettings();
                        }}
                      >
                        {savingSettings ? t("button.updating", "更新中...") : t("button.save", "儲存")}
                      </Button>
                    </div>
                  </>
                );
              }
              if (activeId === "review") {
                return (
                  <Section title={t("questionBank.publishReview", "上架審核")}>
                    <FieldRow
                      label={t("questionBank.currentReviewStatus", "目前狀態")}
                      description={t("questionBank.reviewHint", "教師送審後由 Admin 核准上架 Marketplace")}
                    >
                      <Tag type={bank.reviewStatus === "approved" ? "green" : bank.reviewStatus === "pending" ? "purple" : "gray"}>
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
      </div>
    </QuestionBankAdminLayout>
  );
};

export default QuestionBankDetailScreen;
