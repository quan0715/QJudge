import { Button, Dropdown, ProgressBar } from "@carbon/react";
import { MachineLearningModel } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./GradingWorkbench.module.scss";

export interface RailUnit {
  id: string;
  label: string;
  progress: string;
  aiStatus?: "running" | "queued" | "failed";
}

interface WorkbenchQuestionRailProps {
  units: RailUnit[];
  activeId: string;
  disabled: boolean;
  examAi: { state: "idle" | "running"; progressText: string; canStart: boolean; disabledReason?: string };
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
  const right = (unit: RailUnit) => (unit.aiStatus ? statusText[unit.aiStatus] : unit.progress);
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
            <ProgressBar label={t("workbench.aiRunning", "AI 批改中")} hideLabel size="small" />
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
            <span>{unit.label}</span>
            <span className={unit.aiStatus ? styles[`railStatus_${unit.aiStatus}`] : styles.railProgress}>
              {right(unit)}
            </span>
          </button>
        ))}
      </nav>
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
