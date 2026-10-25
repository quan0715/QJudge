import { Button } from "@carbon/react";
import { ArrowLeft, ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
import styles from "./WorkbenchEdit.module.scss";
export interface PublishCheckBarProps {
  items: ExamPublishIssueItem[];
  current: ExamPublishIssueItem;
  onGo(item: ExamPublishIssueItem): void;
  onOpenAll(): void;
  onExit(): void;
}
export function PublishCheckBar({
  items,
  current,
  onGo,
  onOpenAll,
  onExit,
}: PublishCheckBarProps) {
  const { t } = useTranslation("contest");
  if (!items.length) return null;
  const index = items.findIndex(
    (item) =>
      item.questionId === current.questionId && item.kind === current.kind,
  );
  return (
    <nav
      className={styles.publishBar}
      aria-label={t("workbench.edit.checkNavigation", "發布前檢查導覽")}
    >
      <span className={styles.checkCategory}>
        {t("workbench.edit.publishCheck", "發布前檢查")}{" "}
        {current.kind === "missingAnswer"
          ? t("workbench.edit.missingAnswer", "未設定正確答案")
          : t("workbench.edit.defaultContent", "仍是預設內容")}
      </span>
      <span>
        {index + 1}/{items.length}
      </span>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={ArrowLeft}
        disabled={index <= 0}
        onClick={() => {
          const item = items[index - 1];
          if (item) onGo(item);
        }}
      >
        {t("workbench.edit.previousIssue", "上一項")}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={ArrowRight}
        disabled={index < 0 || index >= items.length - 1}
        onClick={() => {
          const item = items[index + 1];
          if (item) onGo(item);
        }}
      >
        {t("workbench.edit.nextIssue", "下一項")}
      </Button>
      <Button kind="ghost" size="sm" onClick={onOpenAll}>
        {t("workbench.edit.allIssues", "全部項目")}
      </Button>
      <Button kind="ghost" size="sm" onClick={onExit}>
        {t("workbench.edit.exitCheck", "結束檢查")}
      </Button>
    </nav>
  );
}
