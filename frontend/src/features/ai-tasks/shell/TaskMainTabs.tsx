import { Close } from "@carbon/icons-react";
import type { TaskShellMainTab } from "./types";
import styles from "./TaskMainTabs.module.scss";

interface TaskMainTabsProps {
  tabs: TaskShellMainTab[];
  activeTabId: string;
  onSelect(id: string): void;
  onClose?(id: string): void;
}

export function TaskMainTabs({ tabs, activeTabId, onSelect, onClose }: TaskMainTabsProps) {
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className={styles.wrap}>
      <div className={styles.tabBar} role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => onSelect(tab.id)}
            >
              {tab.icon ? <span className={styles.tabIcon}>{tab.icon}</span> : null}
              <span className={styles.tabTitle}>{tab.title}</span>
              {tab.closable ? (
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.tabClose}
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose?.(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onClose?.(tab.id);
                  }}
                >
                  <Close size={16} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className={styles.body}>{active ? active.render() : null}</div>
    </div>
  );
}
