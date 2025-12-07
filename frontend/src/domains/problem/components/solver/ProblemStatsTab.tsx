import React, { useEffect, useState } from 'react';
import { Grid, Column, SkeletonText } from '@carbon/react';
import { GaugeChart, DonutChart, SimpleBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';
import '@carbon/charts-react/styles.css';
import ContainerCard from '@/ui/components/layout/ContainerCard';
import type { ProblemDetail } from '@/core/entities/problem.entity';
import { getSubmissions } from '@/services/submission';

interface ProblemStatsTabProps {
  problem: ProblemDetail;
}

interface StatusCount {
  group: string;
  value: number;
}

interface WeeklyData {
  group: string;
  key: string;
  value: number;
}

/**
 * Problem Statistics Tab
 * Displays AC rate, result distribution, and weekly submission trend
 */
const ProblemStatsTab: React.FC<ProblemStatsTabProps> = ({ problem }) => {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<StatusCount[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);

  // Calculate statistics from problem data
  const submissionCount = problem.submissionCount || 0;
  const acceptedCount = problem.acceptedCount || 0;
  const acRate = submissionCount > 0 
    ? Math.round((acceptedCount / submissionCount) * 100) 
    : 0;

  // Fetch submissions for detailed stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const { results: submissions } = await getSubmissions({ problemId: problem.id });
        
        // Calculate last 7 days distribution
        const statusCounts: Record<string, number> = {};
        const dailySubmissions: Record<string, number> = {};
        
        // Get last 7 days
        const now = new Date();
        const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
        
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dayKey = `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
          dailySubmissions[dayKey] = 0;
        }
        
        submissions.forEach((sub: any) => {
          // Count by status
          const status = sub.status || 'Unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          
          // Count by day
          const subDate = new Date(sub.createdAt);
          const daysAgo = Math.floor((now.getTime() - subDate.getTime()) / (24 * 60 * 60 * 1000));
          
          if (daysAgo >= 0 && daysAgo < 7) {
            const date = new Date(subDate);
            const dayKey = `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
            if (dailySubmissions[dayKey] !== undefined) {
              dailySubmissions[dayKey]++;
            }
          }
        });
        
        // Format status data for DonutChart
        const statusLabels: Record<string, string> = {
          'AC': '通過 (AC)',
          'WA': '答案錯誤 (WA)',
          'TLE': '時間超限 (TLE)',
          'MLE': '記憶體超限 (MLE)',
          'RE': '執行錯誤 (RE)',
          'CE': '編譯錯誤 (CE)',
          'pending': '等待中',
          'running': '執行中'
        };
        
        const formattedStatusData = Object.entries(statusCounts)
          .map(([status, count]) => ({
            group: statusLabels[status] || status,
            value: count
          }))
          .filter(item => item.value > 0);
        
        setStatusData(formattedStatusData);
        
        // Format daily data for BarChart
        const formattedDailyData = Object.entries(dailySubmissions).map(([day, count]) => ({
          group: '提交次數',
          key: day,
          value: count
        }));
        
        setWeeklyData(formattedDailyData);
        
      } catch (error) {
        console.error('Failed to fetch submission stats:', error);
        // Use fallback data from problem
        setStatusData([
          { group: '通過 (AC)', value: acceptedCount },
          { group: '未通過', value: submissionCount - acceptedCount }
        ]);
      } finally {
        setLoading(false);
      }
    };
    
    if (problem.id) {
      fetchStats();
    }
  }, [problem.id, submissionCount, acceptedCount]);

  // Gauge chart options - fixed to show value correctly
  const gaugeData = [{ group: 'value', value: acRate }];
  
  const gaugeOptions = {
    title: '',
    resizable: true,
    height: '220px',
    gauge: {
      type: 'semi' as const,
      status: acRate >= 60 ? 'success' : acRate >= 30 ? 'warning' : 'danger',
      arcWidth: 24,
    },
    toolbar: { enabled: false },
    theme: 'g100' as const
  };

  // Donut chart options
  const donutOptions = {
    title: '',
    resizable: true,
    height: '280px',
    donut: {
      center: {
        label: '總提交',
        number: submissionCount
      }
    },
    pie: {
      alignment: 'center' as const
    },
    legend: {
      alignment: 'center' as const,
      position: 'bottom' as const
    },
    color: {
      scale: {
        '通過 (AC)': '#24a148',
        '答案錯誤 (WA)': '#da1e28',
        '時間超限 (TLE)': '#f1c21b',
        '記憶體超限 (MLE)': '#ff832b',
        '執行錯誤 (RE)': '#a56eff',
        '編譯錯誤 (CE)': '#0f62fe',
        '等待中': '#8d8d8d',
        '執行中': '#0072c3',
        '未通過': '#da1e28'
      }
    },
    toolbar: { enabled: false }
  };

  // Bar chart options
  const barOptions = {
    title: '',
    resizable: true,
    height: '280px',
    axes: {
      left: {
        mapsTo: 'value',
        title: '提交次數'
      },
      bottom: {
        mapsTo: 'key',
        scaleType: ScaleTypes.LABELS,
        title: '最近7天'
      }
    },
    bars: {
      maxWidth: 40
    },
    color: {
      scale: {
        '提交次數': '#0f62fe'
      }
    },
    legend: { enabled: false },
    toolbar: { enabled: false }
  };

  return (
    <div>
      <Grid narrow>
        {/* AC Rate Gauge */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="通過率 (AC Rate)">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <GaugeChart
                data={gaugeData}
                options={gaugeOptions}
              />
              <div style={{ 
                marginTop: '0.5rem', 
                textAlign: 'center',
                color: 'var(--cds-text-secondary)'
              }}>
                <span style={{ 
                  fontSize: '2rem', 
                  fontWeight: 600,
                  color: acRate >= 60 ? 'var(--cds-support-success)' : 
                         acRate >= 30 ? 'var(--cds-support-warning)' : 
                         'var(--cds-support-error)'
                }}>
                  {acRate}%
                </span>
                <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {acceptedCount} / {submissionCount} 次通過
                </div>
              </div>
            </div>
          </ContainerCard>
        </Column>

        {/* Summary Statistics */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="提交統計">
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.5rem',
              padding: '1rem 0'
            }}>
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
              <div style={{ padding: '2rem' }}>
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : statusData.length > 0 ? (
              <DonutChart
                data={statusData}
                options={donutOptions}
              />
            ) : (
              <div style={{ 
                padding: '3rem', 
                textAlign: 'center', 
                color: 'var(--cds-text-secondary)' 
              }}>
                尚無提交資料
              </div>
            )}
          </ContainerCard>
        </Column>

        {/* Weekly Submission Trend */}
        <Column lg={8} md={4} sm={4}>
          <ContainerCard title="最近7天提交趨勢">
            {loading ? (
              <div style={{ padding: '2rem' }}>
                <SkeletonText heading />
                <SkeletonText paragraph lineCount={5} />
              </div>
            ) : weeklyData.some(d => d.value > 0) ? (
              <SimpleBarChart
                data={weeklyData}
                options={barOptions}
              />
            ) : (
              <div style={{ 
                padding: '3rem', 
                textAlign: 'center', 
                color: 'var(--cds-text-secondary)' 
              }}>
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
  color 
}) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--cds-border-subtle)'
  }}>
    <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
      {label}
    </span>
    <span style={{ fontSize: '1.25rem', fontWeight: 600, color }}>
      {value}
    </span>
  </div>
);

export default ProblemStatsTab;
