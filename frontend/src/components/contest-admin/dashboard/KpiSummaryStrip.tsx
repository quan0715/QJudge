import React from 'react';
import { Tile } from '@carbon/react';
import type { ContestSummary } from './types';

interface KpiSummaryStripProps {
  summary: ContestSummary;
}

const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({ summary }) => {
  const kpiItems = [
    {
      label: 'Total Participants',
      value: summary.totalParticipants,
      desc: `Zero Solved: ${summary.zeroSolvedCount}`,
    },
    {
      label: 'Total Problems',
      value: summary.totalProblems,
      desc: `Full Solved: ${summary.fullSolvedCount}`,
    },
    {
      label: 'Total Submissions',
      value: summary.totalSubmissions,
      desc: `Avg/User: ${(summary.totalSubmissions / (summary.totalParticipants || 1)).toFixed(1)}`,
    },
    {
      label: 'Avg Completion Rate',
      value: `${(summary.avgCompletionRate * 100).toFixed(1)}%`,
      desc: `Avg Solved: ${summary.avgSolvedCount.toFixed(1)}`,
    },
  ];

  return (
    <div className="cds--grid" style={{ padding: 0, marginBottom: '1.5rem' }}>
      <div className="cds--row">
        {kpiItems.map((item, index) => (
          <div key={index} className="cds--col-sm-4 cds--col-md-4 cds--col-lg-4">
            <Tile style={{ height: '100%', border: '1px solid var(--cds-border-subtle)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 300, lineHeight: 1, marginBottom: '0.5rem' }}>
                {item.value}
              </div>
              {item.desc && (
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  {item.desc}
                </div>
              )}
            </Tile>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KpiSummaryStrip;
