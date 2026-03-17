import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Grid,
  Column,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Loading,
  Tile,
  ClickableTile,
  Stack,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Checkbox,
  InlineNotification,
} from "@carbon/react";
import { Add, Code, CheckmarkFilled, Download } from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts";
import type {
  ExploreBankItem,
  QuestionBank,
  QuestionInboxItem,
  QuestionInboxSummary,
} from "@/core/entities/question-bank.entity";
import {
  create as createQuestionBank,
  ingestInbox,
  listInbox,
  listExplore,
  listMine,
} from "@/infrastructure/api/repositories/questionBank.repository";
import styles from "./QuestionBanksScreen.module.scss";

type MockExploreCard = {
  id: string;
  name: string;
  description: string;
  category: "coding" | "exam";
  questionCount: number;
  ownerLabel: string;
  verified: boolean;
  downloads: string;
};

interface BankGalleryCardProps {
  title: string;
  provider: string;
  providerVerified?: boolean;
  downloads?: string;
  onClick?: () => void;
}

const BankGalleryCard = ({
  title,
  provider,
  providerVerified = false,
  downloads = "0",
  onClick,
}: BankGalleryCardProps) => {
  const content = (
    <>
      <div className={styles.cover}>
        <span className={styles.coverBadge}>QJudge Community</span>
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={styles.iconWrap}>
            <Code size={16} />
          </div>
          <div className={styles.titleContent}>
            <div className={styles.titleLine}>
              <h4 className={styles.title}>{title}</h4>
              {providerVerified ? (
                <CheckmarkFilled size={16} className={styles.verifiedIcon} />
              ) : null}
            </div>
            <p className={styles.providerMetaRow}>
              <span className={styles.provider}>by {provider}</span>
              <span className={styles.metaItem}>
                <Download size={12} aria-hidden />
                {downloads}
              </span>
            </p>
          </div>
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <ClickableTile onClick={onClick} className={`${styles.galleryCard} ${styles.clickableCard}`}>
        {content}
      </ClickableTile>
    );
  }

  return <Tile className={styles.galleryCard}>{content}</Tile>;
};

