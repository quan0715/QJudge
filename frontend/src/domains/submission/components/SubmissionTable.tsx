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
  TableToolbar,
  TableToolbarContent,
  Tag,
  Button,
  Dropdown,
  Toggle,
} from "@carbon/react";
import { View, Renew } from "@carbon/icons-react";

export interface SubmissionRow {
  id: string;
  status: string;
  problem_id?: number;
  problem_title?: string;
  username?: string;
  userId?: string; // For permission check
  language: string;
  score: number;
  exec_time: number;
  created_at: string;
  canView?: boolean; // Whether current user can view details
}

// Status filter options (exported for reuse)
export const STATUS_OPTIONS = [
  { id: "all", label: "全部狀態" },
  { id: "AC", label: "通過 (AC)" },
  { id: "WA", label: "答案錯誤 (WA)" },
  { id: "TLE", label: "超時 (TLE)" },
  { id: "MLE", label: "記憶體超限 (MLE)" },
  { id: "RE", label: "執行錯誤 (RE)" },
  { id: "CE", label: "編譯錯誤 (CE)" },
] as const;

export type StatusFilterType = (typeof STATUS_OPTIONS)[number]["id"];

interface SubmissionTableProps {
  submissions: SubmissionRow[];
  onViewDetails: (submissionId: string) => void;
  showProblem?: boolean;
  showUser?: boolean;
  showScore?: boolean;
  // Toolbar props (optional)
  showToolbar?: boolean;
  statusFilter?: StatusFilterType;
  onStatusFilterChange?: (status: StatusFilterType) => void;
  onlyMine?: boolean;
  onOnlyMineChange?: (value: boolean) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const SubmissionTable: React.FC<SubmissionTableProps> = ({
  submissions,
  onViewDetails,
  showProblem = true,
  showUser = true,
  showScore = true,
  // Toolbar props
  showToolbar = false,
  statusFilter = "all",
  onStatusFilterChange,
  onlyMine = false,
  onOnlyMineChange,
  onRefresh,
  isRefreshing = false,
}) => {
  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { type: any; label: string }> = {
      AC: { type: "green", label: "AC" },
      WA: { type: "red", label: "WA" },
      TLE: { type: "magenta", label: "TLE" },
      MLE: { type: "magenta", label: "MLE" },
      RE: { type: "red", label: "RE" },
      CE: { type: "gray", label: "CE" },
      pending: { type: "gray", label: "Pending" },
      judging: { type: "blue", label: "Judging" },
      SE: { type: "red", label: "SE" },
    };

    const config = statusConfig[status] || { type: "gray", label: status };
    return (
      <Tag type={config.type} size="sm">
        {config.label}
      </Tag>
    );
  };

  const getLanguageLabel = (lang: string) => {
    const langMap: Record<string, string> = {
      cpp: "C++",
      python: "Python",
      java: "Java",
      javascript: "JavaScript",
      c: "C",
    };
    return langMap[lang] || lang;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Build headers dynamically based on what should be shown
  const headers: { key: string; header: string }[] = [
    { key: "id", header: "ID" },
    { key: "status", header: "狀態" },
  ];

  if (showProblem) {
    headers.push({ key: "problem", header: "題目" });
  }

  if (showUser) {
    headers.push({ key: "username", header: "用戶" });
  }

  headers.push({ key: "language", header: "語言" });

  if (showScore) {
    headers.push({ key: "score", header: "得分" });
  }

  headers.push(
    { key: "time", header: "時間" },
    { key: "created_at", header: "提交時間" },
    { key: "actions", header: "操作" }
  );

  // Build rows
  const rows = submissions.map((sub) => {
    const row: Record<string, any> = {
      id: sub.id,
      status: getStatusTag(sub.status),
      language: getLanguageLabel(sub.language),
      time: `${sub.exec_time} ms`,
      created_at: formatDate(sub.created_at),
    };

    // Conditionally render view button based on canView permission
    row.actions =
      sub.canView !== false ? (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={View}
          iconDescription="查看詳情"
          hasIconOnly
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(sub.id);
          }}
        />
      ) : (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={View}
          iconDescription="無權限查看"
          hasIconOnly
          disabled
        />
      );

    if (showProblem && sub.problem_title) {
      row.problem = (
        <span style={{ fontWeight: 500 }}>{sub.problem_title}</span>
      );
    }

    if (showUser && sub.username) {
      row.username = sub.username;
    }

    if (showScore) {
      row.score = sub.score;
    }

    return row;
  });

  return (
    <DataTable
      rows={rows.map((r, i) => ({ ...r, id: r.id || i.toString() }))}
      headers={headers}
    >
      {({ rows, headers, getTableProps, getHeaderProps, getRowProps }: any) => (
        <TableContainer
          title=""
          description=""
          style={{
            backgroundColor: "transparent",
            padding: "0",
            boxShadow: "none",
          }}
        >
          {showToolbar && (
            <TableToolbar
              style={{
                backgroundColor: "var(--cds-layer-01)",
                borderBottom: "1px solid var(--cds-border-subtle)",
              }}
            >
              <TableToolbarContent
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "0.5rem 1rem",
                }}
              >
                {/* Left side: Filters */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "1rem" }}
                >
                  {/* Status Filter Dropdown */}
                  {onStatusFilterChange && (
                    <Dropdown
                      id="status-filter-dropdown"
                      titleText=""
                      label="狀態篩選"
                      size="sm"
                      items={STATUS_OPTIONS.map((opt) => opt)}
                      itemToString={(
                        item: (typeof STATUS_OPTIONS)[number] | null
                      ) => (item ? item.label : "")}
                      selectedItem={
                        STATUS_OPTIONS.find((s) => s.id === statusFilter) ||
                        STATUS_OPTIONS[0]
                      }
                      onChange={({
                        selectedItem,
                      }: {
                        selectedItem: (typeof STATUS_OPTIONS)[number] | null;
                      }) => {
                        if (selectedItem) {
                          onStatusFilterChange(selectedItem.id);
                        }
                      }}
                      style={{ minWidth: "140px" }}
                    />
                  )}

                  {/* Only My Submissions Toggle */}
                  {onOnlyMineChange && (
                    <Toggle
                      id="only-mine-toggle"
                      size="sm"
                      labelText=""
                      labelA="全部"
                      labelB="我的"
                      toggled={onlyMine}
                      onToggle={(checked: boolean) => onOnlyMineChange(checked)}
                    />
                  )}
                </div>

                {/* Right side: Actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {onRefresh && (
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Renew}
                      onClick={onRefresh}
                      disabled={isRefreshing}
                      iconDescription="重新整理"
                    >
                      {isRefreshing ? "更新中..." : "重新整理"}
                    </Button>
                  )}
                </div>
              </TableToolbarContent>
            </TableToolbar>
          )}
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header: any) => {
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
              {rows.map((row: any) => {
                const { key, ...rowProps } = getRowProps({ row });
                return (
                  <TableRow
                    key={key}
                    {...rowProps}
                    onClick={() => onViewDetails(row.id)}
                    style={{ cursor: "pointer" }}
                    className="submission-row"
                  >
                    {row.cells.map((cell: any) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
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

export default SubmissionTable;
