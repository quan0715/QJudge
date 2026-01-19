import React, { useMemo, useState } from "react";
import {
  Grid,
  Column,
  SkeletonText,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
} from "@carbon/react";
import { DonutChart, AreaChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import { Trophy, Time, Analytics } from "@carbon/icons-react";
import { IconButton } from "@carbon/react";
import "@carbon/charts-react/styles.css";
import ContainerCard from "@/shared/layout/ContainerCard";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import {
  useProblemStatistics,
  useProblemLeaderboard,
} from "@/features/problems/hooks/useProblem";
import "./ProblemStatsTab.scss";

interface StatusCount {
  group: string;
  value: number;
}

interface TrendData {
  group: string;
  date: Date;
  value: number;
}

// Nested donut chart data
interface NestedDonutData {
  outer: StatusCount[]; // AC vs Non-AC
  inner: StatusCount[]; // Full distribution
}

// Helper to build nested donut data
const buildNestedDonutData = (
  ac: number,
  wa: number,
  tle: number,
  mle: number,
  re: number,
  ce: number
): NestedDonutData => {
  const nonAc = wa + tle + mle + re + ce;

  // Outer ring: AC vs Non-AC
  const outer: StatusCount[] = [];
  if (ac > 0) outer.push({ group: "通過 (AC)", value: ac });
  if (nonAc > 0) outer.push({ group: "未通過", value: nonAc });

  // Inner ring: Full distribution
  const inner: StatusCount[] = [];
  if (ac > 0) inner.push({ group: "通過 (AC)", value: ac });
  if (wa > 0) inner.push({ group: "答案錯誤 (WA)", value: wa });
  if (tle > 0) inner.push({ group: "時間超限 (TLE)", value: tle });
  if (mle > 0) inner.push({ group: "記憶體超限 (MLE)", value: mle });
  if (re > 0) inner.push({ group: "執行錯誤 (RE)", value: re });
  if (ce > 0) inner.push({ group: "編譯錯誤 (CE)", value: ce });

  return { outer, inner };
};

// Language label helper
const getLanguageLabel = (lang: string) => {
  const langMap: Record<string, string> = {
    cpp: "C++",
    python: "Python",
    java: "Java",
    javascript: "JS",
    c: "C",
  };
  return langMap[lang] || lang;
};

// Chart color scale using CSS custom property values
// Note: Carbon charts require actual color values, not CSS variables
const CHART_COLORS = {
  "通過 (AC)": "#24a148", // --cds-support-success
  未通過: "#da1e28", // --cds-support-error
  "答案錯誤 (WA)": "#fa4d56",
  "時間超限 (TLE)": "#f1c21b", // --cds-support-warning
  "記憶體超限 (MLE)": "#ff832b",
  "執行錯誤 (RE)": "#a56eff",
  "編譯錯誤 (CE)": "#0f62fe", // --cds-support-info
  提交次數: "#0f62fe",
};

// Helper to get rank badge class
const getRankBadgeClass = (rank: number): string => {
  const base = "problem-stats-tab__rank-badge";
  switch (rank) {
    case 1:
      return `${base} ${base}--gold`;
    case 2:
      return `${base} ${base}--silver`;
    case 3:
      return `${base} ${base}--bronze`;
    default:
      return `${base} ${base}--default`;
  }
};

/**
 * Problem Statistics Tab
 * Displays AC rate, result distribution, and submission trend
 * Uses the ProblemProvider context for data fetching via useQuery
 */
const ProblemStatsTab: React.FC = () => {
  const { theme } = useTheme();
  const [showDetailedView, setShowDetailedView] = useState(false);

  // Get data from ProblemProvider context
  const { statistics, loading: statsLoading } = useProblemStatistics();
  const { leaderboard, loading: leaderboardLoading } = useProblemLeaderboard();

  // Compute derived data from statistics
  const { submissionCount, acceptedCount, acRate, nestedDonutData, trendData } =
    useMemo(() => {
      if (!statistics) {
        return {
          submissionCount: 0,
          acceptedCount: 0,
          acRate: 0,
          nestedDonutData: { outer: [], inner: [] },
          trendData: [],
        };
      }

      const ac = statistics.statusCounts["AC"] || 0;
      const wa = statistics.statusCounts["WA"] || 0;
      const tle = statistics.statusCounts["TLE"] || 0;
      const mle = statistics.statusCounts["MLE"] || 0;
      const re = statistics.statusCounts["RE"] || 0;
      const ce = statistics.statusCounts["CE"] || 0;

      // Format trend data for AreaChart
      // Parse date string as local date to avoid timezone issues
      // "2024-01-15" should be treated as local midnight, not UTC
      const formattedTrendData: TrendData[] = statistics.trend.map((item) => {
        // Split the ISO date string and create local date
        const [year, month, day] = item.date.split("-").map(Number);
        return {
          group: "提交次數",
          date: new Date(year, month - 1, day), // month is 0-indexed
          value: item.count,
        };
      });

      return {
        submissionCount: statistics.submissionCount,
        acceptedCount: statistics.acceptedCount,
        acRate: Math.round(statistics.acRate),
        nestedDonutData: buildNestedDonutData(ac, wa, tle, mle, re, ce),
        trendData: formattedTrendData,
      };
    }, [statistics]);

  // Donut chart options
  const donutOptions = {
    title: "",
    resizable: true,
    height: "260px",
    donut: {
      center: {
        label: "通過率",
        number: submissionCount > 0 ? acRate : 0,
        numberFormatter: (num: number) => `${num}%`,
      },
      alignment: "center" as const,
    },
    pie: {
      alignment: "center" as const,
    },
    legend: {
      alignment: "center" as const,
      position: "bottom" as const,
    },
    color: {
      scale: CHART_COLORS,
    },
    toolbar: { enabled: false },
  };

  // Check if we have any data
  const hasData =
    nestedDonutData.outer.length > 0 || nestedDonutData.inner.length > 0;

  // Leaderboard table headers
  const leaderboardHeaders = [
    { key: "rank", header: "排名" },
    { key: "username", header: "使用者" },
    { key: "language", header: "語言" },
    { key: "execTime", header: "執行時間" },
  ];

  // Transform leaderboard data for DataTable
  const leaderboardRows = leaderboard.map((entry) => ({
    id: entry.username,
    rank: entry.rank,
    username: entry.username,
    language: entry.language,
    execTime: entry.execTime,
  }));

  return (
    <div className="problem-stats-tab">
      <Grid narrow>
        {/* Donut Chart: Toggle between simple and detailed view */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard
            title="提交結果分佈"
            style={{ minHeight: "380px" }}
            action={
              hasData ? (
                <IconButton
                  kind={showDetailedView ? "primary" : "ghost"}
                  size="lg"
                  label={showDetailedView ? "簡化視圖" : "詳細分析"}
                  onClick={() => setShowDetailedView(!showDetailedView)}
                  align="bottom"
                >
                  <Analytics size={20} />
                </IconButton>
              ) : undefined
            }
          >
            {statsLoading ? (
              <div className="problem-stats-tab__loading">
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : hasData ? (
              <div className="problem-stats-tab__chart-container">
                {showDetailedView ? (
                  <DonutChart
                    data={nestedDonutData.inner}
                    options={donutOptions}
                  />
                ) : (
                  <DonutChart
                    data={nestedDonutData.outer}
                    options={donutOptions}
                  />
                )}
                <div className="problem-stats-tab__chart-summary">
                  {acceptedCount} / {submissionCount} 次通過
                </div>
              </div>
            ) : (
              <div className="problem-stats-tab__empty-state">
                尚無提交資料
              </div>
            )}
          </ContainerCard>
        </Column>

        {/* Leaderboard using DataTable */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard
            title={
              <span className="problem-stats-tab__leaderboard-title">
                <Trophy size={16} />
                <span>排行榜</span>
              </span>
            }
            style={{ minHeight: "380px" }}
            noPadding
          >
            {leaderboardLoading ? (
              <div className="problem-stats-tab__loading">
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : leaderboard.length > 0 ? (
              <DataTable rows={leaderboardRows} headers={leaderboardHeaders}>
                {({
                  rows,
                  headers,
                  getTableProps,
                  getHeaderProps,
                  getRowProps,
                }) => (
                  <Table {...getTableProps()} size="md">
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => {
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
                      {rows.map((row) => {
                        const rankCell = row.cells.find(
                          (c) => c.info.header === "rank"
                        );
                        const rank = rankCell?.value as number;
                        const { key: rowKey, ...rowProps } = getRowProps({
                          row,
                        });
                        return (
                          <TableRow key={rowKey} {...rowProps}>
                            {row.cells.map((cell) => (
                              <TableCell key={cell.id}>
                                {cell.info.header === "rank" ? (
                                  <span
                                    className={getRankBadgeClass(
                                      cell.value as number
                                    )}
                                  >
                                    {cell.value}
                                  </span>
                                ) : cell.info.header === "language" ? (
                                  <Tag size="sm" type="cool-gray">
                                    {getLanguageLabel(cell.value as string)}
                                  </Tag>
                                ) : cell.info.header === "execTime" ? (
                                  <span
                                    className={`problem-stats-tab__exec-time ${
                                      rank === 1
                                        ? "problem-stats-tab__exec-time--best"
                                        : ""
                                    }`}
                                  >
                                    <Time size={14} />
                                    {cell.value} ms
                                  </span>
                                ) : (
                                  cell.value
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </DataTable>
            ) : (
              <div className="problem-stats-tab__empty-state">
                尚無通過記錄
              </div>
            )}
          </ContainerCard>
        </Column>

        {/* Submission Trend */}
        <Column lg={16} md={8} sm={4}>
          <ContainerCard title="最近提交趨勢" style={{ minHeight: "300px" }}>
            {statsLoading ? (
              <div className="problem-stats-tab__loading">
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : trendData.length > 0 ? (
              <div className="problem-stats-tab__trend-container">
                <AreaChart
                  data={trendData}
                  options={{
                    title: "",
                    axes: {
                      bottom: {
                        mapsTo: "date",
                        scaleType: ScaleTypes.TIME,
                      },
                      left: {
                        mapsTo: "value",
                        title: "提交數",
                        scaleType: ScaleTypes.LINEAR,
                      },
                    },
                    curve: "curveMonotoneX",
                    height: "220px",
                    color: {
                      scale: CHART_COLORS,
                    },
                    theme: theme,
                    toolbar: { enabled: false },
                  }}
                />
              </div>
            ) : (
              <div className="problem-stats-tab__empty-state">
                尚無提交資料
              </div>
            )}
          </ContainerCard>
        </Column>
      </Grid>
    </div>
  );
};

export default ProblemStatsTab;
