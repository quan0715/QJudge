import { useEffect, useRef } from "react";
import { Button, IconButton, Tag } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ExamPublishIssueItem,
  ExamPublishIssueKind,
} from "@/features/contest/domain/examPublishIssues";
import styles from "./WorkbenchEdit.module.scss";
export interface PublishCheckDrawerProps {
  open: boolean;
  items: ExamPublishIssueItem[];
  describe(item: ExamPublishIssueItem): {
    label: string;
    title: string;
    typeText: string;
  };
  onPick(item: ExamPublishIssueItem): void;
  onClose(): void;
}
export function PublishCheckDrawer({
  open,
  items,
  describe,
  onPick,
  onClose,
}: PublishCheckDrawerProps) {
  const { t } = useTranslation("contest");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const groups: Array<{
    kind: ExamPublishIssueKind;
    name: string;
    description: string;
  }> = [
    {
      kind: "missingAnswer",
      name: t("workbench.edit.missingAnswer", "未設定正確答案"),
      description: t(
        "workbench.edit.missingAnswerHint",
        "選擇題與是非題沒有正確答案，就無法自動批改",
      ),
    },
    {
      kind: "defaultContent",
      name: t("workbench.edit.defaultContent", "仍是預設內容"),
      description: t(
        "workbench.edit.defaultContentHint",
        "新增題目時自動帶入的文字還沒改",
      ),
    },
  ];
  return (
    <aside
      className={styles.publishDrawer}
      aria-label={t("workbench.edit.publishCheck", "發布前檢查")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className={styles.drawerHeader}>
        <h2>{t("workbench.edit.publishCheck", "發布前檢查")}</h2>
        <IconButton
          ref={closeRef}
          align="left"
          kind="ghost"
          size="sm"
          label={t("workbench.edit.closeChecks", "關閉發布前檢查")}
          onClick={onClose}
        >
          <Close size={16} />
        </IconButton>
      </header>
      <div className={styles.drawerBody}>
        {groups.map((group) => {
          const matches = items.filter((item) => item.kind === group.kind);
          if (!matches.length) return null;
          return (
            <section key={group.kind} className={styles.checkGroup}>
              <h3>
                {group.name}
                <Tag type="gray" size="sm">
                  {matches.length}
                </Tag>
              </h3>
              <p>{group.description}</p>
              {matches.map((item) => {
                const description = describe(item);
                return (
                  <Button
                    key={`${item.kind}:${item.questionId}`}
                    kind="ghost"
                    size="lg"
                    className={styles.checkItem}
                    onClick={() => {
                      onPick(item);
                      onClose();
                    }}
                  >
                    <span className={styles.checkItemLabel}>
                      {description.label}
                    </span>
                    <span className={styles.checkItemTitle}>
                      {description.title}
                    </span>
                    <span className={styles.checkItemType}>
                      {description.typeText}
                    </span>
                  </Button>
                );
              })}
            </section>
          );
        })}
        {!items.length && (
          <p>{t("workbench.edit.noIssues", "沒有待處理項目")}</p>
        )}
        <p className={styles.checkHint}>
          {t("workbench.edit.autoResolve", "改好後這一項會自動消失")}
        </p>
      </div>
    </aside>
  );
}
