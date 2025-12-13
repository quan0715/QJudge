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
import { useTranslation } from "react-i18next";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { useContest } from "@/domains/contest/contexts/ContestContext";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import { useTheme } from "@/ui/theme/ThemeContext";

const ContestAdminLogsPage = () => {
  const { t } = useTranslation("contest");
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
      data.push({ date, value: counts.violation, group: t("logs.chartGroups.violation") });
      data.push({ date, value: counts.submission, group: t("logs.chartGroups.submission") });
      data.push({ date, value: counts.lifecycle, group: t("logs.chartGroups.lifecycle") });
      data.push({ date, value: counts.admin, group: t("logs.chartGroups.admin") });
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
          title: t("logs.axes.time"),
        },
        left: {
          mapsTo: "value",
          title: t("logs.axes.eventCount"),
          scaleType: ScaleTypes.LINEAR,
        },
      },
      curve: "curveMonotoneX",
      height: "300px",
      theme: theme === "g100" ? "g100" : "white",
      color: {
        scale: {
          [t("logs.chartGroups.violation")]: "#da1e28",
          [t("logs.chartGroups.submission")]: "#0f62fe",
          [t("logs.chartGroups.lifecycle")]: "#24a148",
          [t("logs.chartGroups.admin")]: "#8a3ffc",
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
    [theme, t]
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
    const eventMap: Record<string, { labelKey: string; type: any }> = {
      // Registration/Join events
      join: { labelKey: "logs.eventTypes.join", type: "green" },
      register: { labelKey: "logs.eventTypes.register", type: "green" },
      unregister: { labelKey: "logs.eventTypes.unregister", type: "gray" },
      enter_contest: { labelKey: "logs.eventTypes.enter_contest", type: "blue" },
      leave: { labelKey: "logs.eventTypes.leave", type: "gray" },

      // Exam lifecycle events
      start_exam: { labelKey: "logs.eventTypes.start_exam", type: "cyan" },
      end_exam: { labelKey: "logs.eventTypes.end_exam", type: "magenta" },
      auto_submit: { labelKey: "logs.eventTypes.auto_submit", type: "magenta" },
      resume_exam: { labelKey: "logs.eventTypes.resume_exam", type: "cyan" },
      reopen_exam: { labelKey: "logs.eventTypes.reopen_exam", type: "teal" },
      pause_exam: { labelKey: "logs.eventTypes.pause_exam", type: "gray" },

      // Submission events
      submit: { labelKey: "logs.eventTypes.submit", type: "blue" },
      submit_code: { labelKey: "logs.eventTypes.submit_code", type: "purple" },

      // Cheat detection events (from ExamEvent)
      tab_switch: { labelKey: "logs.eventTypes.tab_switch", type: "red" },
      tab_hidden: { labelKey: "logs.eventTypes.tab_hidden", type: "red" },
      window_blur: { labelKey: "logs.eventTypes.window_blur", type: "red" },
      exit_fullscreen: { labelKey: "logs.eventTypes.exit_fullscreen", type: "red" },
      forbidden_focus_event: { labelKey: "logs.eventTypes.forbidden_focus_event", type: "red" },
      cheat_warning: { labelKey: "logs.eventTypes.cheat_warning", type: "red" },

      // Lock/Unlock events
      lock: { labelKey: "logs.eventTypes.lock", type: "red" },
      lock_user: { labelKey: "logs.eventTypes.lock_user", type: "red" },
      unlock: { labelKey: "logs.eventTypes.unlock", type: "teal" },
      unlock_user: { labelKey: "logs.eventTypes.unlock_user", type: "teal" },

      // Q&A events
      ask_question: { labelKey: "logs.eventTypes.ask_question", type: "blue" },
      reply_question: { labelKey: "logs.eventTypes.reply_question", type: "blue" },
      announce: { labelKey: "logs.eventTypes.announce", type: "magenta" },

      // Admin/Management events
      update_contest: { labelKey: "logs.eventTypes.update_contest", type: "cool-gray" },
      update_problem: { labelKey: "logs.eventTypes.update_problem", type: "gray" },
      update_participant: { labelKey: "logs.eventTypes.update_participant", type: "gray" },
      publish_problem_to_practice: { labelKey: "logs.eventTypes.publish_problem_to_practice", type: "cool-gray" },
      other: { labelKey: "logs.eventTypes.other", type: "outline" },
    };

    const config = eventMap[type] || { labelKey: "logs.eventTypes.other", type: "outline" };
    return (
      <Tag type={config.type} size="sm">
        {t(config.labelKey)}
      </Tag>
    );
  };

  const headers = [
    { key: "timestamp", header: t("logs.table.headers.timestamp") },
    { key: "userName", header: t("logs.table.headers.userName") },
    { key: "eventType", header: t("logs.table.headers.eventType") },
    { key: "reason", header: t("logs.table.headers.reason") },
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
            title={t(`logs.notification.${notification.kind}`)}
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
              title={t("logs.eventTimeline")}
              style={{ marginBottom: "1rem" }}
              action={
                <Toggle
                  id="show-chart-toggle"
                  size="sm"
                  labelA={t("logs.chart.toggle.hide")}
                  labelB={t("logs.chart.toggle.show")}
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
                    <span>{t("logs.chart.statsNote")}</span>
                    {contest?.startTime && (
                      <span>
                        {t("logs.chart.examStart")}{" "}
                        {new Date(contest.startTime).toLocaleString()}
                      </span>
                    )}
                    {contest?.endTime &&
                      new Date(contest.endTime) < new Date() && (
                        <span>
                          {t("logs.chart.examEnd")}{" "}
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
                  {t("logs.chart.noData")}
                </div>
              ) : null}
            </ContainerCard>

            {/* Event Table */}
            <ContainerCard
              title={t("logs.title")}
              noPadding
              action={
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={refreshAdminData}
                  hasIconOnly
                  iconDescription={t("logs.refresh")}
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
                          placeholder={t("logs.table.searchPlaceholder")}
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
                backwardText={t("logs.pagination.backwardText")}
                forwardText={t("logs.pagination.forwardText")}
                itemsPerPageText={t("logs.pagination.itemsPerPageText")}
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
