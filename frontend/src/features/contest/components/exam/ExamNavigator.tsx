import type { FC } from "react";
import type { ExamItem } from "../../types/examDemo.types";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./ExamNavigator.module.scss";

const QUESTION_TYPE_SHORT: Record<ExamQuestionType, string> = {
  true_false: "是非",
  single_choice: "單選",
  multiple_choice: "多選",
  short_answer: "簡答",
  essay: "問答",
};

interface ExamNavigatorProps {
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
  onSelect: (index: number) => void;
}

export const ExamNavigator: FC<ExamNavigatorProps> = ({
  items,
  activeIndex,
  answeredIds,
  onSelect,
}) => {
  const answeredCount = items.filter((item) => {
    const id = item.kind === "coding" ? item.data.id : item.data.id;
    return answeredIds.has(id);
  }).length;

  return (
    <nav className={styles.navigator}>
      <div className={styles.title}>題目列表</div>
      <div className={styles.list}>
        {items.map((item, index) => {
          const id = item.kind === "coding" ? item.data.id : item.data.id;
          const isActive = index === activeIndex;
          const isAnswered = answeredIds.has(id);

          const typeLabel =
            item.kind === "coding"
              ? "程式題"
              : QUESTION_TYPE_SHORT[item.data.questionType];

          const title =
            item.kind === "coding"
              ? `${item.data.label}. ${item.data.title}`
              : item.data.prompt.slice(0, 30) + (item.data.prompt.length > 30 ? "…" : "");

          return (
            <button
              key={id}
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
          已作答 {answeredCount} / {items.length}
        </span>
      </div>
    </nav>
  );
};

export default ExamNavigator;
