import { Button, Dropdown } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { ModelSelect } from "@/features/chatbot/components/chat-ui/ModelSelect";
import { TodoList } from "@/features/chatbot/components/chat-ui/TodoList";
import { InitPromptEditor } from "./InitPromptEditor";
import { ProgressCard, SecondaryProgressBar } from "./ProgressCard";
import { ArtifactFileIcon } from "./artifactIcon";
import type {
  ArtifactRecord,
  ModelInfo,
  RunTodoItem,
  TaskShellAction,
  TaskShellInitPrompt,
  TaskShellSelectBlock,
  TaskShellProgress,
  TaskShellSecondaryProgress,
  TaskShellSessionOption,
  TaskStatus,
} from "./types";
import styles from "./TaskDetailPanel.module.scss";

interface TaskDetailPanelProps {
  taskTypeLabel: string;
  title: string;
  subtitle?: string;
  status: TaskStatus;
  running: boolean;
  progress?: TaskShellProgress;
  secondaryProgress?: TaskShellSecondaryProgress;

  models: ModelInfo[];
  selectedModelId: string;
  onModelChange(modelId: string): void;
  selectBlock?: TaskShellSelectBlock;

  todoItems?: RunTodoItem[];
  artifacts?: ArtifactRecord[];
  onOpenArtifact?(artifactId: string): void;
  activeArtifactId?: string | null;

  primaryAction: TaskShellAction;
  errorText?: string | null;

  initPrompt: TaskShellInitPrompt;
  showInitPrompt?: boolean;
  sessionId: string | null;
  showSessionBinding?: boolean;
  bindableSessions: TaskShellSessionOption[];
  pendingBindSessionId: string;
  onBindSessionChange(id: string): void;
  onBind(): void;
  onUnbind(): void;
}

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const { t } = useTranslation("contest");
  const {
    status,
    running,
    progress,
    secondaryProgress,
    models,
    selectedModelId,
    onModelChange,
    selectBlock,
    todoItems,
    artifacts,
    onOpenArtifact,
    activeArtifactId,
    primaryAction,
    errorText,
    initPrompt,
    showInitPrompt = true,
    sessionId,
    showSessionBinding = true,
    bindableSessions,
    pendingBindSessionId,
    onBindSessionChange,
    onBind,
    onUnbind,
  } = props;

  const selectedBlockItem =
    selectBlock?.options.find((item) => item.id === selectBlock.selectedId) ?? null;

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t("grading.taskTypeLabel", "AI 批改")}</h2>
        <Button
          kind={primaryAction.kind === "secondary" ? "secondary" : "primary"}
          size="md"
          renderIcon={primaryAction.renderIcon}
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
      </header>
      {errorText ? <div className={styles.headerError}>{errorText}</div> : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>{t("aiTaskShell.modelLabel", "批改模型")}</span>
        </div>
        <ModelSelect
          models={models}
          selectedModelId={selectedModelId}
          onChange={onModelChange}
          disabled={running}
          menuPlacement="bottom"
        />
      </div>

      {showInitPrompt ? (
        <div className={styles.section}>
          <InitPromptEditor prompt={initPrompt} />
        </div>
      ) : null}

      {showSessionBinding ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>
              {t("aiTaskShell.sessionLabel", "Session")}
            </span>
            {sessionId ? (
              <span className={styles.sectionMeta}>{sessionId.slice(0, 8)}</span>
            ) : null}
          </div>
          <Dropdown
            id="ai-task-session-bind"
            titleText=""
            hideLabel
            label={t("aiTaskShell.sessionPlaceholder", "選擇既有 session")}
            size="sm"
            items={bindableSessions}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={
              bindableSessions.find((item) => item.id === pendingBindSessionId) ?? null
            }
            disabled={running || bindableSessions.length === 0}
            onChange={({ selectedItem }) => {
              if (selectedItem) onBindSessionChange(selectedItem.id);
            }}
          />
          <div className={styles.actionRow}>
            {sessionId ? (
              <Button kind="ghost" size="sm" disabled={running} onClick={onUnbind}>
                {t("aiTaskShell.unbindSession", "解除綁定")}
              </Button>
            ) : (
              <Button
                kind="tertiary"
                size="sm"
                disabled={running || !pendingBindSessionId}
                onClick={onBind}
              >
                {t("aiTaskShell.bindSession", "綁定 session")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>
            {t("aiTaskShell.artifactsLabel", "Artifacts")}
          </span>
          <span className={styles.sectionMeta}>{artifacts?.length ?? 0}</span>
        </div>
        {artifacts && artifacts.length > 0 ? (
          <ul className={styles.artifactList}>
            {artifacts.map((artifact) => {
              const isActive = artifact.id === activeArtifactId;
              return (
                <li key={artifact.id}>
                  <button
                    type="button"
                    className={`${styles.artifactItem} ${isActive ? styles.artifactItemActive : ""}`}
                    onClick={() => onOpenArtifact?.(artifact.id)}
                    aria-pressed={isActive}
                  >
                    <span className={styles.artifactIdentity}>
                      <ArtifactFileIcon
                        filename={artifact.filename}
                        size={18}
                        className={styles.artifactIcon}
                      />
                      <span className={styles.artifactName}>{artifact.filename}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.artifactEmpty}>
            {t("aiTaskShell.artifactsEmpty", "目前沒有產生 artifact")}
          </div>
        )}
      </div>

      {selectBlock ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>{selectBlock.label}</span>
          </div>
          <Dropdown
            id="ai-task-select-block"
            titleText=""
            hideLabel
            label={selectBlock.placeholder}
            size="sm"
            items={selectBlock.options}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={selectedBlockItem}
            onChange={({ selectedItem }) => {
              if (selectedItem) selectBlock.onChange(selectedItem.id);
            }}
          />
        </div>
      ) : null}

      {progress ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>
              {t("aiTaskShell.progressLabel", "批改進度")}
            </span>
          </div>
          <ProgressCard status={status} progress={progress} running={running} />
        </div>
      ) : null}

      {secondaryProgress ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>{secondaryProgress.label}</span>
          </div>
          <SecondaryProgressBar
            completed={secondaryProgress.completed}
            total={secondaryProgress.total}
          />
        </div>
      ) : null}

      {todoItems && todoItems.length > 0 ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>
              {t("aiTaskShell.todoLabel", "任務表")}
            </span>
          </div>
          <TodoList items={todoItems} />
        </div>
      ) : null}
    </aside>
  );
}
