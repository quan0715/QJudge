import React, { useMemo } from "react";
import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import styles from "./PaperQuestionOverviewTable.module.scss";

export interface PaperQuestionOverviewRow {
  id: string;
  index: number;
  prompt: string;
  typeLabel: string;
  maxScore: number;
  scoreDisplay?: string;
  feedbackDisplay?: string;
  statusLabel?: string;
  statusTone?:
    | "red"
    | "magenta"
    | "purple"
    | "blue"
    | "cyan"
    | "teal"
    | "green"
    | "gray"
    | "cool-gray"
    | "warm-gray"
    | "high-contrast"
    | "outline";
}

interface PaperQuestionOverviewTableProps {
  rows: PaperQuestionOverviewRow[];
  showScore?: boolean;
  showFeedback?: boolean;
  onRowClick?: (questionId: string) => void;
}

const STATUS_ICON: Record<string, string> = {
  green: "✔",
  cyan: "△",
  red: "✖",
  "warm-gray": "…",
  "cool-gray": "⚠",
};

const STATUS_CLASS: Record<string, string> = {
  green: styles.statusCorrect,
  cyan: styles.statusPartial,
  red: styles.statusIncorrect,
  "warm-gray": styles.statusPending,
  "cool-gray": styles.statusMissing,
};

/** Column keys that should use compact (shrink-to-content) sizing */
const COMPACT_KEYS = new Set(["index", "type", "status"]);

const PaperQuestionOverviewTable: React.FC<PaperQuestionOverviewTableProps> = ({
  rows,
  showScore = true,
  showFeedback = false,
  onRowClick,
}) => {
  const { t } = useTranslation("contest");

  const headers = useMemo(() => {
    const base = [
      { key: "index", header: "#" },
      { key: "prompt", header: t("paperExamProblems.headers.prompt") },
      { key: "type", header: t("paperExamProblems.headers.type") },
      { key: "status", header: t("paperExamProblems.headers.status", "狀態") },
    ];
    if (showScore) {
      base.push({ key: "score", header: t("paperExamProblems.headers.score") });
    }
    if (showFeedback) {
      base.push({ key: "feedback", header: t("paperExamProblems.headers.feedback") });
    }
    return base;
  }, [showFeedback, showScore, t]);

  const tableRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        index: row.index,
        prompt: row.prompt,
        type: row.typeLabel,
        status: row.statusLabel || "-",
        score: row.scoreDisplay || "-",
        feedback: row.feedbackDisplay || "-",
      })),
    [rows],
  );

  const getHeaderClass = (key: string) => {
    if (key === "score") return styles.colScore;
    if (COMPACT_KEYS.has(key)) return styles.colCompact;
    return undefined;
  };

  return (
    <DataTable rows={tableRows} headers={headers}>
      {({
        rows: dtRows,
        headers: dtHeaders,
        getHeaderProps,
        getRowProps,
        getTableProps,
      }) => (
        <TableContainer className={styles.container}>
          <Table {...getTableProps()} className={styles.table}>
            <TableHead>
              <TableRow>
                {dtHeaders.map((header) => {
                  const { key, ...headerProps } = getHeaderProps({ header });
                  return (
                    <TableHeader
                      key={key}
                      {...headerProps}
                      className={getHeaderClass(header.key)}
                    >
                      {header.header}
                    </TableHeader>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {dtRows.map((row) => {
                const { key, ...rowProps } = getRowProps({ row });
                const clickable = typeof onRowClick === "function";
                const src = rows.find((r) => String(r.id) === String(row.id));

                return (
                  <TableRow
                    key={key}
                    {...rowProps}
                    onClick={clickable ? () => onRowClick(row.id) : undefined}
                    className={clickable ? styles.rowClickable : undefined}
                  >
                    {row.cells.map((cell) => {
                      const h = cell.info.header;

                      if (h === "index") {
                        return (
                          <TableCell key={cell.id} className={styles.colCompact}>
                            Q{cell.value}
                          </TableCell>
                        );
                      }

                      if (h === "prompt") {
                        return (
                          <TableCell key={cell.id} className={styles.cellPrompt}>
                            <span className={styles.cellPromptText}>
                              {String(cell.value || "-")}
                            </span>
                          </TableCell>
                        );
                      }

                      if (h === "type") {
                        return (
                          <TableCell key={cell.id} className={`${styles.colCompact} ${styles.cellType}`}>
                            {cell.value}
                          </TableCell>
                        );
                      }

                      if (h === "status") {
                        const tone = src?.statusTone || "cool-gray";
                        const icon = STATUS_ICON[tone] ?? "";
                        const cls = STATUS_CLASS[tone] ?? styles.statusMissing;
                        return (
                          <TableCell key={cell.id} className={styles.colCompact}>
                            {src?.statusLabel ? (
                              <span className={cls}>{icon} {src.statusLabel}</span>
                            ) : (
                              <span className={styles.statusMissing}>—</span>
                            )}
                          </TableCell>
                        );
                      }

                      if (h === "score") {
                        return (
                          <TableCell key={cell.id} className={styles.colScore}>
                            <span className={styles.cellScoreValue}>
                              {String(cell.value || "-")} / {src?.maxScore ?? "?"}
                            </span>
                          </TableCell>
                        );
                      }

                      if (h === "feedback") {
                        return (
                          <TableCell key={cell.id} className={styles.cellFeedback}>
                            <span className={styles.cellFeedbackText}>
                              {cell.value}
                            </span>
                          </TableCell>
                        );
                      }

                      return <TableCell key={cell.id}>{cell.value}</TableCell>;
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
};

export default PaperQuestionOverviewTable;
