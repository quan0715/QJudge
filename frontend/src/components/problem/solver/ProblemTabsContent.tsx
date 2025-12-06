
import React from 'react';
import ProblemPreview from '../ProblemPreview';
import ProblemSubmissionHistory from '../ProblemSubmissionHistory';

// Description Tab
export const ProblemDescriptionTab: React.FC<{ problem: any }> = ({ problem }) => (
  <div style={{ padding: '0', maxWidth: '1200px', margin: '0 auto' }}>
    <ProblemPreview 
      title={problem.title} 
      difficulty={problem.difficulty}
      // Pass all problem props required... 
      timeLimit={problem.timeLimit}
      memoryLimit={problem.memoryLimit}
      translations={problem.translations}
      testCases={problem.testCases?.filter((tc: any) => tc.isSample)}
      tags={problem.tags}
      showLanguageToggle={problem.translations?.length > 1}
      compact={false}
    />
  </div>
);

// History Tab
export const ProblemHistoryTab: React.FC<{ problemId: string }> = ({ problemId }) => (
  <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
     <ProblemSubmissionHistory problemId={problemId} />
  </div>
);

// Stats Tab (Placeholder)
export const ProblemStatsTab: React.FC = () => (
  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
    <h3>Statistics Coming Soon</h3>
    <p>AC Rate, Submission Timeline, etc.</p>
  </div>
);

// Settings Tab (Placeholder)
export const ProblemSettingsTab: React.FC = () => (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
      <h3>Problem Settings</h3>
      <p>Edit problem details here (Admin/Owner only).</p>
    </div>
  );
