import { type FC, memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ExamItem } from "../../types/exam.types";
import styles from "./ExamNavigator.module.scss";

interface ExamNavigatorProps {
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
  onSelect: (index: number) => void;
}

export const ExamNavigator: FC<ExamNavigatorProps> = memo(({
  items,
  activeIndex,
  answeredIds,
  onSelect,
}) => {
  const { t } = useTranslation("contest");
  const answeredCount = items.filter((item) => {
    const id = item.kind === "coding" ? item.data.id : item.data.id;
    return answeredIds.has(id);
  }).length;

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Auto-scroll the navigator list to keep the active item visible
  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <nav className={styles.navigator}>
      <div className={styles.navHeader}>
        <span>{t("answering.navigation.questionList")}</span>
      </div>

      <div className={styles.list}>
            {items.map((item, index) => {
              const id = item.kind === "coding" ? item.data.id : item.data.id;
              const isActive = index === activeIndex;
              const isAnswered = answeredIds.has(id);

              const typeLabel =
                item.kind === "coding"
                  ? t("answering.questionTypes.coding")
                  : t(`answering.questionTypes.${item.data.questionType}`);

              const fullTitle =
                item.kind === "coding"
                  ? `${item.data.label}. ${item.data.title}`
                  : item.data.prompt;

              const title =
                item.kind === "coding"
                  ? fullTitle
                  : item.data.prompt.slice(0, 30) + (item.data.prompt.length > 30 ? "…" : "");

              return (
                <button
                  key={id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(index, el);
                    else itemRefs.current.delete(index);
                  }}
                  className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                  onClick={() => onSelect(index)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span
                    className={`${styles.itemNumber} ${
                      isAnswered ? styles.itemNumberAnswered : ""
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemType}>{typeLabel}</span>
                    <span className={styles.itemTitle}>{title}</span>
                  </div>
                </button>
              );
            })}
          </div>
      <div className={styles.summary}>
        <span className={styles.summaryText}>
          {t("answering.navigation.answeredProgress", { answered: answeredCount, total: items.length })}
        </span>
      </div>
    </nav>
  );
});

ExamNavigator.displayName = "ExamNavigator";

export default ExamNavigator;
