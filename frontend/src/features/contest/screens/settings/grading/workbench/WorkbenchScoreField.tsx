import { useEffect, useState } from "react";
import { Button, TextInput } from "@carbon/react";
import { Add, Subtract } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { roundScore } from "@/shared/utils/scoreFormat";
import styles from "./GradingWorkbench.module.scss";

/** Scores read as plain numbers in the workbench: 12, 3.5, 2.75. */
export const compactScore = (value: number) => String(roundScore(value));

interface WorkbenchScoreFieldProps {
  label: string;
  max: number;
  /** 0.5 for subjective questions, 1 for objective ones. */
  step: number;
  value: number | null;
  /** The AI's score for this answer; null hides the restore action. */
  aiValue: number | null;
  disabled?: boolean;
  onChange(value: number): void;
}

export function WorkbenchScoreField({ label, max, step, value, aiValue, disabled, onChange }: WorkbenchScoreFieldProps) {
  const { t } = useTranslation("contest");
  const [text, setText] = useState(value === null ? "" : compactScore(value));
  useEffect(() => {
    setText(value === null ? "" : compactScore(value));
  }, [value]);
  const emit = (next: number) => onChange(Math.min(max, Math.max(0, roundScore(next))));
  return (
    <div className={styles.scoreField}>
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={Subtract}
        iconDescription={t("workbench.decrease", "{{label}} 減 {{step}} 分", { label, step })}
        tooltipPosition="bottom"
        disabled={disabled}
        onClick={() => emit((value ?? 0) - step)}
      />
      <TextInput
        id={`score-${label}-${max}`}
        className={styles.scoreInput}
        labelText={label}
        hideLabel
        inputMode="decimal"
        placeholder="—"
        value={text}
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= max) {
            onChange(roundScore(parsed));
          }
        }}
      />
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={Add}
        iconDescription={t("workbench.increase", "{{label}} 加 {{step}} 分", { label, step })}
        tooltipPosition="bottom"
        disabled={disabled}
        onClick={() => emit((value ?? 0) + step)}
      />
      <span className={styles.scoreMax}>/ {compactScore(max)}</span>
      {aiValue !== null && value !== aiValue && (
        <Button kind="ghost" size="sm" disabled={disabled} onClick={() => onChange(aiValue)}>
          {t("workbench.restoreAi", "還原 AI 的 {{score}} 分", { score: compactScore(aiValue) })}
        </Button>
      )}
    </div>
  );
}
