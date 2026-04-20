import { useMemo, useState } from "react";
import { Checkmark, Warning, InProgress, Document } from "@carbon/icons-react";
import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { ChatMessage, RunTodoItem } from "@/core/types/chatbot.types";
import { useOptionalArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { ArtifactInlineCard } from "../artifact/ArtifactInlineCard";

import styles from "./SessionBadges.module.scss";

interface SessionBadgesProps {
  messages: ChatMessage[];
  /** When true, render without outer wrapper padding (for inline use inside
   *  the composer toolbar). */
  inline?: boolean;
}

function pickLatestTodos(messages: ChatMessage[]): RunTodoItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const todos = messages[i]?.todoItems;
    if (todos && todos.length > 0) return todos;
  }
  return [];
}

function summarizeTodos(todos: RunTodoItem[]) {
  let done = 0;
  let inProgress = 0;
  let failed = 0;
  for (const item of todos) {
    if (item.status === "success") done += 1;
    else if (item.status === "fail") failed += 1;
    else if (item.status === "in_progress") inProgress += 1;
  }
  return { total: todos.length, done, inProgress, failed };
}

function todoIcon(status: RunTodoItem["status"]) {
  if (status === "success") return <Checkmark size={14} className={styles.iconSuccess} />;
  if (status === "fail") return <Warning size={14} className={styles.iconFail} />;
  if (status === "in_progress") return <InProgress size={14} className={styles.iconProgress} />;
  return <InProgress size={14} className={styles.iconPending} />;
}

type OpenPanel = "todos" | "artifacts" | null;

/** Aggregate whether the current session has any todos / artifacts to show.
 *  Exposed so the composer can decide whether to force-expand. */
export function useSessionBadgeSummary(messages: ChatMessage[]): {
  hasTodos: boolean;
  hasArtifacts: boolean;
  hasAny: boolean;
} {
  const artifactCtx = useOptionalArtifactPanel();
  const todos = useMemo(() => pickLatestTodos(messages), [messages]);
  const hasTodos = todos.length > 0;
  const hasArtifacts = (artifactCtx?.artifacts.length ?? 0) > 0;
  return { hasTodos, hasArtifacts, hasAny: hasTodos || hasArtifacts };
}

export function SessionBadges({ messages, inline = false }: SessionBadgesProps) {
  const { t } = useTranslation("chatbot");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

  const artifactCtx = useOptionalArtifactPanel();
  const artifacts = artifactCtx?.artifacts ?? [];
  const todos = useMemo(() => pickLatestTodos(messages), [messages]);
  const summary = useMemo(() => summarizeTodos(todos), [todos]);

  const hasTodos = todos.length > 0;
  const hasArtifacts = artifacts.length > 0;
  if (!hasTodos && !hasArtifacts) return null;

  const toggle = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  const handleArtifactCardClick = (artifactId: string) => {
    artifactCtx?.open(artifactId);
  };

  const summaryIcon =
    summary.inProgress > 0 ? (
      <InProgress size={14} className={styles.iconProgress} />
    ) : summary.failed > 0 ? (
      <Warning size={14} className={styles.iconFail} />
    ) : (
      <Checkmark size={14} className={styles.iconSuccess} />
    );

  return (
    <div className={`${styles.wrapper} ${inline ? styles.wrapperInline : ""}`}>
      {openPanel === "todos" && hasTodos && (
        <div className={styles.popover} role="dialog" aria-label={t("ui.todoList", "待辦清單")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("ui.todoList", "待辦清單")}</span>
            <span className={styles.popoverMeta}>
              {summary.done}/{summary.total}
            </span>
          </div>
          <ul className={styles.todoList}>
            {todos.map((item) => (
              <li key={item.id} className={styles.todoItem}>
                {todoIcon(item.status)}
                <span className={styles.todoLabel}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openPanel === "artifacts" && hasArtifacts && (
        <div className={styles.popover} role="dialog" aria-label={t("artifact.panelTitle", "輸出產物")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("artifact.panelTitle", "輸出產物")}</span>
            <span className={styles.popoverMeta}>{artifacts.length}</span>
          </div>
          <div className={styles.artifactList}>
            {artifacts.map((artifact) => (
              <ArtifactInlineCard
                key={artifact.id}
                artifact={artifact}
                onClick={handleArtifactCardClick}
                isActive={
                  artifactCtx?.isOpen && artifactCtx?.activeArtifactId === artifact.id
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.badgeRow}>
        {hasTodos && (
          <button
            type="button"
            className={`${styles.badge} ${openPanel === "todos" ? styles.badgeActive : ""}`}
            onClick={() => toggle("todos")}
          >
            {summaryIcon}
            <span className={styles.badgeLabel}>{t("ui.todoList", "待辦清單")}</span>
            <Tag size="sm" type={summary.failed > 0 ? "red" : "cool-gray"}>
              {summary.done}/{summary.total}
            </Tag>
          </button>
        )}

        {hasArtifacts && (
          <button
            type="button"
            className={`${styles.badge} ${openPanel === "artifacts" ? styles.badgeActive : ""}`}
            onClick={() => toggle("artifacts")}
          >
            <Document size={14} />
            <span className={styles.badgeLabel}>{t("artifact.panelTitle", "輸出產物")}</span>
            <Tag size="sm" type="blue">
              {artifacts.length}
            </Tag>
          </button>
        )}
      </div>
    </div>
  );
}
