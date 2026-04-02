import { type FC, memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ExamItem } from "../../types/exam.types";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
} from "@/shared/ui/list/ListPanel";
import styles from "./ExamNavigator.module.scss";

interface ExamNavigatorProps {
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
  markedIds?: Set<string>;
  onSelect: (index: number) => void;
}

export const ExamNavigator: FC<ExamNavigatorProps> = memo(({
  items,
  activeIndex,
  answeredIds,
  markedIds,
  onSelect,
}) => {
  const { t } = useTranslation("contest");
  const answeredCount = items.filter((item) => {
    const id = item.kind === "coding" ? item.data.id : item.data.id;
    return answeredIds.has(id);
  }).length;
  const markedCount = markedIds?.size ?? 0;

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <nav className={styles.navigator}>
      <ListPanel
        header={<ListHeader title={t("answering.navigation.questionList")} />}
        footer={
          <ListFooter>
            <span className={styles.summaryText}>
              {t("answering.navigation.answeredProgress", { answered: answeredCount, total: items.length })}
            </span>
            {markedCount > 0 && (
              <span className={styles.summaryMarked}>
                {t("answering.navigation.markedCount", { count: markedCount })}
              </span>
            )}
          </ListFooter>
        }
      >
        {items.map((item, index) => {
          const id = item.kind === "coding" ? item.data.id : item.data.id;
          const isActive = index === activeIndex;
          const isAnswered = answeredIds.has(id);
          const isMarked = markedIds?.has(id) ?? false;

          const typeLabel =
            item.kind === "coding"
              ? t("answering.questionTypes.coding")
              : t(`answering.questionTypes.${item.data.questionType}`);

          const title =
            item.kind === "coding"
              ? `${item.data.label}. ${item.data.title}`
              : item.data.prompt.slice(0, 30) + (item.data.prompt.length > 30 ? "…" : "");

          return (
            <ListItem
              key={id}
              active={isActive}
              onClick={() => onSelect(index)}
              className={isMarked ? styles.itemMarked : undefined}
            >
              <ListItemLeading>
                <span
                  ref={(el) => {
                    // Attach ref to parent button via leading span for scroll-into-view
                    if (el?.parentElement?.parentElement) {
                      itemRefs.current.set(index, el.parentElement.parentElement as HTMLButtonElement);
                    } else {
                      itemRefs.current.delete(index);
                    }
                  }}
                  className={`${styles.itemNumber} ${isAnswered ? styles.itemNumberAnswered : ""}`}
                >
                  {index + 1}
                </span>
              </ListItemLeading>
              <ListItemContent>
                <ListItemMeta>{typeLabel}</ListItemMeta>
                <ListItemTitle>{title}</ListItemTitle>
              </ListItemContent>
            </ListItem>
          );
        })}
      </ListPanel>
    </nav>
  );
});

ExamNavigator.displayName = "ExamNavigator";

export default ExamNavigator;
