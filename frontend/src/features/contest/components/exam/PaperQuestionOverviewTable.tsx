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
  Tag,
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
      { key: "maxScore", header: t("paperExamProblems.headers.maxScore") },
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
        maxScore: row.maxScore,
        score: row.scoreDisplay || "-",
        feedback: row.feedbackDisplay || "-",
        statusLabel: row.statusLabel,
        statusTone: row.statusTone || "cool-gray",
      })),
    [rows],
  );

  return (
    <DataTable rows={tableRows} headers={headers}>
      {({
        rows: dtRows,
        headers: dtHeaders,
        getHeaderProps,
        getRowProps,
        getTableProps,
      }) => (
        <TableContainer>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {dtHeaders.map((header) => {
                  const { key, ...headerProps } = getHeaderProps({ header });
                  return (
                    <TableHeader key={key} {...headerProps}>
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
                return (
                  <TableRow
                    key={key}
                    {...rowProps}
                    onClick={clickable ? () => onRowClick(row.id) : undefined}
                    style={clickable ? { cursor: "pointer" } : undefined}
                  >
                    {row.cells.map((cell) => {
                      if (cell.info.header === "prompt") {
                        return (
                          <TableCell key={cell.id}>
                            <span className={styles.promptCell}>{String(cell.value || "-")}</span>
                          </TableCell>
                        );
                      }
                      if (cell.info.header === "score") {
                        const statusLabel = row.cells.find(
                          (candidate) => candidate.info.header === "statusLabel",
                        )?.value;
                        const statusTone = row.cells.find(
                          (candidate) => candidate.info.header === "statusTone",
                        )?.value;
                        return (
                          <TableCell key={cell.id}>
                            <span className={styles.scoreCell}>
                              <span>{String(cell.value || "-")}</span>
                              {statusLabel ? (
                                <Tag
                                  type={String(statusTone || "cool-gray") as "cool-gray"}
                                  className={styles.statusTag}
                                >
                                  {String(statusLabel)}
                                </Tag>
                              ) : null}
                            </span>
                          </TableCell>
                        );
                      }
                      if (cell.info.header === "statusLabel" || cell.info.header === "statusTone") {
                        return null;
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
