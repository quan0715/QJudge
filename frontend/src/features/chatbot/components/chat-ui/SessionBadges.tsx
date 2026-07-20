import { useEffect, useMemo, useRef, useState } from "react";
import { Checkmark, Warning, InProgress, Document } from "@carbon/icons-react";
import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { CopilotMessage } from "@copilot";
import { useOptionalArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { ArtifactInlineCard } from "../artifact/ArtifactInlineCard";
import {
  TodoList,
  pickLatestTodos,
  summarizeTodos,
  type TodoListItem,
} from "@/shared/ai/TodoList";
import { selectLatestTodoItems } from "@/features/chatbot/adapters/qJudgeCopilotMessageData";

import styles from "./SessionBadges.module.scss";

type TransitionalTodoMessage = { todoItems?: TodoListItem[] };

interface SessionBadgesProps {
  messages: readonly CopilotMessage[] | readonly TransitionalTodoMessage[];
  /** When true, render without outer wrapper padding (for inline use inside
   *  the composer toolbar). */
  inline?: boolean;
}

type OpenPanel = "todos" | "artifacts" | null;

function hasCopilotParts(
  messages: readonly CopilotMessage[] | readonly TransitionalTodoMessage[],
): messages is readonly CopilotMessage[] {
  return messages.every(
    (message) => "parts" in message && Array.isArray(message.parts),
  );
}

function selectBadgeTodoItems(
  messages: readonly CopilotMessage[] | readonly TransitionalTodoMessage[],
): readonly TodoListItem[] {
  return hasCopilotParts(messages)
    ? selectLatestTodoItems(messages)
    : pickLatestTodos(messages);
}

/** Aggregate whether the current session has any todos / artifacts to show.
 *  Exposed so the composer can decide whether to force-expand. */
export function useSessionBadgeSummary(
  messages: readonly CopilotMessage[] | readonly TransitionalTodoMessage[],
): {
  hasTodos: boolean;
  hasArtifacts: boolean;
  hasAny: boolean;
} {
  const artifactCtx = useOptionalArtifactPanel();
  const todos = useMemo(() => selectBadgeTodoItems(messages), [messages]);
  const hasTodos = todos.length > 0;
  const hasArtifacts = (artifactCtx?.artifacts.length ?? 0) > 0;
  return { hasTodos, hasArtifacts, hasAny: hasTodos || hasArtifacts };
}

export function SessionBadges({ messages, inline = false }: SessionBadgesProps) {
  const { t } = useTranslation("chatbot");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const artifactCtx = useOptionalArtifactPanel();
  const artifacts = artifactCtx?.artifacts ?? [];
  const todos = useMemo(() => selectBadgeTodoItems(messages), [messages]);
  const summary = useMemo(() => summarizeTodos(todos), [todos]);

  // Close the floating popover when clicking outside (e.g. into the textarea
  // or onto the artifact right panel). Without this the popover stays open
  // and visually covers the composer's textarea, making input unclickable.
  useEffect(() => {
    if (!openPanel) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpenPanel(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openPanel]);

  const hasTodos = todos.length > 0;
  const hasArtifacts = artifacts.length > 0;
  if (!hasTodos && !hasArtifacts) return null;

  const toggle = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  const handleArtifactCardClick = (artifactId: string) => {
    artifactCtx?.open(artifactId);
    // Opening the right-side artifact panel is the user's final intent —
    // dismiss the inline popover so the composer textarea is clickable again.
    setOpenPanel(null);
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
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${inline ? styles.wrapperInline : ""}`}
    >
      {openPanel === "todos" && hasTodos && (
        <div className={styles.popover} role="dialog" aria-label={t("ui.taskList", "任務列表")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("ui.taskList", "任務列表")}</span>
            <span className={styles.popoverMeta}>
              {summary.done}/{summary.total}
            </span>
          </div>
          <TodoList items={todos} />
        </div>
      )}

      {openPanel === "artifacts" && hasArtifacts && (
        <div className={styles.popover} role="dialog" aria-label={t("ui.fileList", "檔案列表")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("ui.fileList", "檔案列表")}</span>
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
            <span className={styles.badgeLabel}>{t("ui.taskList", "任務列表")}</span>
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
            <span className={styles.badgeLabel}>{t("ui.fileList", "檔案列表")}</span>
            <Tag size="sm" type="blue">
              {artifacts.length}
            </Tag>
          </button>
        )}
      </div>
    </div>
  );
}
