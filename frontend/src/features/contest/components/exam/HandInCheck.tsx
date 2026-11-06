import { useTranslation } from "react-i18next";
import { ExamAnswerTiles, type ExamResultTile } from "./ExamAnswerTiles";
import styles from "./HandInCheck.module.scss";

interface HandInCheckProps {
  tiles: ExamResultTile[];
  /** Jump to a question instead of handing in. */
  onSelect?: (key: string) => void;
}

/** Body of the hand-in confirmation: what is still open, then the same tiles as the overview. */
export function HandInCheck({ tiles, onSelect }: HandInCheckProps) {
  const { t } = useTranslation("contest");
  const total = tiles.length;
  const open = tiles.filter((tile) => tile.state === "unanswered").length;
  const marked = tiles.filter((tile) => tile.marked).length;

  return (
    <div className={styles.check}>
      <p className={styles.summary} data-open={open > 0}>
        {open > 0
          ? t("workspace.handIn.open", `還有 ${open} 題未作答`, { count: open })
          : t("workspace.handIn.complete", `${total} 題都已作答`, { count: total })}
        {marked > 0 && (
          <span className={styles.marked}>{t("workspace.handIn.marked", `${marked} 題已標記`, { count: marked })}</span>
        )}
      </p>
      <ExamAnswerTiles tiles={tiles} onSelect={onSelect} />
      <p className={styles.note}>
        {onSelect
          ? t("workspace.handIn.noteSelect", "點題號可回到該題。交卷後就不能再修改答案。")
          : t("workspace.handIn.note", "交卷後就不能再修改答案。")}
      </p>
    </div>
  );
}
