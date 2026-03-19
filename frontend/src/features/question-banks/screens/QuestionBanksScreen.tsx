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
  Tag,
} from "@carbon/react";
import {
  Add,
  Code,
  CheckmarkFilled,
  Download,
  Document,
} from "@carbon/icons-react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts";
import type {
  BankCategory,
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
import { getQuestionVisualFromInboxItem, type QuestionVisualTone } from "@/shared/ui/questionVisual";
import styles from "./QuestionBanksScreen.module.scss";

type InboxCategoryFilter = "all" | "coding" | "exam";

const INBOX_ICON_TONE_CLASS_MAP: Record<QuestionVisualTone, string> = {
  coding: styles.iconToneCoding,
  single_choice: styles.iconToneSingleChoice,
  multiple_choice: styles.iconToneMultipleChoice,
  true_false: styles.iconToneTrueFalse,
  short_answer: styles.iconToneShortAnswer,
  essay: styles.iconToneEssay,
};

interface BankGalleryCardProps {
  title: string;
  provider: string;
  category: BankCategory;
  providerVerified?: boolean;
  downloads?: string;
  onClick?: () => void;
}

const BankGalleryCard = ({
  title,
  provider,
  category,
  providerVerified = false,
  downloads = "0",
  onClick,
}: BankGalleryCardProps) => {
  const CardIcon = category === "exam" ? Document : Code;
  const iconToneClass = category === "exam" ? styles.iconToneExam : styles.iconToneCoding;
  const content = (
    <>
      <div className={styles.cover}>
        <span className={styles.coverBadge}>QJudge Community</span>
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={`${styles.iconWrap} ${iconToneClass}`}>
            <CardIcon size={16} />
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

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankDescription, setBankDescription] = useState("");
  const [bankCategory, setBankCategory] = useState<"coding" | "exam">("coding");
  const inboxFilter: InboxCategoryFilter = (() => {
    const category = searchParams.get("category");
    if (category === "coding" || category === "exam") {
      return category;
    }
    return "all";
  })();

  const buildMetric = (value: number): string => {
    if (value >= 1000) {
      const rounded = (value / 1000).toFixed(1);
      return `${rounded.replace(".0", "")}k`;
    }
    return String(value);
  };

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
    if (inboxFilter !== "all") {
      setActiveTabIndex(2);
      return;
    }
    setActiveTabIndex(0);
  }, [inboxFilter, searchParams]);

  const handleTabChange = ({ selectedIndex }: { selectedIndex: number }) => {
    const nextIndex = selectedIndex;
    setActiveTabIndex(nextIndex);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextIndex === 0) {
        next.delete("tab");
        next.delete("category");
      } else if (nextIndex === 1) {
        next.set("tab", "explore");
        next.delete("category");
      } else {
        next.set("tab", "inbox");
      }
      return next;
    });
  };

  const setInboxFilter = (filter: InboxCategoryFilter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "inbox");
      if (filter === "all") {
        next.delete("category");
      } else {
        next.set("category", filter);
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

  const filteredInboxItems = useMemo<QuestionInboxItem[]>(() => {
    if (inboxFilter === "coding") return inbox.coding;
    if (inboxFilter === "exam") return inbox.exam;
    return [...inbox.coding, ...inbox.exam];
  }, [inbox, inboxFilter]);

  const selectedInbox = useMemo<Set<string>>(() => {
    const keys = new Set<string>();
    selectedCoding.forEach((id) => keys.add(`problem-${id}`));
    selectedExam.forEach((id) => keys.add(`exam_question-${id}`));
    return keys;
  }, [selectedCoding, selectedExam]);

  const toggleInboxItem = (item: QuestionInboxItem) => {
    if (item.sourceType === "problem") {
      toggleSelected(item.sourceId, "coding");
    } else {
      toggleSelected(item.sourceId, "exam");
    }
  };

  const isInboxItemSelected = (item: QuestionInboxItem) =>
    selectedInbox.has(`${item.sourceType}-${item.sourceId}`);

  const totalSelectedCount = selectedCoding.length + selectedExam.length;

  const handleInboxSelectAll = () => {
    if (totalSelectedCount === filteredInboxItems.length && totalSelectedCount > 0) {
      setSelectedCoding([]);
      setSelectedExam([]);
    } else {
      setSelectedCoding(filteredInboxItems.filter((i) => i.sourceType === "problem").map((i) => i.sourceId));
      setSelectedExam(filteredInboxItems.filter((i) => i.sourceType === "exam_question").map((i) => i.sourceId));
    }
  };

  const handleIngestAll = async () => {
    try {
      setIngesting("coding");
      const promises: Promise<unknown>[] = [];
      if (selectedCoding.length > 0 && targetCodingBankId) {
        promises.push(
          ingestInbox({
            targetBankId: targetCodingBankId,
            items: selectedCoding.map((id) => ({ sourceType: "problem" as const, sourceId: id })),
          }),
        );
      }
      if (selectedExam.length > 0 && targetExamBankId) {
        promises.push(
          ingestInbox({
            targetBankId: targetExamBankId,
            items: selectedExam.map((id) => ({ sourceType: "exam_question" as const, sourceId: id })),
          }),
        );
      }
      await Promise.all(promises);
      setSelectedCoding([]);
      setSelectedExam([]);
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
              <Tab>{t("questionBank.tabs.inbox", "收編題目")}</Tab>
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
                          category={bank.category}
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
                            category={bank.category}
                            provider={bank.ownerUsername || t("questionBank.mockOwnerPlatform", "QJudge Community")}
                            providerVerified={bank.verified}
                            downloads={buildMetric(Math.max(300, bank.questionCount * 96))}
                            onClick={() => navigate(`/question-banks/${bank.id}?from=explore`)}
                          />
                        </Column>
                      ))}
                    </Grid>
                  )}
              </TabPanel>

              <TabPanel>
                <Stack gap={4}>
                  <div className={styles.inboxToolbar}>
                    <div className={styles.inboxFilterButtons}>
                      <Button
                        kind={inboxFilter === "all" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => setInboxFilter("all")}
                      >
                        {t("questionBank.inbox.filterAll", "全部")} ({inbox.counts.coding + inbox.counts.exam})
                      </Button>
                      <Button
                        kind={inboxFilter === "coding" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => setInboxFilter("coding")}
                      >
                        {t("questionBank.categoryCoding", "程式題")} ({inbox.counts.coding})
                      </Button>
                      <Button
                        kind={inboxFilter === "exam" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => setInboxFilter("exam")}
                      >
                        {t("questionBank.categoryExam", "考卷題")} ({inbox.counts.exam})
                      </Button>
                    </div>

                    <div className={styles.inboxActions}>
                      <Button kind="ghost" size="sm" onClick={handleInboxSelectAll}>
                        {totalSelectedCount > 0 && totalSelectedCount === filteredInboxItems.length
                          ? t("questionBank.inbox.clearSelection", "清除選取")
                          : t("questionBank.inbox.selectAll", "全選")}
                      </Button>
                      <span className={styles.inboxSelectedText}>
                        {t("questionBank.inbox.selectedCount", "已選 {{count}} 題").replace(
                          "{{count}}",
                          String(totalSelectedCount),
                        )}
                      </span>
                      <Button
                        kind="primary"
                        size="sm"
                        renderIcon={Download}
                        disabled={totalSelectedCount === 0 || ingesting !== null}
                        onClick={() => setMoveModalOpen(true)}
                      >
                        {t("questionBank.inbox.moveTo", "收錄到題庫")}
                      </Button>
                    </div>
                  </div>

                  {filteredInboxItems.length === 0 ? (
                    <Tile className={styles.inboxEmptyTile}>
                      <p className={styles.inboxEmpty}>
                        {t("questionBank.inbox.empty", "目前沒有可收編的題目。")}
                      </p>
                    </Tile>
                  ) : (
                    <div className={styles.inboxList}>
                      {filteredInboxItems.map((item) => {
                        const key = `${item.sourceType}-${item.sourceId}`;
                        const selected = isInboxItemSelected(item);
                        const { Icon, tone } = getQuestionVisualFromInboxItem(item, "colored");
                        const toneClass = INBOX_ICON_TONE_CLASS_MAP[tone || "coding"];
                        const typeLabel =
                          item.sourceType === "problem"
                            ? t("questionType.label.coding", "程式題")
                            : t(`questionType.label.${item.questionType || "exam"}`, item.questionType || "考卷題");

                        return (
                          <div
                            key={key}
                            className={`${styles.inboxCard} ${selected ? styles.inboxCardSelected : ""}`}
                            onClick={() => toggleInboxItem(item)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleInboxItem(item);
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              readOnly
                              className={styles.inboxCheck}
                            />
                            <div className={styles.inboxCardBody}>
                              <div className={styles.inboxCardTypeInfo}>
                                <span className={`${styles.inboxCardIcon} ${toneClass}`}>
                                  <Icon size={14} />
                                </span>
                                <span className={styles.inboxCardTypeLabel}>{typeLabel}</span>
                              </div>
                              <h4 className={styles.inboxCardTitle}>{item.title}</h4>
                              <div className={styles.inboxCardMeta}>
                                {item.contestName && (
                                  <Tag size="sm" type="cool-gray">{item.contestName}</Tag>
                                )}
                                {item.score != null && (
                                  <Tag size="sm" type="gray">{item.score} pt</Tag>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

      <Modal
        open={moveModalOpen}
        modalHeading={t("questionBank.inbox.moveTo", "收錄到題庫")}
        primaryButtonText={ingesting ? t("questionBank.inbox.ingesting", "收編中...") : t("questionBank.inbox.moveTo", "收錄到題庫")}
        secondaryButtonText={t("button.cancel")}
        onRequestClose={() => setMoveModalOpen(false)}
        onRequestSubmit={() => {
          void handleIngestAll().then(() => setMoveModalOpen(false));
        }}
        primaryButtonDisabled={ingesting !== null}
        size="sm"
      >
        <Stack gap={5}>
          {selectedCoding.length > 0 && (
            <Select
              id="move-coding-target"
              labelText={t("questionBank.inbox.codingTarget", "程式題目標題庫") + ` (${selectedCoding.length})`}
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
          )}
          {selectedExam.length > 0 && (
            <Select
              id="move-exam-target"
              labelText={t("questionBank.inbox.examTarget", "考卷題目標題庫") + ` (${selectedExam.length})`}
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
          )}
        </Stack>
      </Modal>
    </div>
  );
};

export default QuestionBanksScreen;
