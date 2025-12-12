import { useState, useEffect, useMemo } from "react";
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
  Loading,
  InlineNotification,
  Pagination,
  Tag,
  Toggle,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { LineChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { useContest } from "@/domains/contest/contexts/ContestContext";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import { useTheme } from "@/ui/theme/ThemeContext";

const ContestAdminLogsPage = () => {
  // Use examEvents from context - no local fetch needed
  const { examEvents, isRefreshing, refreshAdminData, contest } = useContest();
  const { theme } = useTheme();

  const [filteredEvents, setFilteredEvents] = useState<ExamEvent[]>([]);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showChart, setShowChart] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Sort events by timestamp (most recent first)
  const sortedEvents = useMemo(() => {
    return [...examEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [examEvents]);

  // Event categories for chart
  const eventCategories = useMemo(() => {
    return {
      violation: [
        "tab_hidden",
        "window_blur",
        "exit_fullscreen",
        "forbidden_focus_event",
        "lock_user",
      ],
      submission: ["submit", "submit_code"],
      lifecycle: [
        "start_exam",
        "end_exam",
        "auto_submit",
        "resume_exam",
        "reopen_exam",
      ],
      admin: [
        "register",
        "unregister",
        "unlock_user",
        "update_participant",
        "announce",
        "reply_question",
      ],
    };
  }, []);

  // Prepare timeline chart data
  const timelineChartData = useMemo(() => {
    if (!contest) return [];

    const startTime = contest.startTime ? new Date(contest.startTime) : null;
    const endTime = contest.endTime ? new Date(contest.endTime) : new Date();
    const now = new Date();
    const effectiveEndTime = endTime && endTime < now ? endTime : now;

    if (!startTime) return [];

    // Group events by 5-minute intervals
    const intervalMs = 5 * 60 * 1000; // 5 minutes
    const intervals: Map<
      number,
      {
        violation: number;
        submission: number;
        lifecycle: number;
        admin: number;
      }
    > = new Map();

    // Initialize intervals from start to end
    let currentTime = startTime.getTime();
    while (currentTime <= effectiveEndTime.getTime()) {
      intervals.set(currentTime, {
        violation: 0,
        submission: 0,
        lifecycle: 0,
        admin: 0,
      });
      currentTime += intervalMs;
    }

    // Count events in each interval
    examEvents.forEach((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      if (
        eventTime < startTime.getTime() ||
        eventTime > effectiveEndTime.getTime()
      )
        return;

      // Find the interval this event belongs to
      const intervalStart =
        Math.floor((eventTime - startTime.getTime()) / intervalMs) *
          intervalMs +
        startTime.getTime();

      if (!intervals.has(intervalStart)) {
        intervals.set(intervalStart, {
          violation: 0,
          submission: 0,
          lifecycle: 0,
          admin: 0,
        });
      }

      const counts = intervals.get(intervalStart)!;

      if (eventCategories.violation.includes(event.eventType)) {
        counts.violation++;
      } else if (eventCategories.submission.includes(event.eventType)) {
        counts.submission++;
      } else if (eventCategories.lifecycle.includes(event.eventType)) {
        counts.lifecycle++;
      } else if (eventCategories.admin.includes(event.eventType)) {
        counts.admin++;
      }
    });

    // Convert to chart data format
    const data: { date: Date; value: number; group: string }[] = [];
    const sortedIntervals = Array.from(intervals.entries()).sort(
      (a, b) => a[0] - b[0]
    );

    sortedIntervals.forEach(([timestamp, counts]) => {
      const date = new Date(timestamp);
      data.push({ date, value: counts.violation, group: "違規事件" });
      data.push({ date, value: counts.submission, group: "程式提交" });
      data.push({ date, value: counts.lifecycle, group: "考試狀態" });
      data.push({ date, value: counts.admin, group: "管理操作" });
    });

    return data;
  }, [examEvents, contest, eventCategories]);

  // Chart options
  const chartOptions = useMemo(
    () => ({
      title: "",
      axes: {
        bottom: {
          mapsTo: "date",
          scaleType: ScaleTypes.TIME,
          title: "時間",
        },
        left: {
          mapsTo: "value",
          title: "事件數量",
          scaleType: ScaleTypes.LINEAR,
        },
      },
      curve: "curveMonotoneX",
      height: "300px",
      theme: theme === "g100" ? "g100" : "white",
      color: {
        scale: {
          違規事件: "#da1e28",
          程式提交: "#0f62fe",
          考試狀態: "#24a148",
          管理操作: "#8a3ffc",
        },
      },
      legend: {
        alignment: "center" as const,
        position: "bottom" as const,
      },
      points: {
        enabled: false,
      },
      toolbar: { enabled: false },
      tooltip: {
        showTotal: false,
      },
    }),
    [theme]
  );

  // Filter events when search term changes
  useEffect(() => {
    if (!searchTerm) {
      setFilteredEvents(sortedEvents);
    } else {
      const lowerSearch = searchTerm.toLowerCase();
      const filtered = sortedEvents.filter(
        (e) =>
          e.userName?.toLowerCase().includes(lowerSearch) ||
          e.eventType?.toLowerCase().includes(lowerSearch) ||
          e.reason?.toLowerCase().includes(lowerSearch)
      );
      setFilteredEvents(filtered);
    }
    setPage(1); // Reset to first page on search
  }, [searchTerm, sortedEvents]);

  // Comprehensive event type mapping
  const getEventTag = (type: string) => {
    const eventMap: Record<string, { label: string; type: any }> = {
      // Registration/Join events
      join: { label: "加入", type: "green" },
      register: { label: "註冊", type: "green" },
      unregister: { label: "取消註冊", type: "gray" },
      enter_contest: { label: "進入競賽", type: "blue" },
      leave: { label: "離開競賽", type: "gray" },

      // Exam lifecycle events
      start_exam: { label: "開始考試", type: "cyan" },
      end_exam: { label: "結束考試", type: "magenta" },
      auto_submit: { label: "自動提交", type: "magenta" },
      resume_exam: { label: "繼續考試", type: "cyan" },
      reopen_exam: { label: "重新開放考試", type: "teal" },
      pause_exam: { label: "暫停考試", type: "gray" },

      // Submission events
      submit: { label: "提交", type: "blue" },
      submit_code: { label: "提交程式碼", type: "purple" },

      // Cheat detection events (from ExamEvent)
      tab_switch: { label: "切換分頁", type: "red" },
      tab_hidden: { label: "隱藏分頁", type: "red" },
      window_blur: { label: "離開視窗", type: "red" },
      exit_fullscreen: { label: "退出全螢幕", type: "red" },
      forbidden_focus_event: { label: "禁止焦點事件", type: "red" },
      cheat_warning: { label: "違規警告", type: "red" },

      // Lock/Unlock events
      lock: { label: "鎖定", type: "red" },
      lock_user: { label: "鎖定用戶", type: "red" },
      unlock: { label: "解鎖", type: "teal" },
      unlock_user: { label: "解鎖用戶", type: "teal" },

      // Q&A events
      ask_question: { label: "提問", type: "blue" },
      reply_question: { label: "回覆提問", type: "blue" },
      announce: { label: "發布公告", type: "magenta" },

      // Admin/Management events
      update_contest: { label: "更新競賽設定", type: "cool-gray" },
      update_problem: { label: "更新題目", type: "gray" },
      update_participant: { label: "更新參與者", type: "gray" },
      publish_problem_to_practice: { label: "發布到練習區", type: "cool-gray" },
      other: { label: "其他", type: "outline" },
    };

    const config = eventMap[type] || { label: type, type: "outline" };
    return (
      <Tag type={config.type} size="sm">
        {config.label}
      </Tag>
    );
  };

  const headers = [
    { key: "timestamp", header: "時間" },
    { key: "userName", header: "使用者" },
    { key: "eventType", header: "事件類型" },
    { key: "reason", header: "詳細內容" },
  ];

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  const loading = examEvents.length === 0 && isRefreshing;

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div
        style={{
          padding: "0",
          maxWidth: "100%",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        {loading ? (
          <Loading withOverlay={false} />
        ) : (
          <>
            {/* Timeline Chart */}
            <ContainerCard
              title="事件時序圖"
              style={{ marginBottom: "1rem" }}
              action={
                <Toggle
                  id="show-chart-toggle"
                  size="sm"
                  labelA="隱藏"
                  labelB="顯示"
                  toggled={showChart}
                  onToggle={() => setShowChart(!showChart)}
                />
              }
            >
              {showChart && timelineChartData.length > 0 ? (
                <div style={{ padding: "1rem 0" }}>
                  <LineChart data={timelineChartData} options={chartOptions} />
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      justifyContent: "center",
                      marginTop: "0.5rem",
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    <span>📊 每 5 分鐘統計一次事件數量</span>
                    {contest?.startTime && (
                      <span>
                        🕐 考試開始:{" "}
                        {new Date(contest.startTime).toLocaleString()}
                      </span>
                    )}
                    {contest?.endTime &&
                      new Date(contest.endTime) < new Date() && (
                        <span>
                          🏁 考試結束:{" "}
                          {new Date(contest.endTime).toLocaleString()}
                        </span>
                      )}
                  </div>
                </div>
              ) : showChart ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  暫無事件資料可供視覺化
                </div>
              ) : null}
            </ContainerCard>

            {/* Event Table */}
            <ContainerCard
              title="考試紀錄"
              noPadding
              action={
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={refreshAdminData}
                  hasIconOnly
                  iconDescription="重新整理"
                  disabled={isRefreshing}
                />
              }
            >
              <DataTable
                rows={paginatedEvents.map((e, index) => ({
                  ...e,
                  id: e.id ? e.id.toString() : index.toString(),
                  userName: e.userName || "Unknown",
                  reason: e.reason || "-",
                }))}
                headers={headers}
              >
                {({
                  rows,
                  headers,
                  getHeaderProps,
                  getRowProps,
                  getTableProps,
                }: any) => (
                  <TableContainer>
                    <TableToolbar>
                      <TableToolbarContent>
                        <TableToolbarSearch
                          onChange={(e: any) =>
                            setSearchTerm(e.target?.value || "")
                          }
                          placeholder="搜尋事件..."
                          persistent
                        />
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header: any) => {
                            const { key, ...headerProps } = getHeaderProps({
                              header,
                            });
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
                          const event = filteredEvents.find(
                            (e, i) =>
                              (e.id ? e.id.toString() : i.toString()) === row.id
                          );
                          const { key: rowKey, ...rowProps } = getRowProps({
                            row,
                          });
                          return (
                            <TableRow key={rowKey} {...rowProps}>
                              <TableCell>
                                {new Date(
                                  row.cells.find(
                                    (c: any) => c.info.header === "timestamp"
                                  )?.value
                                ).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                {
                                  row.cells.find(
                                    (c: any) => c.info.header === "userName"
                                  )?.value
                                }
                              </TableCell>
                              <TableCell>
                                {event
                                  ? getEventTag(event.eventType)
                                  : row.cells.find(
                                      (c: any) => c.info.header === "eventType"
                                    )?.value}
                              </TableCell>
                              <TableCell>
                                {
                                  row.cells.find(
                                    (c: any) => c.info.header === "reason"
                                  )?.value
                                }
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
              <Pagination
                totalItems={filteredEvents.length}
                backwardText="上一頁"
                forwardText="下一頁"
                itemsPerPageText="每頁顯示"
                page={page}
                pageSize={pageSize}
                pageSizes={[20, 50, 100, 200]}
                onChange={({ page: newPage, pageSize: newPageSize }: any) => {
                  setPage(newPage);
                  setPageSize(newPageSize);
                }}
              />
            </ContainerCard>
          </>
        )}
      </div>
    </SurfaceSection>
  );
};

export default ContestAdminLogsPage;
