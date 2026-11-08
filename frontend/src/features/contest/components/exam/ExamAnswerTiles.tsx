import { useTranslation } from "react-i18next";
import styles from "./ExamAnswerTiles.module.scss";

export type ExamResultTileState =
  | "full"
  | "partial"
  | "zero"
  | "answered"
  | "unanswered"
  | "accepted"
  | "attempted";

export interface ExamResultTile {
  key: string;
  label: string;
  state: ExamResultTileState;
  /** Read aloud and shown on hover, e.g. "20 / 20 分". */
  detail: string;
  /** Flagged by the student for another look. */
  marked?: boolean;
}

interface ExamAnswerTilesProps {
  tiles: ExamResultTile[];
  /** Makes each tile a button, e.g. to jump to that question before handing in. */
  onSelect?: (key: string) => void;
}

const LEGEND_ORDER: ExamResultTileState[] = ["full", "partial", "zero", "accepted", "attempted", "answered", "unanswered"];

/** One tile per question, as on the overview report; shared with the hand-in check. */
export function ExamAnswerTiles({ tiles, onSelect }: ExamAnswerTilesProps) {
  const { t } = useTranslation("contest");
  const stateLabel: Record<ExamResultTileState, string> = {
    full: t("workspace.report.full", "滿分"),
    partial: t("workspace.report.partial", "部分得分"),
    zero: t("workspace.report.zero", "未得分"),
    answered: t("workspace.report.answered", "已作答"),
    unanswered: t("workspace.report.unanswered", "未作答"),
    accepted: t("workspace.report.accepted", "已通過"),
    attempted: t("workspace.report.attempted", "未通過"),
  };
  const present = new Set(tiles.map((tile) => tile.state));
  const legend = LEGEND_ORDER.filter((state) => present.has(state));
  const markedLabel = t("workspace.status.marked", "已標記");
  const hasMarked = tiles.some((tile) => tile.marked);

  return (
    <>
      <ol className={styles.tiles}>
        {tiles.map((tile) => {
          const name = t("workspace.report.question", `第 ${tile.label} 題`, { label: tile.label });
          const spoken = [name, tile.detail, tile.marked ? markedLabel : null].filter(Boolean).join("，");
          const body = (
            <>
              <span aria-hidden="true">{tile.label}</span>
              <span className={styles.srOnly}>{spoken}</span>
            </>
          );
          return (
            <li
              key={tile.key}
              className={styles.tile}
              data-state={tile.state}
              data-long={tile.label.length > 3}
              data-marked={!!tile.marked}
              title={`${name}：${tile.detail}${tile.marked ? `，${markedLabel}` : ""}`}
            >
              {onSelect ? (
                <button type="button" className={styles.tileButton} onClick={() => onSelect(tile.key)}>{body}</button>
              ) : body}
            </li>
          );
        })}
      </ol>
      <ul className={styles.legend} aria-hidden="true">
        {legend.map((state) => (
          <li key={state}><i data-state={state} />{stateLabel[state]}</li>
        ))}
        {hasMarked && <li><i data-marked="true" />{markedLabel}</li>}
      </ul>
    </>
  );
}
