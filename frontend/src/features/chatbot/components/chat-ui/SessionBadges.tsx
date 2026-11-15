import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Checkmark, Warning, InProgress, Document, Csv } from "@carbon/icons-react";
import { Button, Tag, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type { CopilotMessage } from "@copilot";
import { useOptionalArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import {
  TodoStatusIcon,
  summarizeTodos,
  type TodoListItem,
} from "@/shared/ai/TodoList";
import { selectLatestTodoItems } from "@/features/chatbot/adapters/qJudgeCopilotMessageData";

import styles from "./SessionBadges.module.scss";

interface SessionBadgesProps {
  messages: readonly CopilotMessage[];
  /** When true, render without outer wrapper padding (for inline use inside
   *  the composer toolbar). */
  inline?: boolean;
}

type OpenPanel = "todos" | "artifacts" | null;

function selectBadgeTodoItems(
  messages: readonly CopilotMessage[],
): readonly TodoListItem[] {
  return selectLatestTodoItems(messages);
}

export function SessionBadges({ messages, inline = false }: SessionBadgesProps) {
  const { t } = useTranslation("chatbot");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenPanel(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
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
        <div id={panelId} className={styles.popover} role="region" aria-label={t("ui.taskList", "任務列表")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("ui.taskList", "任務列表")}</span>
            <span className={styles.popoverMeta}>
              {summary.done}/{summary.total}
            </span>
          </div>
          <StructuredListWrapper isCondensed className={styles.list} aria-label={t("ui.taskList", "任務列表")}>
            <StructuredListBody>
              {todos.map((todo) => (
                <StructuredListRow key={todo.id}>
                  <StructuredListCell className={styles.statusCell}>
                    <span role="img" aria-label={t(`ui.todoStatus.${todo.status}`, {
                      pending: "待處理", in_progress: "進行中", success: "已完成", fail: "失敗",
                    }[todo.status])}>
                      <TodoStatusIcon status={todo.status} />
                    </span>
                  </StructuredListCell>
                  <StructuredListCell className={styles.labelCell}>{todo.label}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </div>
      )}

      {openPanel === "artifacts" && hasArtifacts && (
        <div id={panelId} className={styles.popover} role="region" aria-label={t("ui.fileList", "檔案列表")}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>{t("ui.fileList", "檔案列表")}</span>
            <span className={styles.popoverMeta}>{artifacts.length}</span>
          </div>
          <StructuredListWrapper isCondensed className={styles.list} aria-label={t("ui.fileList", "檔案列表")}>
            <StructuredListBody>
              {artifacts.map((artifact) => (
                <StructuredListRow key={artifact.artifact_id}>
                  <StructuredListCell className={styles.fileCell}>
                    <Button
                      kind="ghost"
                      className={styles.fileButton}
                      onClick={() => handleArtifactCardClick(artifact.artifact_id)}
                      aria-current={artifactCtx?.isOpen && artifactCtx.activeArtifactId === artifact.artifact_id ? "true" : undefined}
                    >
                      {artifact.filename.toLowerCase().endsWith(".csv") || artifact.content_type === "text/csv"
                        ? <Csv size={16} aria-hidden />
                        : <Document size={16} aria-hidden /> }
                      <span className={styles.fileDetails}>
                        <span className={styles.filename}>{artifact.filename}</span>
                      </span>
                    </Button>
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </div>
      )}

      <div className={styles.badgeRow}>
        {hasTodos && (
          <Button
            kind="ghost"
            size="lg"
            aria-expanded={openPanel === "todos"}
            aria-controls={openPanel === "todos" ? panelId : undefined}
            className={`${styles.badge} ${openPanel === "todos" ? styles.badgeActive : ""}`}
            onClick={(event) => { triggerRef.current = event.currentTarget; toggle("todos"); }}
          >
            {summaryIcon}
            <span className={styles.badgeLabel}>{t("ui.taskList", "任務列表")}</span>
            <Tag size="sm" type={summary.failed > 0 ? "red" : "cool-gray"}>
              {summary.done}/{summary.total}
            </Tag>
          </Button>
        )}

        {hasArtifacts && (
          <Button
            kind="ghost"
            size="lg"
            aria-expanded={openPanel === "artifacts"}
            aria-controls={openPanel === "artifacts" ? panelId : undefined}
            className={`${styles.badge} ${openPanel === "artifacts" ? styles.badgeActive : ""}`}
            onClick={(event) => { triggerRef.current = event.currentTarget; toggle("artifacts"); }}
          >
            <Document size={14} />
            <span className={styles.badgeLabel}>{t("ui.fileList", "檔案列表")}</span>
            <Tag size="sm" type="blue">
              {artifacts.length}
            </Tag>
          </Button>
        )}
      </div>
    </div>
  );
}
