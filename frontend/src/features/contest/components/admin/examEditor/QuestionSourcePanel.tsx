import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Dropdown,
  ExpandableSearch,
  InlineLoading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tile,
  Tag,
} from "@carbon/react";
import { Draggable } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import { listMine, listQuestions } from "@/infrastructure/api/repositories/questionBank.repository";
import {
  getQuestionDisplayTitle,
  resolveExamQuestionType,
} from "@/features/question-banks/screens/questionBankProblemManagement.utils";
import {
  EXAM_QUESTION_TYPE_ICON,
  EXAM_QUESTION_TYPE_TAG_COLOR,
} from "@/shared/ui/examQuestionTypeVisual";
import {
  QUESTION_SOURCE_DRAG_MIME,
  type QuestionSourceBankQuestion,
  type QuestionSourceDragItem,
} from "./questionSource.types";
import styles from "./QuestionSourcePanel.module.scss";

const QUESTION_TYPE_ORDER: ExamQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
];

interface QuestionSourcePanelProps {
  mode: "paper" | "coding";
  className?: string;
  onDragStart?: (item: QuestionSourceDragItem) => void;
  onDragEnd?: () => void;
  onAddType?: (questionType: ExamQuestionType) => void;
  onAddBankQuestion?: (item: QuestionSourceBankQuestion) => void;
}

