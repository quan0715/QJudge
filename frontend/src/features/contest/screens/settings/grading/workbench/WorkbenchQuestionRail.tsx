import { Button, Dropdown, ProgressBar } from "@carbon/react";
import { MachineLearningModel, WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { TodoList, type TodoListItem } from "@/shared/ai/TodoList";
import styles from "./GradingWorkbench.module.scss";

export interface RailUnit {
  id: string;
  label: string;
  progress: string;
  aiStatus?: "running" | "queued" | "failed";
  /** Fully graded students / total students, based on persisted answer scores. */
  aiProgress?: string;
  activity?: { progress: number; label: string };
}

interface WorkbenchQuestionRailProps {
  units: RailUnit[];
  activeId: string;
  disabled: boolean;
  examAi: {
    state: "idle" | "running";
    progressText: string;
    canStart: boolean;
    completedUnits?: number;
    totalUnits?: number;
    disabledReason?: string;
    /** The AI's current task list. */
    todos?: readonly TodoListItem[];
  };
  onSelect(unitId: string): void;
  onStartExam(): void;
  onStopExam(): void;
}

export function WorkbenchQuestionRail({
  units,
  activeId,
  disabled,
  examAi,
  onSelect,
  onStartExam,
  onStopExam,
}: WorkbenchQuestionRailProps) {
  const { t } = useTranslation("contest");
  const statusText = {
    running: t("workbench.aiRunning", "AI 批改中"),
    queued: t("workbench.aiQueued", "AI 排隊中"),
    failed: t("workbench.aiFailed", "AI 失敗"),
  };
  const right = (unit: RailUnit) => {
    if (!unit.aiStatus) return unit.progress;
    const text = statusText[unit.aiStatus];
    return unit.aiStatus === "running" && unit.aiProgress ? `${text} · ${t("workbench.persisted", "已寫入")} ${unit.aiProgress}` : text;
  };
  return (
    <aside className={styles.rail} aria-label={t("workbench.questions", "題目")}>
      <div className={styles.railHeader}>
        <h2>{t("workbench.title", "批改")}</h2>
        {examAi.state === "idle" ? (
          <Button
            kind="tertiary"
            size="md"
            renderIcon={MachineLearningModel}
            disabled={!examAi.canStart}
            title={examAi.disabledReason}
            onClick={onStartExam}
          >
            {t("workbench.examAi", "AI 批改整份考卷")}
          </Button>
        ) : (
          <div className={styles.railRunning}>
            <div className={styles.railRunningLine}>
              <span>
                {t("workbench.aiRunning", "AI 批改中")}
                {examAi.progressText ? `\u3000${examAi.progressText}` : ""}
              </span>
              <Button kind="ghost" size="sm" onClick={onStopExam}>
                {t("workbench.stop", "停止")}
              </Button>
            </div>
            {examAi.todos && examAi.todos.length > 0 && <TodoList items={examAi.todos} className={styles.railTodos} />}
          </div>
        )}
      </div>
      <nav className={styles.railList} aria-label={t("workbench.questions", "題目")}>
        {units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            className={unit.id === activeId ? styles.railItemActive : styles.railItem}
            aria-current={unit.id === activeId ? "page" : undefined}
            disabled={disabled}
            onClick={() => onSelect(unit.id)}
          >
            <span className={styles.railLabel}>{unit.label}</span>
            {unit.aiStatus === "running" || unit.aiStatus === "queued" || unit.activity?.progress === 100 ? (
              <span
                className={styles.railRing}
                role="progressbar"
                aria-label={`${unit.label}草稿完成進度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={unit.activity?.progress ?? 0}
                aria-valuetext={unit.activity?.label ?? (unit.aiStatus ? statusText[unit.aiStatus] : "已完成寫分")}
                title={`${unit.activity?.label ?? (unit.aiStatus ? statusText[unit.aiStatus] : "已完成寫分")} · 已寫入 ${unit.aiProgress ?? unit.progress}`}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <circle className={styles.railRingTrack} cx="16" cy="16" r="12" />
                  <circle className={styles.railRingValue} cx="16" cy="16" r="12" pathLength="100"
                    strokeDasharray="100" strokeDashoffset={100 - (unit.activity?.progress ?? 0)} />
                </svg>
              </span>
            ) : unit.aiStatus === "failed" ? (
              <WarningAlt size={20} className={styles.railStatus_failed} aria-label={statusText.failed} />
            ) : <span className={styles.railProgress}>{unit.progress}</span>}
          </button>
        ))}
      </nav>
      {(examAi.state === "running" || (examAi.totalUnits ?? 0) > 0) && (
        <div className={styles.railFooter} aria-live="polite">
          <ProgressBar
            label={t("workbench.persistedUnits", "已完成寫分")}
            helperText={examAi.progressText}
            value={examAi.totalUnits ? examAi.completedUnits ?? 0 : undefined}
            max={examAi.totalUnits || 1}
            status={examAi.totalUnits && (examAi.completedUnits ?? 0) >= examAi.totalUnits ? "finished" : "active"}
            size="small"
          />
        </div>
      )}
      <div className={styles.railDropdown}>
        <Dropdown<RailUnit>
          id="workbench-question-select"
          titleText={t("workbench.questions", "題目")}
          hideLabel
          label={t("workbench.questions", "題目")}
          items={units}
          itemToString={(unit) => (unit ? `${unit.label}\u3000${right(unit)}` : "")}
          selectedItem={units.find((unit) => unit.id === activeId)}
          disabled={disabled}
          onChange={({ selectedItem }) => selectedItem && onSelect(selectedItem.id)}
        />
      </div>
    </aside>
  );
}
