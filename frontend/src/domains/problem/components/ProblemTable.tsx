import React from "react";
import { useTranslation } from "react-i18next";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Tag,
  SkeletonText,
} from "@carbon/react";
import {
  Edit,
  TrashCan,
  Upload,
  Add,
  CheckmarkOutline,
  CaretUp,
  CaretDown,
} from "@carbon/icons-react";
import { Link } from "react-router-dom";
import type { Problem } from "@/core/entities/problem.entity";
import { DifficultyBadge } from "@/ui/components/badges/DifficultyBadge";

// Extend Problem to include contest-specific fields if needed for display
export interface ProblemRowData extends Partial<Problem> {
  id: string;
  title: string;
  isSolved?: boolean; // For student mode
  // Contest specific
  label?: string;
  order?: number;
  score?: number;
  problemId?: string; // Real problem ID if different from contest problem ID

  // Allow loose typing for legacy support during migration if needed,
  // but prefer strict typing from Problem entity
  [key: string]: any;
}

interface ProblemTableProps {
  problems: ProblemRowData[];
  mode: "admin" | "contest" | "student";
  loading?: boolean;
  onAction?: (action: string, problem: ProblemRowData) => void;
  // Admin specific props
  onImport?: () => void;
  onAdd?: () => void;
  // Contest specific props
  currentUserRole?: string;
  onRowClick?: (problem: ProblemRowData) => void;
}

