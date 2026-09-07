import type { KeyboardEvent, RefObject } from "react";
import { ClickableTile, Tag } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  PreparationChecklistItem,
  PreparationItemKey,
  PreparationItemLevel,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./PreparationChecklist.module.scss";

interface PreparationChecklistProps {
  items: PreparationChecklistItem[];
  cardRefs?: Partial<
    Record<PreparationItemKey, RefObject<HTMLAnchorElement | null>>
  >;
  onItemAction: (key: PreparationItemKey) => void;
}

const LEVEL_TAG_TYPE = {
  blocking: "red",
  warning: "warm-gray",
  done: "green",
} as const;

export default function PreparationChecklist({
  items,
  cardRefs,
  onItemAction,
}: PreparationChecklistProps) {
  const { t } = useTranslation("contest");

  const levelLabel = (level: PreparationItemLevel) => {
    if (level === "done") {
      return t("adminOverview.preparation.level.done", "已完成");
    }
    return t("adminOverview.preparation.level.pending", "待完成");
  };

  const handleKeyDown = (
    event: KeyboardEvent<Element>,
    key: PreparationItemKey,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onItemAction(key);
  };

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={item.key} data-level={item.level}>
          <ClickableTile
            ref={cardRefs?.[item.key]}
            className={styles.row}
            role="button"
            aria-label={item.actionLabel}
            onClick={() => onItemAction(item.key)}
            onKeyDown={(event) => handleKeyDown(event, item.key)}
          >
            <span className={styles.number}>{index + 1}</span>
            <div className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.description}>{item.description}</span>
            </div>
            <Tag size="sm" type={LEVEL_TAG_TYPE[item.level]} data-level={item.level}>
              {levelLabel(item.level)}
            </Tag>
            <ArrowRight size={20} aria-hidden="true" />
          </ClickableTile>
        </li>
      ))}
    </ul>
  );
}
