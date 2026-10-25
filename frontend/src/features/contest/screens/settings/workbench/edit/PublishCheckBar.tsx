import { Button } from "@carbon/react";
import { ArrowLeft, ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamPublishIssueItem } from "@/features/contest/domain/examPublishIssues";
import styles from "./WorkbenchEdit.module.scss";
export interface PublishCheckBarProps {
  items: ExamPublishIssueItem[];
  current: ExamPublishIssueItem;
  index: number;
  resolved: boolean;
  onGo(item: ExamPublishIssueItem): void;
  onOpenAll(): void;
  onExit(): void;
}
export function PublishCheckBar({
  items,
  current,
  index,
  resolved,
  onGo,
  onOpenAll,
  onExit,
}: PublishCheckBarProps) {
  const { t } = useTranslation("contest");
  if (!items.length) return null;
  const previous = items[index - 1];
  const next = items[resolved ? index : index + 1];
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
        {resolved
          ? t("workbench.edit.issueFixed", "已修好，還有 {{count}} 項", {
              count: items.length,
            })
          : `${index + 1}/${items.length}`}
      </span>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={ArrowLeft}
        disabled={!previous}
        onClick={() => {
          if (previous) onGo(previous);
        }}
      >
        {t("workbench.edit.previousIssue", "上一項")}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={ArrowRight}
        disabled={!next}
        onClick={() => {
          if (next) onGo(next);
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