const QuestionBanksScreen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [mineBanks, setMineBanks] = useState<QuestionBank[]>([]);
  const [exploreBanks, setExploreBanks] = useState<ExploreBankItem[]>([]);
  const [inbox, setInbox] = useState<QuestionInboxSummary>({
    coding: [],
    exam: [],
    counts: { coding: 0, exam: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<"coding" | "exam" | null>(null);
  const [selectedCoding, setSelectedCoding] = useState<number[]>([]);
  const [selectedExam, setSelectedExam] = useState<number[]>([]);
  const [targetCodingBankId, setTargetCodingBankId] = useState("");
  const [targetExamBankId, setTargetExamBankId] = useState("");
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankDescription, setBankDescription] = useState("");
  const [bankCategory, setBankCategory] = useState<"coding" | "exam">("coding");

  const buildMetric = (value: number): string => {
    if (value >= 1000) {
      const rounded = (value / 1000).toFixed(1);
      return `${rounded.replace(".0", "")}k`;
    }
    return String(value);
  };

  const mockExploreCards = useMemo<MockExploreCard[]>(
    () => [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: t("questionBank.mockOfficialBank1Name", "演算法入門 - 迭迴"),
        description: t(
          "questionBank.mockOfficialBank1Desc",
          "從遞迴與基礎搜尋開始，逐步建立解題思維。"
        ),
        category: "coding",
        questionCount: 120,
        ownerLabel: t("questionBank.mockOwnerPlatform", "QJudge Community"),
        verified: true,
        downloads: "19.3k",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: t("questionBank.mockOfficialBank2Name", "資料結構實作題庫"),
        description: t(
          "questionBank.mockOfficialBank2Desc",
          "以教學進度分層整理的資料結構與實作題。"
        ),
        category: "coding",
        questionCount: 86,
        ownerLabel: t("questionBank.mockOwnerPlatform", "QJudge Community"),
        verified: true,
        downloads: "13.7k",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: t("questionBank.mockUserBank1Name", "陳老師 APCS 練習集"),
        description: t(
          "questionBank.mockUserBank1Desc",
          "教室實戰導向，聚焦 APCS 觀念與常見錯誤。"
        ),
        category: "coding",
        questionCount: 34,
        ownerLabel: t("questionBank.mockOwnerTeacherA", "陳老師"),
        verified: false,
        downloads: "4.8k",
      },
      {
        id: "00000000-0000-4000-8000-000000000004",
        name: t("questionBank.mockUserBank2Name", "林老師段考題庫"),
        description: t(
          "questionBank.mockUserBank2Desc",
          "校內段考題型整理，附評分重點與難度分級。"
        ),
        category: "exam",
        questionCount: 52,
        ownerLabel: t("questionBank.mockOwnerTeacherB", "林老師"),
        verified: false,
        downloads: "7.2k",
      },
    ],
    [t]
  );

  const refreshBanks = async () => {
    try {
      setLoading(true);
      const [mine, explore, inboxRows] = await Promise.all([
        listMine(),
        listExplore(),
        listInbox(),
      ]);
      setMineBanks(mine);
      setExploreBanks(explore);
      setInbox(inboxRows);
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
    void refreshBanks();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "explore") {
      setActiveTabIndex(1);
      return;
    }
    if (tab === "inbox") {
      setActiveTabIndex(2);
      return;
    }
    setActiveTabIndex(0);
  }, [searchParams]);

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    const nextIndex = selectedIndex;
    setActiveTabIndex(nextIndex);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextIndex === 0) {
        next.delete("tab");
      } else if (nextIndex === 1) {
        next.set("tab", "explore");
      } else {
        next.set("tab", "inbox");
      }
      return next;
    });
  };

  useEffect(() => {
    const codingBank = mineBanks.find((bank) => bank.category === "coding");
    if (codingBank && !targetCodingBankId) {
      setTargetCodingBankId(codingBank.id);
    }

    const examBank = mineBanks.find((bank) => bank.category === "exam");
    if (examBank && !targetExamBankId) {
      setTargetExamBankId(examBank.id);
    }
  }, [mineBanks, targetCodingBankId, targetExamBankId]);

  const codingBanks = useMemo(
    () => mineBanks.filter((bank) => bank.category === "coding"),
    [mineBanks],
  );
  const examBanks = useMemo(
    () => mineBanks.filter((bank) => bank.category === "exam"),
    [mineBanks],
  );

  const toggleSelected = (
    sourceId: number,
    category: "coding" | "exam",
  ) => {
    const setState = category === "coding" ? setSelectedCoding : setSelectedExam;
    setState((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const handleIngest = async (category: "coding" | "exam") => {
    const targetBankId = category === "coding" ? targetCodingBankId : targetExamBankId;
    const selectedIds = category === "coding" ? selectedCoding : selectedExam;
    const sourceType = category === "coding" ? "problem" : "exam_question";

    if (!targetBankId || selectedIds.length === 0) return;

    try {
      setIngesting(category);
      await ingestInbox({
        targetBankId,
        items: selectedIds.map((sourceId) => ({ sourceType, sourceId })),
      });
      if (category === "coding") {
        setSelectedCoding([]);
      } else {
        setSelectedExam([]);
      }
      const [mineRows, inboxRows] = await Promise.all([listMine(), listInbox()]);
      setMineBanks(mineRows);
      setInbox(inboxRows);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.inbox.ingestSuccess", "已成功收編到題庫"),
      });
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setIngesting(null);
    }
  };

  const renderInboxRows = (
    items: QuestionInboxItem[],
    category: "coding" | "exam",
  ) => {
    const selectedIds = category === "coding" ? selectedCoding : selectedExam;
    if (items.length === 0) {
      return (
        <p className={styles.inboxEmpty}>
          {t("questionBank.inbox.empty", "目前沒有待收編題目。")}
        </p>
      );
    }

    return (
      <div className={styles.inboxList}>
        {items.map((item) => (
          <div key={`${item.sourceType}-${item.sourceId}`} className={styles.inboxRow}>
            <Checkbox
              id={`${category}-${item.sourceId}`}
              checked={selectedIds.includes(item.sourceId)}
              labelText=""
              onChange={() => toggleSelected(item.sourceId, category)}
            />
            <div className={styles.inboxRowContent}>
              <div className={styles.inboxTitle}>{item.title}</div>
              <div className={styles.inboxMeta}>
                {item.contestName || t("questionBank.inbox.fromUnknown", "來源未標記")}
                {typeof item.score === "number" ? ` · ${item.score}pt` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleCreateBank = async () => {
    if (!bankName.trim()) return;

    try {
      await createQuestionBank({
        name: bankName.trim(),
        description: bankDescription.trim(),
        category: bankCategory,
        visibility: "private",
      });
      setBankModalOpen(false);
      setBankName("");
      setBankDescription("");
      setBankCategory("coding");
      await refreshBanks();
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.bankCreated", "題庫已建立"),
      });
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

  return (
    <div>
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <PageHeader
            title={t("page.questionBanks", "題庫")}
            subtitle={t(
              "questionBank.subtitle",
              "以教室化為中心管理我的題庫與探索題庫"
            )}
            action={
              <Button
                kind="primary"
                size="sm"
                renderIcon={Add}
                onClick={() => setBankModalOpen(true)}
              >
                {t("questionBank.createBank", "建立題庫")}
              </Button>
            }
          />
        </Column>

        <Column lg={16} md={8} sm={4}>
          <Tabs selectedIndex={activeTabIndex} onChange={handleTabChange}>
            <TabList aria-label="question bank tabs">
              <Tab>{t("questionBank.tabs.mine", "我的題庫")}</Tab>
              <Tab>{t("questionBank.tabs.explore", "探索題庫")}</Tab>
              <Tab>{t("questionBank.tabs.inbox", "待收編")}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                {mineBanks.length === 0 ? (
                  <Tile>
                    {t("questionBank.emptyMine", "目前沒有題庫，先建立一個我的題庫。")}
                  </Tile>
                ) : (
                  <Grid fullWidth>
                    {mineBanks.map((bank) => (
                      <Column key={bank.id} lg={4} md={4} sm={4}>
                        <BankGalleryCard
                          title={bank.name}
                          provider={bank.ownerUsername || t("questionBank.mockOwnerTeacherA", "陳老師")}
                          providerVerified={bank.verified}
                          downloads={buildMetric(Math.max(120, bank.questionCount * 68))}
                          onClick={() => navigate(`/question-banks/${bank.id}`)}
                        />
                      </Column>
                    ))}
                  </Grid>
                )}
              </TabPanel>

              <TabPanel>
                <Stack gap={5}>
                  <Stack gap={3}>
                    <h4 style={{ margin: 0 }}>
                      {t("questionBank.mockGalleryTitle", "Mock Card Gallery")}
                    </h4>
                    <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
                      {t(
                        "questionBank.mockGalleryDesc",
                        "以下為 UI mock 預覽，示範 QJudge Community 題庫卡片。"
                      )}
                    </p>
                    <Grid fullWidth>
                      {mockExploreCards.map((item) => (
                        <Column key={item.id} lg={4} md={4} sm={4}>
                          <BankGalleryCard
                          title={item.name}
                          provider={item.ownerLabel}
                          providerVerified={item.verified}
                          downloads={item.downloads}
                        />
                      </Column>
                    ))}
                    </Grid>
                  </Stack>

                  <Tile>
                    <Stack gap={2}>
                      <h5 style={{ margin: 0 }}>
                        {t("questionBank.exploreOnlyPlatform", "探索題庫目前以 QJudge Community 為主")}
                      </h5>
                      <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
                        {t(
                          "questionBank.exploreOnlyPlatformDesc",
                          "Phase1 不包含教師共享題庫，先以 Community 驗證題庫為主。"
                        )}
                      </p>
                    </Stack>
                  </Tile>

                  {exploreBanks.length === 0 ? (
                    <Tile>
                      {t(
                        "questionBank.emptyExplore",
                        "探索題庫目前僅平台提供；暫無可探索內容。"
                      )}
                    </Tile>
                  ) : (
                    <Grid fullWidth>
                      {exploreBanks.map((bank) => (
                        <Column key={bank.id} lg={4} md={4} sm={4}>
                          <BankGalleryCard
                          title={bank.name}
                          provider={bank.ownerUsername || t("questionBank.mockOwnerPlatform", "QJudge Community")}
                          providerVerified={bank.verified}
                          downloads={buildMetric(Math.max(300, bank.questionCount * 96))}
                        />
                      </Column>
                    ))}
                    </Grid>
                  )}
                </Stack>
              </TabPanel>

              <TabPanel>
                <Stack gap={4}>
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title={t("questionBank.inbox.title", "待收編題目")}
                    subtitle={t(
                      "questionBank.inbox.description",
                      "在競賽內臨時建立、尚未歸入題庫的題目，可在這裡手動收編到指定題庫。"
                    )}
                  />

                  <>
                      <Tile>
                        <Stack gap={4}>
                          <h5 className={styles.inboxSectionTitle}>
                            {t("questionBank.inbox.coding", "程式題待收編")} ({inbox.counts.coding})
                          </h5>
                          <Select
                            id="inbox-coding-target"
                            labelText={t("questionBank.inbox.targetBank", "目標題庫")}
                            value={targetCodingBankId}
                            onChange={(e) => setTargetCodingBankId(e.currentTarget.value)}
                          >
                            {codingBanks.length === 0 ? (
                              <SelectItem value="" text={t("questionBank.inbox.noCodingBank", "尚無程式題庫")} />
                            ) : (
                              codingBanks.map((bank) => (
                                <SelectItem key={bank.id} value={bank.id} text={bank.name} />
                              ))
                            )}
                          </Select>
                          {renderInboxRows(inbox.coding, "coding")}
                          <Button
                            kind="secondary"
                            size="sm"
                            disabled={
                              codingBanks.length === 0 ||
                              !targetCodingBankId ||
                              selectedCoding.length === 0 ||
                              ingesting !== null
                            }
                            onClick={() => void handleIngest("coding")}
                          >
                            {ingesting === "coding"
                              ? t("questionBank.inbox.ingesting", "收編中...")
                              : t("questionBank.inbox.ingestSelected", "收編選取題目")}
                          </Button>
                        </Stack>
                      </Tile>

                      <Tile>
                        <Stack gap={4}>
                          <h5 className={styles.inboxSectionTitle}>
                            {t("questionBank.inbox.exam", "考卷題待收編")} ({inbox.counts.exam})
                          </h5>
                          <Select
                            id="inbox-exam-target"
                            labelText={t("questionBank.inbox.targetBank", "目標題庫")}
                            value={targetExamBankId}
                            onChange={(e) => setTargetExamBankId(e.currentTarget.value)}
                          >
                            {examBanks.length === 0 ? (
                              <SelectItem value="" text={t("questionBank.inbox.noExamBank", "尚無考卷題庫")} />
                            ) : (
                              examBanks.map((bank) => (
                                <SelectItem key={bank.id} value={bank.id} text={bank.name} />
                              ))
                            )}
                          </Select>
                          {renderInboxRows(inbox.exam, "exam")}
                          <Button
                            kind="secondary"
                            size="sm"
                            disabled={
                              examBanks.length === 0 ||
                              !targetExamBankId ||
                              selectedExam.length === 0 ||
                              ingesting !== null
                            }
                            onClick={() => void handleIngest("exam")}
                          >
                            {ingesting === "exam"
                              ? t("questionBank.inbox.ingesting", "收編中...")
                              : t("questionBank.inbox.ingestSelected", "收編選取題目")}
                          </Button>
                        </Stack>
                      </Tile>
                  </>
                </Stack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Column>
      </Grid>

      <Modal
        open={bankModalOpen}
        modalHeading={t("questionBank.createBank", "建立題庫")}
        primaryButtonText={t("button.create")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => setBankModalOpen(false)}
        onRequestSubmit={() => {
          void handleCreateBank();
        }}
        primaryButtonDisabled={!bankName.trim()}
      >
        <Stack gap={5}>
          <TextInput
            id="bank-name"
            labelText={t("table.title")}
            value={bankName}
            onChange={(e) => setBankName(e.currentTarget.value)}
          />
          <TextInput
            id="bank-description"
            labelText={t("questionBank.description", "描述")}
            value={bankDescription}
            onChange={(e) => setBankDescription(e.currentTarget.value)}
          />
          <Select
            id="bank-category"
            labelText={t("questionBank.category", "分類")}
            value={bankCategory}
            onChange={(e) =>
              setBankCategory(e.currentTarget.value as "coding" | "exam")
            }
          >
            <SelectItem
              value="coding"
              text={t("questionBank.categoryCoding", "程式題")}
            />
            <SelectItem
              value="exam"
              text={t("questionBank.categoryExam", "考卷題")}
            />
          </Select>
        </Stack>
      </Modal>
    </div>
  );
};

export default QuestionBanksScreen;
