import React, { useEffect, useState } from "react";
import { Grid, Column, SkeletonText } from "@carbon/react";
import { GaugeChart, DonutChart, AreaChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { getSubmissions } from "@/services/submission";
import { useTheme } from "@/ui/theme/ThemeContext";

interface ProblemStatsTabProps {
  problem: ProblemDetail;
  contestId?: string;
}

interface StatusCount {
  group: string;
  value: number;
}

interface TrendData {
  group: string;
  date: Date;
  value: number;
}

/**
 * Problem Statistics Tab
 * Displays AC rate, result distribution, and weekly submission trend
 */
const ProblemStatsTab: React.FC<ProblemStatsTabProps> = ({
  problem,
  contestId,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<StatusCount[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);

  // Real-time statistics from API (not from potentially stale problem data)
  const [submissionCount, setSubmissionCount] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const acRate =
    submissionCount > 0
      ? Math.round((acceptedCount / submissionCount) * 100)
      : 0;

  // Fetch submissions for detailed stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const { results: submissions } = await getSubmissions({
          problem: problem.id,
          contest: contestId,
          source_type: contestId ? "contest" : "practice",
          page_size: 10000,
        });

        // Calculate status distribution from actual submissions
        const statusCounts: Record<string, number> = {};
        let acCount = 0;

        submissions.forEach((sub: any) => {
          const status = sub.status || "Unknown";
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          if (status === "AC") {
            acCount++;
          }
        });

        // Update real statistics based on API data
        setSubmissionCount(submissions.length);
        setAcceptedCount(acCount);

        // Format status data for DonutChart
        const statusLabels: Record<string, string> = {
          AC: "通過 (AC)",
          WA: "答案錯誤 (WA)",
          TLE: "時間超限 (TLE)",
          MLE: "記憶體超限 (MLE)",
          RE: "執行錯誤 (RE)",
          CE: "編譯錯誤 (CE)",
          pending: "等待中",
          running: "執行中",
        };

        const formattedStatusData = Object.entries(statusCounts)
          .map(([status, count]) => ({
            group: statusLabels[status] || status,
            value: count,
          }))
          .filter((item) => item.value > 0);

        setStatusData(formattedStatusData);

        // Calculate Trend Data (Time-based area chart)
        const formattedTrendData: TrendData[] = [];
        const timestamps = submissions.map((s: any) =>
          new Date(s.createdAt).getTime()
        );

        if (timestamps.length > 0) {
          const minT = Math.min(...timestamps);
          const maxT = Math.max(...timestamps);
          const durationMs = maxT - minT;

          // Determine bucket size
          let bucketMs = 24 * 60 * 60 * 1000; // Default Daily
          let start = minT;
          let end = maxT;

          if (contestId) {
            if (durationMs < 3 * 60 * 60 * 1000) {
              bucketMs = 15 * 60 * 1000; // 15 mins
            } else if (durationMs < 24 * 60 * 60 * 1000) {
              bucketMs = 60 * 60 * 1000; // Hourly
            }

            start = Math.floor(minT / bucketMs) * bucketMs;
            end = Math.ceil(maxT / bucketMs) * bucketMs;
          } else {
            // Practice: Fix to last 7 days
            const now = new Date();
            end = now.getTime();
            start = end - 7 * 24 * 60 * 60 * 1000; // 7 days ago
            start = Math.floor(start / bucketMs) * bucketMs;
          }

          // Initialize buckets
          const buckets: Record<number, number> = {};
          for (let t = start; t <= end; t += bucketMs) {
            buckets[t] = 0;
          }

          // Fill buckets
          timestamps.forEach((ts) => {
            if (ts >= start && ts <= end + bucketMs) {
              const b = Math.floor(ts / bucketMs) * bucketMs;
              if (buckets[b] !== undefined) buckets[b]++;
            }
          });

          Object.entries(buckets).forEach(([t, count]) => {
            formattedTrendData.push({
              group: "提交次數",
              date: new Date(parseInt(t)),
              value: count,
            });
          });
        }

        setTrendData(formattedTrendData);
      } catch (error) {
        console.error("Failed to fetch submission stats:", error);
        // Fallback to problem data if API fails
        const fallbackSubmissionCount = problem.submissionCount || 0;
        const fallbackAcceptedCount = problem.acceptedCount || 0;
        setSubmissionCount(fallbackSubmissionCount);
        setAcceptedCount(fallbackAcceptedCount);
        setStatusData([
          { group: "通過 (AC)", value: fallbackAcceptedCount },
          {
            group: "未通過",
            value: fallbackSubmissionCount - fallbackAcceptedCount,
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    if (problem.id) {
      fetchStats();
    }
  }, [problem.id, contestId]);

  // Gauge chart options - fixed to show value correctly
  const gaugeData = [{ group: "value", value: acRate }];

  const gaugeOptions = {
    title: "",
    resizable: true,
    height: "220px",
    gauge: {
      type: "semi" as const,
      status: acRate >= 60 ? "success" : acRate >= 30 ? "warning" : "danger",
      arcWidth: 24,
    },
    toolbar: { enabled: false },
    theme: "g100" as const,
  };

  // Donut chart options
  const donutOptions = {
    title: "",
    resizable: true,
    height: "280px",
    donut: {
      center: {
        label: "總提交",
        number: submissionCount,
      },
    },
    pie: {
      alignment: "center" as const,
    },
    legend: {
      alignment: "center" as const,
      position: "bottom" as const,
    },
    color: {
      scale: {
        "通過 (AC)": "#24a148",
        "答案錯誤 (WA)": "#da1e28",
        "時間超限 (TLE)": "#f1c21b",
        "記憶體超限 (MLE)": "#ff832b",
        "執行錯誤 (RE)": "#a56eff",
        "編譯錯誤 (CE)": "#0f62fe",
        等待中: "#8d8d8d",
        執行中: "#0072c3",
        未通過: "#da1e28",
      },
    },
    toolbar: { enabled: false },
  };

  return (
    <div>
      <Grid narrow>
        {/* AC Rate Gauge */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="通過率 (AC Rate)">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <GaugeChart data={gaugeData} options={gaugeOptions} />
              <div
                style={{
                  marginTop: "0.5rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary)",
                }}
              >
                <span
                  style={{
                    fontSize: "2rem",
                    fontWeight: 600,
                    color:
                      acRate >= 60
                        ? "var(--cds-support-success)"
                        : acRate >= 30
                        ? "var(--cds-support-warning)"
                        : "var(--cds-support-error)",
                  }}
                >
                  {acRate}%
                </span>
                <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                  {acceptedCount} / {submissionCount} 次通過
                </div>
              </div>
            </div>
          </ContainerCard>
        </Column>

        {/* Summary Statistics */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="提交統計">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                padding: "1rem 0",
              }}
            >
              <StatItem
                label="總提交次數"
                value={submissionCount}
                color="var(--cds-text-primary)"
              />
              <StatItem
                label="通過次數"
                value={acceptedCount}
                color="var(--cds-support-success)"
              />
              <StatItem
                label="未通過次數"
                value={submissionCount - acceptedCount}
                color="var(--cds-support-error)"
              />
            </div>
          </ContainerCard>
        </Column>

        {/* Result Distribution Donut Chart */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="提交結果分佈">
            {loading ? (
              <div style={{ padding: "2rem" }}>
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : statusData.length > 0 ? (
              <DonutChart data={statusData} options={donutOptions} />
            ) : (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary)",
                }}
              >
                尚無提交資料
              </div>
            )}
          </ContainerCard>
        </Column>

        {/* Weekly Submission Trend / Contest Status Distribution */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title={contestId ? "競賽提交趨勢" : "最近7天提交趨勢"}>
            {loading ? (
              <div style={{ padding: "2rem" }}>
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : trendData.length > 0 ? (
              <AreaChart
                data={trendData}
                options={{
                  title: contestId ? "競賽提交趨勢" : "最近7天提交趨勢",
                  axes: {
                    bottom: { mapsTo: "date", scaleType: ScaleTypes.TIME },
                    left: {
                      mapsTo: "value",
                      title: "提交數",
                      scaleType: ScaleTypes.LINEAR,
                    },
                  },
                  curve: "curveMonotoneX",
                  height: "300px",
                  color: {
                    scale: { 提交次數: "#0f62fe" },
                  },
                  theme: theme,
                }}
              />
            ) : (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary)",
                }}
              >
                尚無提交資料
              </div>
            )}
          </ContainerCard>
        </Column>
      </Grid>
    </div>
  );
};

// Helper component for stat items
const StatItem: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0.5rem 0",
      borderBottom: "1px solid var(--cds-border-subtle)",
    }}
  >
    <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
      {label}
    </span>
    <span style={{ fontSize: "1.25rem", fontWeight: 600, color }}>{value}</span>
  </div>
);

export default ProblemStatsTab;
