import { useMemo } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  InlineNotification,
} from "@carbon/react";
import type { ExamEventStats, ExamEvent } from "@/core/entities/contest.entity";
import { useContest } from "@/domains/contest/contexts/ContestContext";

const ExamEventStatsComponent: React.FC = () => {
  // Use examEvents from context - no local fetch needed, no timer
  const { examEvents, isRefreshing } = useContest();

  // Aggregate events by user
  const stats = useMemo(() => {
    const userMap = new Map<string, ExamEventStats>();

    examEvents.forEach((event: ExamEvent) => {
      const eventRaw = event as any; // For access to raw fields
      const userId = eventRaw.userId || eventRaw.user_id || "unknown";

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          userId: userId,
          userName: event.userName || eventRaw.student_name || "Unknown",
          tabHiddenCount: 0,
          windowBlurCount: 0,
          exitFullscreenCount: 0,
          forbiddenFocusEventCount: 0,
          totalViolations: 0,
        });
      }

      const userStats = userMap.get(userId)!;

      switch (event.eventType) {
        case "tab_hidden":
          userStats.tabHiddenCount++;
          userStats.totalViolations++;
          break;
        case "window_blur":
          userStats.windowBlurCount++;
          userStats.totalViolations++;
          break;
        case "exit_fullscreen":
          userStats.exitFullscreenCount++;
          userStats.totalViolations++;
          break;
        case "forbidden_focus_event":
          userStats.forbiddenFocusEventCount++;
          userStats.totalViolations++;
          break;
      }
    });

    return Array.from(userMap.values());
  }, [examEvents]);

  const headers = [
    { key: "userName", header: "參賽者" },
    { key: "tabHiddenCount", header: "切換分頁" },
    { key: "windowBlurCount", header: "視窗失焦" },
    { key: "exitFullscreenCount", header: "退出全螢幕" },
    { key: "forbiddenFocusEventCount", header: "焦點異常" },
    { key: "totalViolations", header: "總違規次數" },
  ];

  const rows = stats.map((stat) => ({
    id: stat.userId,
    userName: stat.userName,
    tabHiddenCount: stat.tabHiddenCount,
    windowBlurCount: stat.windowBlurCount,
    exitFullscreenCount: stat.exitFullscreenCount,
    forbiddenFocusEventCount: stat.forbiddenFocusEventCount,
    totalViolations: stat.totalViolations,
  }));

  if (isRefreshing && stats.length === 0) {
    return <div>載入中...</div>;
  }

  if (stats.length === 0) {
    return (
      <InlineNotification
        kind="info"
        title="暫無事件記錄"
        subtitle="目前沒有記錄到任何考試違規事件"
        lowContrast
      />
    );
  }

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
        <TableContainer title="考試事件統計">
          <Table {...getTableProps()} size="md">
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
              {rows.map((row) => {
                const hasViolations = parseInt(row.cells[5].value) > 0;
                const { key, ...rowProps } = getRowProps({ row });
                return (
                  <TableRow
                    key={key}
                    {...rowProps}
                    style={
                      hasViolations
                        ? { backgroundColor: "var(--cds-layer-accent-01)" }
                        : {}
                    }
                  >
                    {row.cells.map((cell) => (
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

export default ExamEventStatsComponent;
