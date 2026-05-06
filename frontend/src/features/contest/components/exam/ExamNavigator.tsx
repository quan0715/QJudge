import { type ComponentType, type FC, memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ExamItem } from "../../types/exam.types";
import { Home, SidePanelClose, SidePanelOpen } from "@carbon/icons-react";
import {
  ListPanel,
  ListHeader,
  ListFooter,
  ListItem,
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
  collapsed?: boolean;
  overviewLabel?: string;
  overviewIcon?: ComponentType<{ size?: number }>;
  onSelectOverview?: () => void;
  onToggleCollapse?: () => void;
  hideHeader?: boolean;
}

export const ExamNavigator: FC<ExamNavigatorProps> = memo(({
  items,
  activeIndex,
  answeredIds,
  markedIds,
  onSelect,
  collapsed = false,
  overviewLabel,
  overviewIcon: OverviewIcon = Home,
  onSelectOverview,
  onToggleCollapse,
  hideHeader = false,
}) => {
  const { t } = useTranslation("contest");
  const answeredCount = items.filter((item) => {
    const id = item.kind === "coding" ? item.data.id : item.data.id;
    return answeredIds.has(id);
  }).length;
  const markedCount = markedIds?.size ?? 0;

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (collapsed) return;
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex, collapsed]);

  if (collapsed) {
    return (
      <nav className={`${styles.navigator} ${styles.navigatorMini}`}>
        <ListPanel
          className={styles.panel}
          scrollAreaClassName={styles.miniScrollArea}
          footer={
            onToggleCollapse ? (
              <ListFooter className={styles.panelFooter}>
                <button
                  type="button"
                  className={styles.panelToggle}
                  onClick={onToggleCollapse}
                  aria-label={t("answering.navigation.showList")}
                  title={t("answering.navigation.showList")}
                >
                  <SidePanelClose size={20} />
                </button>
              </ListFooter>
            ) : null
          }
        >
          {onSelectOverview && (
            <ListItem
              size="compact"
              onClick={onSelectOverview}
              className={styles.miniOverviewItem}
            >
              <OverviewIcon size={18} />
            </ListItem>
          )}
          {items.map((item, index) => {
            const id = item.kind === "coding" ? item.data.id : item.data.id;
            const isActive = index === activeIndex;
            const isAnswered = answeredIds.has(id);
            const isMarked = markedIds?.has(id) ?? false;
            const itemClassName = [
              styles.miniItem,
              isAnswered ? styles.miniItemAnswered : styles.miniItemUnanswered,
              isMarked ? styles.miniItemMarked : "",
              isActive ? styles.miniItemActive : "",
            ].filter(Boolean).join(" ");

            return (
              <ListItem
                key={id}
                size="compact"
                onClick={() => onSelect(index)}
                className={itemClassName}
              >
                Q{index + 1}
              </ListItem>
            );
          })}
        </ListPanel>
      </nav>
    );
  }

  return (
    <nav className={styles.navigator}>
      <ListPanel
        className={styles.panel}
        header={!hideHeader ? (
          <ListHeader
            title={t("answering.navigation.questionList")}
            className={styles.panelHeader}
            action={
              onToggleCollapse ? (
                <button
                  type="button"
                  className={styles.panelToggle}
                  onClick={onToggleCollapse}
                  aria-label={t("answering.navigation.hideList")}
                  title={t("answering.navigation.hideList")}
                >
                  <SidePanelOpen size={20} />
                </button>
              ) : null
            }
          />
        ) : null}
        footer={
          <ListFooter className={styles.panelFooter}>
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
        {onSelectOverview && (
          <ListItem onClick={onSelectOverview} className={styles.overviewItem}>
            <ListItemContent>
              <ListItemTitle className={styles.overviewTitle}>
                <OverviewIcon size={18} />
                <span>
                  {overviewLabel ??
                    t("contestShell.backToContestHome", "返回競賽主頁")}
                </span>
              </ListItemTitle>
            </ListItemContent>
          </ListItem>
        )}
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
              : item.data.prompt.slice(0, 72) + (item.data.prompt.length > 72 ? "…" : "");
          const itemClassName = [
            styles.item,
            isAnswered ? styles.itemAnswered : styles.itemUnanswered,
            isMarked ? styles.itemMarked : "",
            isActive ? styles.itemActive : "",
          ].filter(Boolean).join(" ");

          return (
            <ListItem
              key={id}
              onClick={() => onSelect(index)}
              className={itemClassName}
            >
              <ListItemContent>
                <ListItemMeta className={styles.itemMeta}>
                  <span
                    ref={(el) => {
                      const button = el?.closest("button");
                      if (button) {
                        itemRefs.current.set(index, button as HTMLButtonElement);
                      } else {
                        itemRefs.current.delete(index);
                      }
                    }}
                  >
                    Q{index + 1}
                  </span>
                  <span className={styles.itemMetaDivider}>·</span>
                  <span>{typeLabel}</span>
                </ListItemMeta>
                <ListItemTitle className={styles.itemPrompt}>{title}</ListItemTitle>
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