const QuestionSourcePanel = ({
  mode,
  className,
  onDragStart,
  onDragEnd,
  onAddType,
  onAddBankQuestion,
}: QuestionSourcePanelProps) => {
  const { t } = useTranslation("contest");
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankCategory = mode === "paper" ? "exam" : "coding";

  const handleDragStart = useCallback(
    (event: DragEvent, item: QuestionSourceDragItem) => {
      onDragStart?.(item);
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(QUESTION_SOURCE_DRAG_MIME, JSON.stringify(item));
    },
    [onDragStart]
  );

  const handleDragEnd = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    setError(null);
    try {
      const mine = await listMine();
      const filtered = mine.filter((bank) => bank.category === bankCategory);
      setBanks(filtered);
      if (filtered.length > 0) {
        setSelectedBankId((prev) => prev || filtered[0].id);
      } else {
        setSelectedBankId("");
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : t("examEditor.sourceLoadFailed", "載入題庫來源失敗")
      );
    } finally {
      setLoadingBanks(false);
    }
  }, [bankCategory, t]);

  const loadBankQuestions = useCallback(
    async (bankId: string) => {
      if (!bankId) {
        setQuestions([]);
        return;
      }
      setLoadingQuestions(true);
      setError(null);
      try {
        const rows = await listQuestions(bankId);
        setQuestions(rows.filter((item) => item.questionType === bankCategory));
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : t("examEditor.sourceLoadFailed", "載入題庫來源失敗")
        );
      } finally {
        setLoadingQuestions(false);
      }
    },
    [bankCategory, t]
  );

  useEffect(() => {
    void loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    if (!selectedBankId) return;
    void loadBankQuestions(selectedBankId);
  }, [loadBankQuestions, selectedBankId]);

  const filteredQuestions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return questions;
    return questions.filter((item) => {
      const title = getQuestionDisplayTitle(item).toLowerCase();
      const prompt = (item.prompt || "").toLowerCase();
      return title.includes(normalizedKeyword) || prompt.includes(normalizedKeyword);
    });
  }, [keyword, questions]);

  const bankContent = (
    <div className={styles.section}>
      <div className={styles.controlRow}>
        <Dropdown
          id={`question-source-bank-${mode}`}
          titleText={t("examEditor.sourceBankLabel", "題庫")}
          label={t("examEditor.sourceSelectBank", "選擇題庫")}
          size="sm"
          items={banks}
          itemToString={(item) => (item ? item.name : "")}
          selectedItem={banks.find((bank) => bank.id === selectedBankId) ?? null}
          onChange={(selection) => setSelectedBankId(selection.selectedItem?.id || "")}
          disabled={loadingBanks || banks.length === 0}
        />
      </div>

      <div className={styles.controlRow}>
        <ExpandableSearch
          id={`question-source-search-${mode}`}
          size="md"
          labelText={t("examEditor.sourceSearch", "搜尋題目")}
          placeholder={t("examEditor.sourceSearchPlaceholder", "搜尋題目")}
          value={keyword}
          onChange={(event) => setKeyword((event.target as HTMLInputElement).value || "")}
        />
      </div>

      <div className={styles.listArea}>
        {loadingQuestions ? (
          <InlineLoading description={t("common.saving", "載入中...")} />
        ) : filteredQuestions.length === 0 ? (
          <p className={styles.emptyText}>
            {t("examEditor.sourceNoQuestions", "目前沒有可拖入的題目")}
          </p>
        ) : (
          filteredQuestions.map((question) => {
            const title = getQuestionDisplayTitle(question);
            const handleClick = () => {
              onAddBankQuestion?.({
                questionBankId: question.bankId,
                questionId: question.bankItemId,
                title,
              });
            };
            const sourceItem: QuestionSourceDragItem = {
              kind: "bank_question",
              category: bankCategory,
              questionBankId: question.bankId,
              questionId: question.bankItemId,
              title,
            };
            return (
              <Tile
                key={question.bankItemId}
                className={styles.sourceItem}
                draggable
                onDragStart={(event) => handleDragStart(event, sourceItem)}
                onDragEnd={handleDragEnd}
                onClick={handleClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleClick();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className={styles.sourceItemMain}>
                  <div className={styles.sourceItemTitle} title={title}>
                    {title}
                  </div>
                  {question.questionType === "exam" ? (
                    <Tag
                      size="sm"
                      type={EXAM_QUESTION_TYPE_TAG_COLOR[resolveExamQuestionType(question)] as never}
                    >
                      {t(
                        `common:questionType.label.${resolveExamQuestionType(question)}`,
                        resolveExamQuestionType(question)
                      )}
                    </Tag>
                  ) : (
                    <Tag size="sm" type="cool-gray">
                      {t("common:questionType.label.coding", "程式題")}
                    </Tag>
                  )}
                </div>
                <div className={styles.sourceItemActions}>
                  <Draggable size={14} />
                </div>
              </Tile>
            );
          })
        )}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className={[styles.root, className].filter(Boolean).join(" ")}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  if (mode === "coding") {
    return <div className={[styles.root, className].filter(Boolean).join(" ")}>{bankContent}</div>;
  }

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      <Tabs selectedIndex={activeTabIndex} onChange={({ selectedIndex }) => setActiveTabIndex(selectedIndex)}>
        <TabList aria-label={t("examEditor.sourceTabs", "題目來源分頁")} contained>
          <Tab>{t("examEditor.sourceTabTypes", "題型")}</Tab>
          <Tab>{t("examEditor.sourceTabBank", "題庫")}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className={styles.section}>
              <div className={styles.listArea}>
                {QUESTION_TYPE_ORDER.map((type) => {
                  const Icon = EXAM_QUESTION_TYPE_ICON[type];
                  const handleClick = () => {
                    onAddType?.(type);
                  };
                  const item: QuestionSourceDragItem = {
                    kind: "exam_type",
                    questionType: type,
                  };
                  return (
                    <Tile
                      key={type}
                      className={styles.typeItem}
                      draggable
                      onDragStart={(event) => handleDragStart(event, item)}
                      onDragEnd={handleDragEnd}
                      onClick={handleClick}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleClick();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.typeItemMain}>
                        <span className={styles.typeIcon}>
                          <Icon size={18} />
                        </span>
                        <div className={styles.typeInfo}>
                          <div className={styles.sourceItemTitle}>
                            {t(`common:questionType.label.${type}`, type)}
                          </div>
                          <div className={styles.typeDesc}>
                            {t(`common:questionType.description.${type}`, "")}
                          </div>
                        </div>
                      </div>
                      <div className={styles.sourceItemActions}>
                        <Draggable size={14} />
                      </div>
                    </Tile>
                  );
                })}
              </div>
            </div>
          </TabPanel>
          <TabPanel>{bankContent}</TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
};

export default QuestionSourcePanel;
