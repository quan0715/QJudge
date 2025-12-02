import React from 'react';
import type { ContestSummary, ProblemStats, ParticipantStats } from './types';
import KpiSummaryStrip from './KpiSummaryStrip';
import ProblemCompletionSection from './ProblemCompletionSection';
import ParticipantCompletionSection from './ParticipantCompletionSection';
import { Grid, Column } from '@carbon/react';

interface ContestAdminDashboardProps {
  summary: ContestSummary;
  problems: ProblemStats[];
  participants: ParticipantStats[];
}

const ContestAdminDashboard: React.FC<ContestAdminDashboardProps> = ({
  summary,
  problems,
  participants
}) => {
  return (
    <div className="contest-admin-dashboard">
      {/* Section 1: KPI Summary */}
      <KpiSummaryStrip summary={summary} />

      {/* Section 2: Main Content */}
      <Grid fullWidth style={{ padding: 0 }}>
        <Column lg={9} md={8} sm={4}>
          <div style={{ marginBottom: '1rem' }}>
            <ProblemCompletionSection 
              problems={problems} 
              totalParticipants={summary.totalParticipants} 
            />
          </div>
        </Column>
        <Column lg={7} md={8} sm={4}>
          <div style={{ marginBottom: '1rem' }}>
            <ParticipantCompletionSection 
              participants={participants} 
              totalProblems={summary.totalProblems} 
            />
          </div>
        </Column>
      </Grid>
    </div>
  );
};

export default ContestAdminDashboard;
