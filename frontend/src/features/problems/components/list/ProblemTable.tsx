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
  SkeletonText,
} from "@carbon/react";
import { Upload, Add } from "@carbon/icons-react";
import type { Problem } from "@/core/entities/problem.entity";
import ProblemTableRow from "./ProblemTableRow";

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
  mode: "admin" | "contest" | "student" | "lab";
  loading?: boolean;
  onAction?: (action: string, problem: ProblemRowData) => void;
  // Admin/Lab specific props
  onImport?: () => void;
  onAdd?: () => void;
  // Contest specific props
  currentUserRole?: string;
  onRowClick?: (problem: ProblemRowData) => void;
  // Hide toolbar search (when using external filter sidebar)
  hideToolbarSearch?: boolean;
}

const ProblemTable: React.FC<ProblemTableProps> = ({
  problems,
  mode,
  onAction,
  onImport,
  onAdd,
  onRowClick,
  loading = false,
  hideToolbarSearch = false,
}: ProblemTableProps) => {
  const { t: tc } = useTranslation('common');
  
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
    if (mode === "lab") {
      // Lab mode - for managing problems within a lab
      return [
        { key: "title", header: "題目" },
        { key: "difficulty", header: "難度" },
        { key: "tags", header: "標籤" },
        { key: "actions", header: "" },
      ];
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

  // Build a Map for O(1) problem lookup by ID (avoids O(n²) with find() in render)
  const problemMap = new Map(problems.map((p) => [String(p.id), p]));

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
          {/* Show toolbar when: admin/lab mode, or student mode without hideToolbarSearch, or contest with actions */}
          {((mode === "admin" || mode === "lab") ||
            (mode === "student" && !hideToolbarSearch) ||
            (mode === "contest" && (!!onAdd || !!onImport))) && (
            <TableToolbar>
              <TableToolbarContent>
                {!hideToolbarSearch && (
                  <TableToolbarSearch
                    onChange={(e) => {
                      if (e && typeof e !== "string") onInputChange(e);
                    }}
                    placeholder="搜尋題目..."
                  />
                )}
                {(mode === "admin" || mode === "contest") && onImport && (
                  <Button
                    kind="secondary"
                    renderIcon={Upload}
                    onClick={onImport}
                  >
                    匯入 YAML
                  </Button>
                )}
                {(mode === "admin" || mode === "contest" || mode === "lab") && onAdd && (
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
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {headers.map((header) => (
                        <TableCell key={header.key}>
                          <SkeletonText />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row) => {
                    const problem = problemMap.get(String(row.id));
                    if (!problem) return null;

                    const { key: rowKey, ...rowProps } = getRowProps({ row });
                    return (
                      <ProblemTableRow
                        key={rowKey}
                        rowKey={rowKey}
                        rowProps={rowProps}
                        mode={mode}
                        problem={problem}
                        onRowClick={onRowClick}
                        onAction={onAction}
                      />
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
