import { useCallback, useId, useMemo, useRef } from "react";
import { NumberInput } from "@carbon/react";
import styles from "./ScoreSlider.module.scss";

export interface ScoreSliderProps {
  label?: string;
  value: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

const formatScore = (value: number) => value.toFixed(2);

/** Map the score ratio to the original strictness-oriented colour scale. */
function getScoreColor(ratio: number): { bg: string; text: string } {
  if (ratio <= 0) {
    return {
      bg: "color-mix(in srgb, var(--cds-text-secondary) 22%, transparent)",
      text: "var(--cds-text-primary)",
    };
  }
  if (ratio <= 0.25) {
    const mix = Math.round((ratio / 0.25) * 100);
    return {
      bg: `color-mix(in srgb, color-mix(in srgb, var(--cds-support-warning) ${mix}%, var(--cds-support-error)) 58%, transparent)`,
      text: "var(--cds-text-primary)",
    };
  }
  if (ratio <= 0.75) {
    const mix = Math.round(((ratio - 0.25) / 0.5) * 100);
    return {
      bg: `color-mix(in srgb, color-mix(in srgb, var(--cds-support-success) ${mix}%, var(--cds-support-warning)) 55%, transparent)`,
      text: ratio > 0.6 ? "var(--cds-text-on-color)" : "var(--cds-text-primary)",
    };
  }
  const opacity = Math.round(55 + ((ratio - 0.75) / 0.25) * 35);
  return {
    bg: `color-mix(in srgb, var(--cds-support-success) ${opacity}%, transparent)`,
    text: "var(--cds-text-on-color)",
  };
}

export default function ScoreSlider({
  label = "批改分數",
  value,
  max,
  step = 0.5,
  disabled = false,
  onChange,
}: ScoreSliderProps) {
  const inputId = `grading-score-input-${useId().replace(/:/g, "")}`;
  const pillRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const clamp = useCallback(
    (raw: number) => {
      const rounded = Math.round(raw / step) * step;
      return Math.max(0, Math.min(max, rounded));
    },
    [max, step],
  );

  const getValueFromPosition = useCallback(
    (clientX: number) => {
      const pill = pillRef.current;
      if (!pill || max <= 0) return 0;
      const rect = pill.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return clamp(ratio * max);
    },
    [clamp, max],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      isDraggingRef.current = true;
      onChange?.(getValueFromPosition(event.clientX));
    },
    [disabled, getValueFromPosition, onChange],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      onChange?.(getValueFromPosition(event.clientX));
    },
    [getValueFromPosition, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      let nextValue: number | null = null;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") nextValue = value + step;
      if (event.key === "ArrowDown" || event.key === "ArrowLeft") nextValue = value - step;
      if (event.key === "Home") nextValue = 0;
      if (event.key === "End") nextValue = max;
      if (nextValue === null) return;
      event.preventDefault();
      onChange?.(clamp(nextValue));
    },
    [clamp, disabled, max, onChange, step, value],
  );

  const tickLabels = useMemo(() => {
    if (max <= 0) return [0];
    const labelStep = max <= 10 ? 1 : max <= 20 ? 2 : 5;
    const result: number[] = [];
    for (let tick = 0; tick <= max; tick += labelStep) result.push(tick);
    if (result[result.length - 1] !== max) result.push(max);
    return result;
  }, [max]);

  const tickLines = useMemo(() => {
    if (max <= 0) return [];
    const result: number[] = [];
    for (let tick = step; tick < max; tick += step) result.push(tick);
    return result;
  }, [max, step]);

  const percentage = max > 0 ? (value / max) * 100 : 0;
  const color = getScoreColor(percentage / 100);

  return (
    <div className={`${styles.sliderRow} ${disabled ? styles.disabled : ""}`}>
      <div className={styles.sliderArea}>
        <div
          className={styles.sliderPill}
          ref={pillRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${formatScore(value)} / ${formatScore(max)}`}
          aria-disabled={disabled}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => {
            isDraggingRef.current = false;
          }}
          onPointerCancel={() => {
            isDraggingRef.current = false;
          }}
        >
          {tickLines.map((tick) => (
            <span
              key={tick}
              className={Number.isInteger(tick) ? styles.tickLineMajor : styles.tickLine}
              style={{ left: `${(tick / max) * 100}%` }}
            />
          ))}
          <div
            className={styles.sliderFill}
            data-testid="score-slider-fill"
            style={{
              width: `max(1.5rem, ${percentage}%)`,
              background: color.bg,
            }}
          >
            <span className={styles.sliderValue} style={{ color: color.text }}>
              {formatScore(value)}
            </span>
          </div>
        </div>
        <div className={styles.sliderTicks} aria-hidden="true">
          {tickLabels.map((tick) => (
            <span
              key={tick}
              className={styles.tick}
              style={{ left: `${max > 0 ? (tick / max) * 100 : 0}%` }}
            >
              {formatScore(tick)}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.exactInput} data-testid="score-exact-input">
        <NumberInput
          id={inputId}
          label={label}
          hideLabel
          hideSteppers
          size="sm"
          min={0}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(_event, { value: nextValue }) => {
            const parsed = Number(nextValue);
            if (Number.isFinite(parsed)) onChange?.(clamp(parsed));
          }}
        />
      </div>
    </div>
  );
}

export { formatScore };
