import { useEffect, useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { Download, Information } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArtifactPreview } from "@/features/chatbot/components/artifact/ArtifactPreview";
import { fetchArtifactDownloadUrl } from "@/infrastructure/api/repositories/artifact.repository";
import { useMediaQuery } from "@/shared/hooks";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskMainTabs } from "./TaskMainTabs";
import { ArtifactFileIcon } from "./artifactIcon";
import type {
  ArtifactRecord,
  ModelInfo,
  RunTodoItem,
  TaskShellAction,
  TaskShellInitPrompt,
  TaskShellMainTab,
  TaskShellProgress,
  TaskShellSecondaryProgress,
  TaskShellSelectBlock,
  TaskShellSessionOption,
  TaskStatus,
} from "./types";
import styles from "./AITaskShell.module.scss";

const ARTIFACT_TAB_PREFIX = "__artifact__:";
const MOBILE_DETAIL_TAB_ID = "__task_detail__";

export interface AITaskShellProps {
  taskTypeLabel: string;
  title: string;
  subtitle?: string;

  status: TaskStatus;
  running: boolean;
  progress?: TaskShellProgress;
  secondaryProgress?: TaskShellSecondaryProgress;

  initPrompt: TaskShellInitPrompt;

  models: ModelInfo[];
  selectedModelId: string;
  onModelChange(modelId: string): void;
  selectBlock?: TaskShellSelectBlock;

  todoItems?: RunTodoItem[];
  artifacts?: ArtifactRecord[];
  onOpenArtifact?(artifactId: string): void;

  sessionId: string | null;
  bindableSessions: TaskShellSessionOption[];
  pendingBindSessionId: string;
  onBindSessionChange(id: string): void;
  onBind(): void;
  onUnbind(): void;

  primaryAction: TaskShellAction;
  errorText?: string | null;

  mainTabs: TaskShellMainTab[];
  defaultTabId?: string;
}

/**
 * 通用 AI Task 版面。左欄 (resizable) 是 TaskDetailPanel，右半是註冊的 main tabs。
 * Shell 不擁有任務 state，全部由 caller 傳入（之後 Pass 2 會再抽 TaskDefinition）。
 */
export function AITaskShell(props: AITaskShellProps) {
  const [activeTabId, setActiveTabId] = useState<string>(
    props.defaultTabId ?? props.mainTabs[0]?.id ?? "",
  );
  const [openArtifactIds, setOpenArtifactIds] = useState<string[]>([]);
  const artifactsById = useMemo(
    () => new Map((props.artifacts ?? []).map((artifact) => [artifact.id, artifact])),
    [props.artifacts],
  );

  useEffect(() => {
    setOpenArtifactIds((prev) => prev.filter((artifactId) => artifactsById.has(artifactId)));
  }, [artifactsById]);

  const tabs = useMemo<TaskShellMainTab[]>(() => {
    const artifactTabs = openArtifactIds.flatMap((artifactId) => {
      const artifact = artifactsById.get(artifactId);
      if (!artifact) return [];
      return [
        {
          id: getArtifactTabId(artifact.id),
          title: artifact.filename,
          icon: <ArtifactFileIcon filename={artifact.filename} size={16} />,
          closable: true,
          render: () => <TaskArtifactMain artifact={artifact} />,
        },
      ];
    });
    return [
      ...props.mainTabs,
      ...artifactTabs,
    ];
  }, [artifactsById, openArtifactIds, props.mainTabs]);

  const activeArtifactId = getArtifactIdFromTabId(activeTabId);

  const handleOpenArtifact = (artifactId: string) => {
    setOpenArtifactIds((prev) =>
      prev.includes(artifactId) ? prev : [...prev, artifactId],
    );
    setActiveTabId(getArtifactTabId(artifactId));
    props.onOpenArtifact?.(artifactId);
  };

  const handleCloseTab = (tabId: string) => {
    const artifactId = getArtifactIdFromTabId(tabId);
    if (!artifactId) return;
    const nextOpenArtifactIds = openArtifactIds.filter((id) => id !== artifactId);
    setOpenArtifactIds(nextOpenArtifactIds);

    if (activeTabId !== tabId) return;
    const previousArtifactId = [...nextOpenArtifactIds].reverse().find((id) => id !== artifactId);
    setActiveTabId(
      previousArtifactId
        ? getArtifactTabId(previousArtifactId)
        : props.defaultTabId ?? props.mainTabs[0]?.id ?? "",
    );
  };

  const safeActiveTabId = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : props.defaultTabId ?? props.mainTabs[0]?.id ?? "";

  return (
    <Group orientation="horizontal" className={styles.shell}>
      <Panel id="ai-task-detail" defaultSize={28} minSize="280px" maxSize="520px">
        <TaskDetailPanel
          taskTypeLabel={props.taskTypeLabel}
          title={props.title}
          subtitle={props.subtitle}
          status={props.status}
          running={props.running}
          progress={props.progress}
          secondaryProgress={props.secondaryProgress}
          models={props.models}
          selectedModelId={props.selectedModelId}
          onModelChange={props.onModelChange}
          selectBlock={props.selectBlock}
          todoItems={props.todoItems}
          artifacts={props.artifacts}
          onOpenArtifact={handleOpenArtifact}
          activeArtifactId={activeArtifactId}
          primaryAction={props.primaryAction}
          errorText={props.errorText}
        />
      </Panel>
      <Separator className={styles.resizeHandle} />
      <Panel id="ai-task-main" minSize="360px">
        <TaskMainTabs
          tabs={tabs}
          activeTabId={safeActiveTabId}
          onSelect={setActiveTabId}
          onClose={handleCloseTab}
        />
      </Panel>
    </Group>
  );
}

function getArtifactTabId(artifactId: string): string {
  return `${ARTIFACT_TAB_PREFIX}${artifactId}`;
}

function getArtifactIdFromTabId(tabId: string): string | null {
  return tabId.startsWith(ARTIFACT_TAB_PREFIX)
    ? tabId.slice(ARTIFACT_TAB_PREFIX.length)
    : null;
}

function TaskArtifactMain({ artifact }: { artifact: ArtifactRecord }) {
  const { t } = useTranslation("contest");

  const handleDownload = async () => {
    const { url } = await fetchArtifactDownloadUrl(artifact.id);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.artifactMain}>
      <header className={styles.artifactMainHeader}>
        <h3 className={styles.artifactTitle}>{artifact.filename}</h3>
        <Button kind="ghost" size="md" renderIcon={Download} onClick={handleDownload}>
          {t("aiTaskShell.downloadArtifact", "下載")}
        </Button>
      </header>
      <div className={styles.artifactPreview}>
        <ArtifactPreview artifact={artifact} />
      </div>
    </div>
  );
}

export type { TaskShellMainTab, TaskStatus } from "./types";
