import { useRef, useState, type ReactNode } from "react";
import { Button } from "@carbon/react";
import { WarningAlt } from "@carbon/icons-react";
import { Reorder } from "motion/react";
import { useTranslation } from "react-i18next";
import type { PaperMoveTarget } from "@/features/contest/domain/paperMoveModel";
import type { EditRailRow } from "./editRailModel";
import { WorkbenchAddMenu, type AddMenuChoice } from "./WorkbenchAddMenu";
import { WorkbenchEditRailEntry } from "./WorkbenchEditRailEntry";
import styles from "./WorkbenchEdit.module.scss";
export interface WorkbenchEditRailProps {
  header: ReactNode;
  rows: EditRailRow[];
  activeKey: string | null;
  locked: boolean;
  issueCount: number;
  summary: { questions: number; blocks: number; totalScore: number };
  onSelect(key: string): void;
  onMove(itemId: string, target: PaperMoveTarget): void | Promise<void>;
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
  const [preview, setPreview] = useState<EditRailRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<EditRailRow[] | null>(null);
  const drag = useRef<{ row: EditRailRow; initialKeys: string[] } | null>(null);
  const displayRows = preview ?? rows;
  const siblings = (row: EditRailRow, list: EditRailRow[]) =>
    list.filter((item) =>
      row.kind === "child"
        ? item.kind === "child" && item.blockId === row.blockId
        : item.kind !== "child",
    );
  const resetPreview = () => {
    drag.current = null;
    previewRef.current = null;
    setPreview(null);
  };
  const start = (row: EditRailRow) => {
    if (locked || saving) return;
    drag.current = {
      row,
      initialKeys: siblings(row, rows).map((item) => item.key),
    };
    previewRef.current = rows;
  };
  const showPreview = (next: EditRailRow[]) => {
    previewRef.current = next;
    setPreview(next);
  };
  const reorderTop = (keys: string[]) => {
    if (!drag.current || locked) return;
    const current = previewRef.current ?? rows;
    showPreview(
      keys.flatMap((key) => current.filter((row) => row.blockId === key)),
    );
  };
  const reorderChildren = (groupId: string, keys: string[]) => {
    if (!drag.current || locked) return;
    const current = previewRef.current ?? rows;
    const byKey = new Map(current.map((row) => [row.key, row]));
    let index = 0;
    showPreview(
      current.map((row) =>
        row.kind === "child" && row.blockId === groupId
          ? byKey.get(keys[index++])!
          : row,
      ),
    );
  };
  const finish = async () => {
    const session = drag.current;
    if (!session || locked) {
      resetPreview();
      return;
    }
    drag.current = null;
    const next = siblings(session.row, previewRef.current ?? rows);
    if (next.every((row, index) => row.key === session.initialKeys[index])) {
      resetPreview();
      return;
    }
    const index = next.findIndex((row) => row.key === session.row.key);
    const neighbor = index === 0 ? next[1] : next[index - 1];
    const position = index === 0 ? "before" : "after";
    const target: PaperMoveTarget =
      session.row.kind === "child"
        ? {
            zone: "group",
            groupId: session.row.blockId,
            refQuestionId: neighbor.questionId!,
            position,
          }
        : { zone: "top", refBlockId: neighbor.blockId, position };
    setSaving(true);
    try {
      await onMove(session.row.questionId ?? session.row.blockId, target);
    } catch {
      /* The container reports the save failure and reloads the paper. */
    } finally {
      resetPreview();
      setSaving(false);
    }
  };
  const adjacent = (
    row: EditRailRow,
    direction: -1 | 1,
  ): PaperMoveTarget | null => {
    const list = siblings(row, rows);
    const other =
      list[list.findIndex((item) => item.key === row.key) + direction];
    if (!other) return null;
    return row.kind === "child"
      ? {
          zone: "group",
          groupId: row.blockId,
          refQuestionId: other.questionId!,
          position: direction < 0 ? "before" : "after",
        }
      : {
          zone: "top",
          refBlockId: other.blockId,
          position: direction < 0 ? "before" : "after",
        };
  };
  const entry = (row: EditRailRow, children?: ReactNode) => {
    const up = adjacent(row, -1),
      down = adjacent(row, 1);
    return (
      <WorkbenchEditRailEntry
        key={row.key}
        row={row}
        active={activeKey === row.key}
        locked={locked}
        busy={saving}
        onSelect={() => onSelect(row.key)}
        onMoveUp={
          up
            ? () => {
                void onMove(row.questionId ?? row.blockId, up);
              }
            : undefined
        }
        onMoveDown={
          down
            ? () => {
                void onMove(row.questionId ?? row.blockId, down);
              }
            : undefined
        }
        onDragStart={() => start(row)}
        onDragEnd={() => {
          void finish();
        }}
        onDragCancel={() => {
          if (drag.current) resetPreview();
        }}
      >
        {children}
      </WorkbenchEditRailEntry>
    );
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
      <Reorder.Group
        as="nav"
        axis="y"
        layoutScroll
        className={styles.railList}
        aria-label={t("workbench.edit.questions", "題目")}
        values={displayRows
          .filter((row) => row.kind !== "child")
          .map((row) => row.key)}
        onReorder={reorderTop}
      >
        {displayRows
          .filter((row) => row.kind !== "child")
          .map((row) => {
            const children = displayRows.filter(
              (child) =>
                child.kind === "child" && child.blockId === row.blockId,
            );
            return entry(
              row,
              row.kind === "group" && children.length > 0 ? (
                <Reorder.Group
                  as="div"
                  axis="y"
                  aria-label={row.label}
                  values={children.map((child) => child.key)}
                  onReorder={(keys) => reorderChildren(row.blockId, keys)}
                >
                  {children.map((child) => entry(child))}
                </Reorder.Group>
              ) : undefined,
            );
          })}
      </Reorder.Group>
      <div className={styles.railFooter}>
        {issueCount > 0 && (
          <Button
            kind="ghost"
            size="sm"
            className={styles.publishLink}
            onClick={onOpenPublishCheck}
          >
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
