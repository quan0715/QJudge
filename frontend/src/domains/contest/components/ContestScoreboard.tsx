import React from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  SkeletonText,
} from "@carbon/react";

import { Link } from "react-router-dom";

export interface ProblemInfo {
  id: number;
  title: string;
  order: number;
  label: string;
  score?: number;
  problem_id?: number;
}

export interface ProblemStats {
  status: "AC" | "WA" | "attempted" | null;
  tries: number;
  time: number;
  pending: boolean;
}

export interface StandingRow {
  rank: number;
  user: {
    id: number;
    username: string;
  };
  displayName?: string;
  nickname?: string;
  solved: number;
  total_score: number;
  time: number;
  problems: Record<string, ProblemStats>;
}

interface ContestScoreboardProps {
  problems: ProblemInfo[];
  standings: StandingRow[];
  loading?: boolean;
  className?: string;
  contestId?: string;
}

const ContestScoreboard: React.FC<ContestScoreboardProps> = ({
  problems,
  standings,
  loading = false,
  className,
  contestId,
}) => {
  const getCellColor = (stats: ProblemStats) => {
    if (stats.status === "AC") return "rgba(36, 161, 72, 0.2)"; // Green 20%
    if (stats.status === "WA") return "rgba(218, 30, 40, 0.2)"; // Red 20%
    if (stats.pending) return "rgba(241, 194, 27, 0.2)"; // Yellow 20%
    if (stats.tries > 0) return "rgba(218, 30, 40, 0.1)"; // Red 10%
    return "transparent";
  };

  // Prepare headers for DataTable
  const headers = [
    { key: "rank", header: "排名" },
    { key: "user", header: "參與者" },
    { key: "solved", header: "解題數" },
    { key: "total_score", header: "總分" },
    { key: "time", header: "罰時" },
    ...problems.map((p) => ({
      key: `problem_${p.id}`,
      header: p.label,
    })),
  ];

  const rows = standings.map((s, index) => {
    // Use rank + index for unique ID since multiple users could have same rank
    const rowId = `row_${s.rank}_${s.user?.id || index}`;
    // Use displayName if available (for anonymous mode), fallback to username
    const displayName = s.displayName || s.user?.username || "Unknown";
    const row: any = {
      id: rowId,
      rank: s.rank,
      user: displayName,
      nickname: s.nickname,
      realUsername: s.user?.username,
      solved: s.solved || 0,
      total_score: s.total_score || 0,
      time: s.time || 0,
    };

    problems.forEach((p) => {
      // API returns problems keyed by problem ID (as string)
      const problemId = String(p.id || p.problem_id || "");
      const stats = problemId && s.problems ? s.problems[problemId] : null;
      row[`problem_${p.id}`] = stats;
    });

    return row;
  });

  const renderCell = (cell: any, problems: ProblemInfo[]) => {
    // Check if it's a problem column
    if (cell.info.header.startsWith("problem_")) {
      const stats = cell.value as ProblemStats | null;
      if (!stats) return null;

      const bgColor = getCellColor(stats);
      // Use Carbon text colors
      const textColor =
        stats.status === "AC"
          ? "var(--cds-text-primary)"
          : stats.pending
          ? "var(--cds-text-primary)"
          : "var(--cds-text-primary)";

      const statusColor =
        stats.status === "AC"
          ? "var(--cds-support-success)"
          : stats.status === "WA"
          ? "var(--cds-support-error)"
          : stats.pending
          ? "var(--cds-support-warning)"
          : "var(--cds-text-secondary)";

      // Get problem score for AC display
      const problemId = cell.info.header.replace("problem_", "");
      const problem = problems.find((p) => String(p.id) === problemId);
      const problemScore = problem?.score || 0;

      return (
        <div
          style={{
            backgroundColor: bgColor,
            height: "100%",
            width: "100%",
            display: "flex",
            textAlign: "center",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0.5rem",
            minHeight: "60px",
            minWidth: "60px", // Ensure minimum width
          }}
        >
          {stats.status === "AC" && (
            <>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "1.1em",
                  color: statusColor,
                }}
              >
                {problemScore > 0 ? `${problemScore}` : "AC"}
              </div>
              <div style={{ fontSize: "0.8em", color: textColor }}>
                {stats.tries === 1 ? "1 try" : `${stats.tries} tries`}
              </div>
            </>
          )}
          {stats.status === "WA" && (
            <>
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "1.1em",
                  color: statusColor,
                }}
              >
                {" "}
                WA{" "}
              </div>
              <div style={{ fontSize: "0.8em", color: textColor }}>
                {stats.tries === 1 ? "1 try" : `${stats.tries} tries`}
              </div>
            </>
          )}
          {stats.pending && (
            <>
              <div style={{ fontWeight: "bold", color: statusColor }}>
                Pending
              </div>
              <div style={{ fontSize: "0.8em", color: textColor }}>
                {stats.tries} tries
              </div>
            </>
          )}
          {!stats.status && !stats.pending && stats.tries > 0 && (
            <div style={{ fontSize: "0.8em", color: textColor }}>
              {stats.tries === 1 ? "1 try" : `${stats.tries} tries`}
            </div>
          )}
        </div>
      );
    }

    // Default rendering for other columns
    if (cell.info.header === "rank") {
      return (
        <div style={{ fontWeight: "bold", textAlign: "left", width: "40px" }}>
          {cell.value}
        </div>
      );
    }
    if (cell.info.header === "solved") {
      return (
        <div style={{ fontWeight: "bold", textAlign: "left", width: "60px" }}>
          {cell.value}
        </div>
      );
    }
    if (cell.info.header === "total_score") {
      return (
        <div style={{ fontWeight: "bold", textAlign: "left", width: "60px" }}>
          {cell.value}
        </div>
      );
    }
    if (cell.info.header === "time") {
      return (
        <div style={{ fontWeight: "bold", textAlign: "left", width: "80px" }}>
          {cell.value}
        </div>
      );
    }
    if (cell.info.header === "user") {
      return (
        <div style={{ fontWeight: 600, textAlign: "left" }}>{cell.value}</div>
      );
    }

    return cell.value;
  };

  if (loading) {
    return (
      <div style={{ padding: "1rem 0" }}>
        <div style={{ marginBottom: "1rem" }}>
          <SkeletonText heading width="20%" />
        </div>
        <SkeletonText paragraph lineCount={10} />
      </div>
    );
  }

  return (
    <div className={className} style={{ overflowX: "auto" }}>
      <DataTable rows={rows} headers={headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps,
        }: any) => (
          <TableContainer>
            <Table
              {...getTableProps()}
              isSortable
              className="contest-scoreboard-table"
              style={{ tableLayout: "fixed", width: "100%" }}
            >
              <TableHead>
                <TableRow>
                  {headers.map((header: any) => {
                    const headerProps = getHeaderProps({ header });
                    const isProblemColumn = header.key.startsWith("problem_");
                    const problem = isProblemColumn
                      ? problems.find((p) => `problem_${p.id}` === header.key)
                      : null;
                    const problemId = problem?.problem_id || problem?.id; // Prefer real problem ID

                    return (
                      <TableHeader
                        {...headerProps}
                        key={header.key}
                        className={`${headerProps.className || ""} ${
                          header.key === "user" ? "text-left" : ""
                        }`}
                        style={{
                          textAlign: header.key === "user" ? "left" : "center",
                          width:
                            header.key === "rank"
                              ? "80px"
                              : header.key === "solved"
                              ? "80px"
                              : header.key === "total_score"
                              ? "80px"
                              : header.key === "time"
                              ? "80px"
                              : header.key.startsWith("problem_")
                              ? "80px"
                              : "auto",
                        }}
                      >
                        <div
                          style={{
                            textAlign: header.key.startsWith("problem_")
                              ? "center"
                              : "left",
                            fontWeight: "bold",
                            fontSize: "14px",
                          }}
                        >
                          {isProblemColumn && contestId && problemId ? (
                            <Link
                              to={`/contests/${contestId}/solve/${problemId}`}
                              style={{
                                textDecoration: "none",
                                color: "inherit",
                                display: "block",
                                width: "100%",
                                height: "100%",
                              }}
                            >
                              {header.header}
                            </Link>
                          ) : (
                            header.header
                          )}
                        </div>
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell: any) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          padding: cell.info.header.startsWith("problem_")
                            ? 0
                            : "1rem",
                          textAlign: "center",
                        }}
                      >
                        {renderCell(cell, problems)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};

export default ContestScoreboard;
