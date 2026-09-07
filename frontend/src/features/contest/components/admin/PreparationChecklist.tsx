import { Button, Tag } from "@carbon/react";
import {
  CheckmarkFilled,
  WarningAltFilled,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  PreparationChecklistItem,
  PreparationItemKey,
  PreparationItemLevel,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./PreparationChecklist.module.scss";

interface PreparationChecklistProps {
  items: PreparationChecklistItem[];
  onItemAction: (key: PreparationItemKey) => void;
}

const LEVEL_ICON = {
  done: CheckmarkFilled,
  warning: WarningAltFilled,
  blocking: WarningFilled,
} as const;

const LEVEL_TAG_TYPE = {
  done: "green",
  warning: "warm-gray",
  blocking: "red",
} as const;

export default function PreparationChecklist({
  items,
  onItemAction,
}: PreparationChecklistProps) {
  const { t } = useTranslation("contest");

  const levelLabel = (level: PreparationItemLevel) => {
    if (level === "done") {
      return t("adminOverview.preparation.level.done", "已完成");
    }
    if (level === "blocking") {
      return t("adminOverview.preparation.level.blocking", "發布前必填");
    }
    return t("adminOverview.preparation.level.warning", "建議設定");
  };

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const Icon = LEVEL_ICON[item.level];
        return (
          <li key={item.key} className={styles.row} data-level={item.level}>
            <Icon size={18} className={`${styles.icon} ${styles[item.level]}`} />
            <div className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.description}>{item.description}</span>
            </div>
            <Tag className={styles.tag} size="sm" type={LEVEL_TAG_TYPE[item.level]}>
              {levelLabel(item.level)}
            </Tag>
            <Button
              className={styles.action}
              kind="tertiary"
              size="sm"
              onClick={() => onItemAction(item.key)}
            >
              {item.actionLabel}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
