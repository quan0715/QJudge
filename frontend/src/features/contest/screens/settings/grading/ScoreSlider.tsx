import { useCallback, useMemo, useRef } from "react";
import styles from "./ScoreSlider.module.scss";

export interface ScoreSliderProps {
  value: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

/** Format score: integers show as "3", halves as "3.5". */
const formatScore = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(1);

/** Map score ratio (0–1) → fill color using Carbon tokens + color-mix.
 *  0 = gray, 0–25% red→yellow, 25–75% yellow→green, 75–100% green deepens. */
function getScoreColor(ratio: number): { bg: string; text: string } {
  if (ratio <= 0) {
    return {
      bg: "color-mix(in srgb, var(--cds-text-secondary) 22%, transparent)",
      text: "var(--cds-text-primary)",
    };
  }
  if (ratio <= 0.25) {
    const t = Math.round((ratio / 0.25) * 100);
    return {
      bg: `color-mix(in srgb, color-mix(in srgb, var(--cds-support-warning) ${t}%, var(--cds-support-error)) 58%, transparent)`,
      text: "var(--cds-text-primary)",
    };
  }
  if (ratio <= 0.75) {
    const t = Math.round(((ratio - 0.25) / 0.5) * 100);
    return {
      bg: `color-mix(in srgb, color-mix(in srgb, var(--cds-support-success) ${t}%, var(--cds-support-warning)) 55%, transparent)`,
      text: ratio > 0.6 ? "#fff" : "var(--cds-text-primary)",
    };
  }
  const t = (ratio - 0.75) / 0.25;
  const opacity = Math.round(55 + t * 35);
  return {
    bg: `color-mix(in srgb, var(--cds-support-success) ${opacity}%, transparent)`,
    text: "#fff",
  };
}

export default function ScoreSlider({
  value,
  max,
  step = 0.5,
  disabled = false,
  onChange,
}: ScoreSliderProps) {
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
    [max, clamp],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      onChange?.(getValueFromPosition(e.clientX));
    },
    [disabled, getValueFromPosition, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      onChange?.(getValueFromPosition(e.clientX));
    },
    [getValueFromPosition, onChange],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Tick labels (integers shown below the bar)
  const tickLabels = useMemo(() => {
    if (max <= 0) return [0];
    const labelStep = max <= 10 ? 1 : max <= 20 ? 2 : 5;
    const result: number[] = [];
    for (let i = 0; i <= max; i += labelStep) result.push(i);
    if (result[result.length - 1] !== max) result.push(max);
    return result;
  }, [max]);

  // Tick lines (every step inside the bar)
  const tickLines = useMemo(() => {
    if (max <= 0) return [];
    const result: number[] = [];
    for (let i = step; i < max; i += step) result.push(i);
    return result;
  }, [max, step]);

  const pct = max > 0 ? (value / max) * 100 : 0;
  const color = getScoreColor(pct / 100);

  return (
    <div className={`${styles.sliderRow} ${disabled ? styles.disabled : ""}`}>
      <div className={styles.sliderArea}>
        <div
          className={styles.sliderPill}
          ref={pillRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {tickLines.map((v) => (
            <span
              key={v}
              className={Number.isInteger(v) ? styles.tickLineMajor : styles.tickLine}
              style={{ left: `${(v / max) * 100}%` }}
            />
          ))}
          <div
            className={styles.sliderFill}
            style={{ width: `max(1.5rem, ${pct}%)`, background: color.bg }}
          >
            <span className={styles.sliderValue} style={{ color: color.text }}>
              {formatScore(value)}
            </span>
          </div>
        </div>
        <div className={styles.sliderTicks}>
          {tickLabels.map((v) => (
            <span
              key={v}
              className={styles.tick}
              style={{ left: `${max > 0 ? (v / max) * 100 : 0}%` }}
            >
              {formatScore(v)}
            </span>
          ))}
        </div>
      </div>
      <span className={styles.sliderMaxOuter}>/ {formatScore(max)}</span>
    </div>
  );
}

export { getScoreColor, formatScore };
