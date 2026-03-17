import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Column, Grid, Loading, Select, SelectItem, Stack, Tag, TextArea, TextInput, Tile } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import { KpiCard } from "@/shared/ui/dataCard";
import { useToast } from "@/shared/contexts";
import type { BankQuestion, BankVisibility, QuestionBank } from "@/core/entities/question-bank.entity";
import {
  listMine,
  listQuestions,
  update as updateQuestionBank,
} from "@/infrastructure/api/repositories/questionBank.repository";
import QuestionBankAdminLayout, {
  type QuestionBankAdminPanelId,
} from "./QuestionBankAdminLayout";
import QuestionBankProblemManagementPanel from "./QuestionBankProblemManagementPanel";
import type { ProblemManagementViewState } from "./questionBankProblemManagement.utils";
import styles from "./QuestionBankDetailScreen.module.scss";

const PANEL_ALIAS: Record<string, QuestionBankAdminPanelId> = {
  overview: "overview",
  problems: "problem_management",
  problem_management: "problem_management",
  settings: "settings",
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

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);

  const [settingName, setSettingName] = useState("");
  const [settingDescription, setSettingDescription] = useState("");
  const [settingVisibility, setSettingVisibility] = useState<BankVisibility>("private");
  const [savingSettings, setSavingSettings] = useState(false);

  const panelParam = searchParams.get("panel");
  const activePanel = useMemo(() => normalizePanel(panelParam), [panelParam]);
  const viewMode = useMemo(
    () => normalizeViewMode(searchParams.get("viewMode")),
    [searchParams]
  );
  const selectedQuestionId = searchParams.get("selectedQuestionId");

  const examQuestionCount = useMemo(
    () => questions.filter((question) => question.questionType === "exam").length,
    [questions]
  );

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
      const mineBanks = await listMine();
      const target = mineBanks.find((item) => item.id === bankId) || null;
      setBank(target);

      if (!target) return;

      setSettingName(target.name);
      setSettingDescription(target.description || "");
      setSettingVisibility(target.visibility);

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

  return (
    <QuestionBankAdminLayout
      bankName={bank.name}
      activePanel={activePanel}
      onPanelChange={handlePanelChange}
      onBack={() => navigate("/question-banks")}
      onRefresh={() => {
        void loadData();
      }}
    >
      <div className={styles.pageScroll}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroTopRow}>
              <div className={styles.heroInfo}>
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
                <p className={styles.description}>{bank.description || t("message.noData", "暫無資料")}</p>
              </div>

              <div className={styles.kpiStrip}>
                <KpiCard
                  value={String(questions.length)}
                  label={t("questionBank.mockQuestionCount", "{{count}} 題", { count: questions.length })}
                  showBorder={false}
                  className={styles.kpiCard}
                />
                <KpiCard
                  value={String(examQuestionCount)}
                  label={t("questionBank.categoryExam", "考卷題")}
                  showBorder={false}
                  className={styles.kpiCard}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panelSection}>
          {activePanel === "overview" ? (
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
          ) : null}

          {activePanel === "problem_management" ? (
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
            />
          ) : null}

          {activePanel === "settings" ? (
            <div className={styles.settingsPanel}>
              <Tile>
                <Stack gap={5}>
                  <h4 className={styles.panelTitle}>{t("tab.settings", "設定")}</h4>
                  <TextInput
                    id="bank-name-setting"
                    labelText={t("table.title", "標題")}
                    value={settingName}
                    onChange={(event) => setSettingName(event.currentTarget.value)}
                  />
                  <TextArea
                    id="bank-description-setting"
                    labelText={t("questionBank.description", "描述")}
                    value={settingDescription}
                    onChange={(event) => setSettingDescription(event.currentTarget.value)}
                  />
                  <Select
                    id="bank-visibility-setting"
                    labelText={t("table.visibility", "可見性")}
                    value={settingVisibility}
                    onChange={(event) => setSettingVisibility(event.currentTarget.value as BankVisibility)}
                  >
                    <SelectItem value="private" text={t("questionBank.tagPrivate", "私人")} />
                    <SelectItem value="public" text={t("questionBank.tagPublic", "公開")} />
                  </Select>
                  <div>
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
                </Stack>
              </Tile>
            </div>
          ) : null}
        </section>
      </div>
    </QuestionBankAdminLayout>
  );
};

export default QuestionBankDetailScreen;