const ProblemTable: React.FC<ProblemTableProps> = ({
  problems,
  mode,
  onAction,
  onImport,
  onAdd,
  onRowClick,
  loading = false,
}: ProblemTableProps) => {
  const { t: tc } = useTranslation('common');
  
  const getAcceptanceRate = (problem: ProblemRowData) => {
    if (!problem.submissionCount) return "0%";
    return `${(
      ((problem.acceptedCount || 0) / problem.submissionCount) *
      100
    ).toFixed(1)}%`;
  };

  const getHeaders = () => {
    if (mode === "student") {
      return [
        { key: "title", header: tc('table.title') },
        { key: "tags", header: "標籤" },
        { key: "difficulty", header: "難度" },
        { key: "acceptance_rate", header: "通過率" },
      ];
    }
    if (mode === "contest") {
      const headers = [
        { key: "label", header: "標號" },
        { key: "title", header: tc('table.title') },
        { key: "difficulty", header: "難度" },
        { key: "tags", header: "標籤" },
        { key: "score", header: "分數" },
      ];
      if (onAction) {
        headers.push({ key: "actions", header: tc('table.actions') });
      }
      return headers;
    }
    // Admin mode - simplified columns
    return [
      { key: "title", header: "題目" },
      { key: "difficulty", header: "難度" },
      { key: "tags", header: "標籤" },
      { key: "visibility", header: "狀態" },
      { key: "actions", header: "" },
    ];
  };

  const rows = problems.map((p) => ({
    ...p,
    id: p.id?.toString() || "",
    title: p.title || "",
    difficulty: p.difficulty || "",
    createdAt: p.createdAt || "",
  }));

  return (
    <DataTable rows={rows} headers={getHeaders()}>
      {({
        rows,
        headers,
        getTableProps,
        getHeaderProps,
        getRowProps,
        onInputChange,
      }) => (
        <TableContainer>
          {(mode === "admin" ||
            mode === "student" ||
            (mode === "contest" && (!!onAdd || !!onImport))) && (
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch
                  onChange={(e) => {
                    if (e && typeof e !== "string") onInputChange(e);
                  }}
                  placeholder="搜尋題目..."
                />
                {(mode === "admin" || mode === "contest") && onImport && (
                  <Button
                    kind="secondary"
                    renderIcon={Upload}
                    onClick={onImport}
                  >
                    匯入 YAML
                  </Button>
                )}
                {(mode === "admin" || mode === "contest") && onAdd && (
                  <Button kind="primary" renderIcon={Add} onClick={onAdd}>
                    新增題目
                  </Button>
                )}
              </TableToolbarContent>
            </TableToolbar>
          )}
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => {
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
              {loading
                ? // Skeleton Rows
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {headers.map((header) => (
                        <TableCell key={header.key}>
                          <SkeletonText />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row) => {
                    const problem = problems.find(
                      (p) => String(p.id) === String(row.id)
                    );
                    if (!problem) return null;

                    const { key: rowKey, ...rowProps } = getRowProps({ row });
                    return (
                      <TableRow
                        key={rowKey}
                        {...rowProps}
                        onClick={() => onRowClick?.(problem)}
                        style={onRowClick ? { cursor: "pointer" } : undefined}
                        className={onRowClick ? "clickable-row" : undefined}
                      >
                        {mode === "contest" ? (
                          // Contest Mode Columns
                          <>
                            <TableCell>
                              <Tag type="cyan">{problem.label}</Tag>
                            </TableCell>
                            <TableCell>{problem.title}</TableCell>
                            <TableCell>
                              <DifficultyBadge
                                difficulty={problem.difficulty || "medium"}
                              />
                            </TableCell>
                            <TableCell>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.25rem",
                                  flexWrap: "wrap",
                                }}
                              >
                                {problem.tags && problem.tags.length > 0 ? (
                                  problem.tags.map((tag) => (
                                    <Tag
                                      key={tag.id}
                                      type="outline"
                                      style={
                                        tag.color
                                          ? {
                                              backgroundColor: `${tag.color}15`,
                                              color: tag.color,
                                              borderColor: tag.color,
                                            }
                                          : undefined
                                      }
                                    >
                                      {tag.name}
                                    </Tag>
                                  ))
                                ) : (
                                  <span
                                    style={{
                                      color: "var(--cds-text-secondary)",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    -
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{problem.score}</TableCell>
                            {onAction && (
                              <TableCell>
                                <div
                                  style={{ display: "flex", gap: "0.25rem" }}
                                >
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    hasIconOnly
                                    renderIcon={CaretUp}
                                    iconDescription="往上移動"
                                    tooltipPosition="bottom"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAction?.("move_up", problem);
                                    }}
                                  />
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    hasIconOnly
                                    renderIcon={CaretDown}
                                    iconDescription="往下移動"
                                    tooltipPosition="bottom"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAction?.("move_down", problem);
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: "1px",
                                      backgroundColor:
                                        "var(--cds-border-subtle)",
                                      margin: "0 0.25rem",
                                    }}
                                  />
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    renderIcon={TrashCan}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAction?.("delete", problem);
                                    }}
                                    style={{ color: "var(--cds-text-error)" }}
                                  >
                                    移除
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </>
                        ) : mode === "student" ? (
                          // Student Mode Columns
                          <>
                            <TableCell>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                }}
                              >
                                {problem.isSolved && (
                                  <div
                                    style={{
                                      color: "var(--cds-support-success)",
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    <CheckmarkOutline size={16} />
                                  </div>
                                )}
                                <Link
                                  to={`/problems/${
                                    problem.displayId || problem.id
                                  }`}
                                  style={{
                                    textDecoration: "none",
                                    color: "var(--cds-link-primary)",
                                    fontWeight: 500,
                                    fontSize: "1rem",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {problem.title}
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.25rem",
                                  flexWrap: "wrap",
                                }}
                              >
                                {problem.tags && problem.tags.length > 0 ? (
                                  problem.tags.map((tag) => (
                                    <Tag
                                      key={tag.id}
                                      type="outline"
                                      size="sm"
                                      style={
                                        tag.color
                                          ? {
                                              backgroundColor: `${tag.color}15`,
                                              color: tag.color,
                                              borderColor: tag.color,
                                            }
                                          : undefined
                                      }
                                    >
                                      {tag.name}
                                    </Tag>
                                  ))
                                ) : (
                                  <span
                                    style={{
                                      color: "var(--cds-text-secondary)",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    -
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DifficultyBadge
                                difficulty={problem.difficulty || "medium"}
                              />
                            </TableCell>
                            <TableCell>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ fontWeight: 600 }}>
                                  {getAcceptanceRate(problem)}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--cds-text-secondary)",
                                    marginLeft: "0.5rem",
                                  }}
                                >
                                  ({problem.acceptedCount || 0}/
                                  {problem.submissionCount || 0})
                                </span>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          // Admin Mode Columns (simplified)
                          <>
                            <TableCell>
                              <div style={{ fontWeight: 500 }}>
                                {problem.title}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DifficultyBadge
                                difficulty={problem.difficulty || "medium"}
                              />
                            </TableCell>
                            <TableCell>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.25rem",
                                  flexWrap: "wrap",
                                }}
                              >
                                {problem.tags && problem.tags.length > 0 ? (
                                  problem.tags.map((tag) => (
                                    <Tag
                                      key={tag.id}
                                      type="outline"
                                      style={
                                        tag.color
                                          ? {
                                              backgroundColor: `${tag.color}15`,
                                              color: tag.color,
                                              borderColor: tag.color,
                                            }
                                          : undefined
                                      }
                                    >
                                      {tag.name}
                                    </Tag>
                                  ))
                                ) : (
                                  <span
                                    style={{
                                      color: "var(--cds-text-secondary)",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    -
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {problem.isVisible ? (
                                <Tag type="green">可見</Tag>
                              ) : (
                                <Tag type="gray">隱藏</Tag>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAction?.("edit", problem);
                                }}
                              >
                                編輯
                              </Button>
                            </TableCell>
                          </>
                        )}
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

export default ProblemTable;
