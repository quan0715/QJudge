import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button, IconButton } from "@carbon/react";
import { ArrowDown, ArrowUp, Draggable, WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import {
  resolveDropTarget,
  type PaperDragItem,
  type PaperMoveTarget,
} from "@/features/contest/domain/paperMoveModel";
import type { EditRailRow } from "./editRailModel";
import { WorkbenchAddMenu, type AddMenuChoice } from "./WorkbenchAddMenu";
import styles from "./WorkbenchEdit.module.scss";
export interface WorkbenchEditRailProps {
  header: ReactNode;
  rows: EditRailRow[];
  activeKey: string | null;
  locked: boolean;
  issueCount: number;
  summary: { questions: number; blocks: number; totalScore: number };
  onSelect(key: string): void;
  onMove(itemId: string, target: PaperMoveTarget): void;
  onAdd(choice: AddMenuChoice): void;
  onOpenPublishCheck(): void;
  legacyHref: string;
}
export function WorkbenchEditRail({
  header,
  rows,
  activeKey,
  locked,
  issueCount,
  summary,
  onSelect,
  onMove,
  onAdd,
  onOpenPublishCheck,
  legacyHref,
}: WorkbenchEditRailProps) {
  const { t } = useTranslation("contest");
  const drag = useRef<PaperDragItem | null>(null);
  const [drop, setDrop] = useState<{
    key: string;
    target: PaperMoveTarget;
  } | null>(null);
  const targetAt = (row: EditRailRow, event: DragEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return drag.current
      ? resolveDropTarget(
          row,
          drag.current,
          rect.height ? (event.clientY - rect.top) / rect.height : 0.5,
        )
      : null;
  };
  const adjacent = (
    row: EditRailRow,
    direction: -1 | 1,
  ): PaperMoveTarget | null => {
    if (row.kind === "child") {
      const index = rows.indexOf(row);
      const other = rows[index + direction];
      if (other?.kind === "child" && other.blockId === row.blockId)
        return {
          zone: "group",
          groupId: row.blockId,
          refQuestionId: other.questionId,
          position: direction < 0 ? "before" : "after",
        };
      return {
        zone: "top",
        refBlockId: row.blockId,
        position: direction < 0 ? "before" : "after",
      };
    }
    const top = rows.filter((r) => r.kind !== "child");
    const other = top[top.indexOf(row) + direction];
    return other
      ? {
          zone: "top",
          refBlockId: other.blockId,
          position: direction < 0 ? "before" : "after",
        }
      : null;
  };
  return (
    <aside
      className={styles.rail}
      aria-label={t("workbench.edit.questions", "題目")}
    >
      <div className={styles.railHeader}>
        {header}
        <p className={styles.summary}>
          {t(
            "workbench.edit.summary",
            "{{questions}} 題　{{blocks}} 區塊　總分 {{totalScore}}",
            summary,
          )}
        </p>
        {!locked && <WorkbenchAddMenu onAdd={onAdd} />}
      </div>
      <nav
        className={styles.railList}
        aria-label={t("workbench.edit.questions", "題目")}
      >
        {rows.map((row) => (
          <div
            key={row.key}
            data-row-key={row.key}
            className={[
              styles.railRow,
              row.kind === "child" ? styles.childRow : "",
              row.key === activeKey ? styles.activeRow : "",
              drop?.key === row.key
                ? drop.target.position === "before"
                  ? styles.dropBefore
                  : styles.dropAfter
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(event) => {
              if (locked) return;
              const target = targetAt(row, event);
              if (target) {
                event.preventDefault();
                setDrop({ key: row.key, target });
              } else setDrop(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const target = targetAt(row, event);
              if (!locked && drag.current && target)
                onMove(drag.current.id, target);
              drag.current = null;
              setDrop(null);
            }}
          >
            {!locked && (
              <IconButton
                size="sm"
                kind="ghost"
                className={styles.grip}
                label={t("workbench.edit.drag", "拖曳{{label}}", {
                  label: row.label,
                })}
                draggable
                onDragStart={(event) => {
                  drag.current = {
                    kind: row.kind,
                    id: row.questionId ?? row.blockId,
                    groupId: row.kind === "child" ? row.blockId : null,
                  };
                  event.dataTransfer.setData("text/plain", drag.current.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  drag.current = null;
                  setDrop(null);
                }}
              >
                <Draggable size={16} />
              </IconButton>
            )}
            <Button
              kind="ghost"
              size="sm"
              className={styles.rowSelect}
              aria-current={activeKey === row.key ? "page" : undefined}
              onClick={() => onSelect(row.key)}
            >
              <span className={styles.rowLabel}>{row.label}</span>
              <span className={styles.rowType}>{row.typeText}</span>
              {row.hasIssue && (
                <WarningAlt
                  size={16}
                  className={styles.warning}
                  aria-label={t("workbench.edit.hasIssue", "有發布前問題")}
                />
              )}
              <span className={styles.rowScore}>{row.score}</span>
            </Button>
            {!locked && activeKey === row.key && (
              <div className={styles.moveControls}>
                <IconButton
                  size="sm"
                  kind="ghost"
                  label={t("workbench.edit.moveUp", "上移")}
                  disabled={!adjacent(row, -1)}
                  onClick={() => {
                    const target = adjacent(row, -1);
                    if (target) onMove(row.questionId ?? row.blockId, target);
                  }}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  kind="ghost"
                  label={t("workbench.edit.moveDown", "下移")}
                  disabled={!adjacent(row, 1)}
                  onClick={() => {
                    const target = adjacent(row, 1);
                    if (target) onMove(row.questionId ?? row.blockId, target);
                  }}
                >
                  <ArrowDown size={16} />
                </IconButton>
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className={styles.railFooter}>
        {issueCount > 0 && (
          <Button kind="ghost" size="sm" onClick={onOpenPublishCheck}>
            <WarningAlt size={16} />
            {t("workbench.edit.publishCount", "發布前檢查 {{count}} 項", {
              count: issueCount,
            })}
          </Button>
        )}
        <Button kind="ghost" size="sm" href={legacyHref}>
          {t("workbench.edit.legacy", "改用舊版考卷管理")}
        </Button>
      </div>
    </aside>
  );
}
