import { useEffect, useMemo, useState } from "react";
import { Button, Loading, Modal, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/contexts";
import type { BankCategory, QuestionInboxItem } from "@/core/entities/question-bank.entity";
import {
  ingestInbox,
  listInbox,
} from "@/infrastructure/api/repositories/questionBank.repository";
import {
  getQuestionVisualFromInboxItem,
  type QuestionVisualTone,
} from "@/shared/ui/questionVisual";
import styles from "./ImportInboxModal.module.scss";

const TONE_CLASS: Record<QuestionVisualTone, string> = {
  coding: styles.iconToneCoding,
  single_choice: styles.iconToneSingleChoice,
  multiple_choice: styles.iconToneMultipleChoice,
  true_false: styles.iconToneTrueFalse,
  short_answer: styles.iconToneShortAnswer,
  essay: styles.iconToneEssay,
};

interface ImportInboxModalProps {
  open: boolean;
  onClose: () => void;
  bankId: string;
  bankCategory: BankCategory;
  onIngested: () => void;
}

export const ImportInboxModal = ({
  open,
  onClose,
  bankId,
  bankCategory,
  onIngested,
}: ImportInboxModalProps) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [items, setItems] = useState<QuestionInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const summary = await listInbox(bankCategory);
        const rows = bankCategory === "coding" ? summary.coding : summary.exam;
        if (!cancelled) {
          setItems(rows);
          setSelected(new Set());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, [open, bankCategory]);

  const toggleItem = (item: QuestionInboxItem) => {
    const key = `${item.sourceType}-${item.sourceId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSelected = (item: QuestionInboxItem) =>
    selected.has(`${item.sourceType}-${item.sourceId}`);

  const handleSelectAll = () => {
    if (selected.size === items.length && items.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => `${i.sourceType}-${i.sourceId}`)));
    }
  };

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(`${i.sourceType}-${i.sourceId}`)),
    [items, selected],
  );

  const handleIngest = async () => {
    if (selectedItems.length === 0 || ingesting) return;
    try {
      setIngesting(true);
      await ingestInbox({
        targetBankId: bankId,
        items: selectedItems.map((i) => ({
          sourceType: i.sourceType,
          sourceId: i.sourceId,
        })),
      });
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.inbox.ingestSuccess", "已成功收編到題庫"),
      });
      onIngested();
      onClose();
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setIngesting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={t("questionBank.importFromInbox", "匯入草稿")}
      primaryButtonText={
        ingesting
          ? t("questionBank.inbox.ingesting", "收編中...")
          : `${t("questionBank.inbox.moveTo", "收錄到題庫")} (${selected.size})`
      }
      secondaryButtonText={t("common:button.cancel")}
      onRequestClose={onClose}
      onRequestSubmit={() => void handleIngest()}
      primaryButtonDisabled={selected.size === 0 || ingesting}
      size="md"
    >
      {loading ? (
        <Loading withOverlay={false} />
      ) : items.length === 0 ? (
        <p className={styles.emptyText}>
          {t("questionBank.inbox.empty", "目前沒有可收編的題目。")}
        </p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <Button kind="ghost" size="sm" onClick={handleSelectAll}>
              {selected.size === items.length
                ? t("questionBank.inbox.clearSelection", "清除選取")
                : t("questionBank.inbox.selectAll", "全選")}
            </Button>
            <span className={styles.selectedText}>
              {t("questionBank.inbox.selectedCount", "已選 {{count}} 題").replace(
                "{{count}}",
                String(selected.size),
              )}
            </span>
          </div>
          <div className={styles.inboxList}>
            {items.map((item) => {
              const key = `${item.sourceType}-${item.sourceId}`;
              const checked = isSelected(item);
              const { Icon, tone } = getQuestionVisualFromInboxItem(item, "colored");
              const toneClass = TONE_CLASS[tone || "coding"];
              const typeLabel =
                item.sourceType === "problem"
                  ? t("questionType.label.coding", "程式題")
                  : t(`questionType.label.${item.questionType || "exam"}`, item.questionType || "考卷題");

              return (
                <div
                  key={key}
                  className={`${styles.inboxCard} ${checked ? styles.inboxCardSelected : ""}`}
                  onClick={() => toggleItem(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleItem(item);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
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
        </>
      )}
    </Modal>
  );
};
