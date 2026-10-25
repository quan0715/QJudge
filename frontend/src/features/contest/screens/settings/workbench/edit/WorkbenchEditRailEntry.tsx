import { useRef, type ReactNode } from "react";
import { IconButton } from "@carbon/react";
import {
  ArrowDown,
  ArrowUp,
  GroupObjects,
  WarningAlt,
} from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import {
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import type { EditRailRow } from "./editRailModel";
import styles from "./WorkbenchEdit.module.scss";

interface WorkbenchEditRailEntryProps {
  row: EditRailRow;
  active: boolean;
  locked: boolean;
  busy: boolean;
  children?: ReactNode;
  onSelect(): void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart(): void;
  onDragEnd(): void;
  onDragCancel(): void;
}
export function WorkbenchEditRailEntry({
  row,
  active,
  locked,
  busy,
  children,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragCancel,
}: WorkbenchEditRailEntryProps) {
  const { t } = useTranslation("contest");
  const dragControls = useDragControls();
  const wasDragged = useRef(false);
  const TypeIcon = row.questionType
    ? EXAM_QUESTION_TYPE_ICON[row.questionType]
    : GroupObjects;
  return (
    <Reorder.Item
      as="div"
      value={row.key}
      dragListener={false}
      dragControls={dragControls}
      drag={!locked && !busy}
      onDragStart={() => {
        wasDragged.current = true;
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={styles.reorderItem}
    >
      <div
        data-row-key={row.key}
        className={[
          styles.railRow,
          row.kind === "child" ? styles.childRow : "",
          active ? styles.activeRow : "",
          locked ? styles.lockedRow : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onPointerDown={(event) => {
          wasDragged.current = false;
          if (locked || busy) return;
          event.stopPropagation();
          dragControls.start(event);
        }}
        onPointerCancel={onDragCancel}
        onClickCapture={(event) => {
          if (wasDragged.current && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <ListItem
          active={active}
          ariaCurrent={active ? "page" : undefined}
          onClick={onSelect}
          className={styles.rowSelect}
          secondaryAction={
            !locked && active ? (
              <div className={styles.moveControls}>
                <IconButton
                  size="sm"
                  kind="ghost"
                  label={t("workbench.edit.moveUp", "上移")}
                  disabled={busy || !onMoveUp}
                  onClick={onMoveUp}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  kind="ghost"
                  label={t("workbench.edit.moveDown", "下移")}
                  disabled={busy || !onMoveDown}
                  onClick={onMoveDown}
                >
                  <ArrowDown size={16} />
                </IconButton>
              </div>
            ) : undefined
          }
        >
          <ListItemLeading>
            <span className={styles.rowLabel}>{row.label}</span>
            <span
              className={styles.rowTypeIcon}
              role="img"
              aria-label={row.typeText}
              title={row.typeText}
            >
              <TypeIcon size={16} />
            </span>
          </ListItemLeading>
          <ListItemContent>
            <ListItemTitle>
              <span title={row.title}>{row.title}</span>
            </ListItemTitle>
          </ListItemContent>
          {row.hasIssue && (
            <ListItemTrailing>
              <WarningAlt
                size={16}
                className={styles.warning}
                aria-label={t("workbench.edit.hasIssue", "有發布前問題")}
              />
            </ListItemTrailing>
          )}
        </ListItem>
      </div>
      {children}
    </Reorder.Item>
  );
}
