import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, InlineLoading } from '@carbon/react';
import { SubmissionTable, type SubmissionRow } from '@/domains/submission/components/SubmissionTable';
import { SubmissionDetailModal } from '@/domains/submission/components/SubmissionDetailModal';
import { getSubmissions } from '@/services/submission';

interface ProblemSubmissionHistoryProps {
  problemId: number | string;
  contestId?: string;
}

const ProblemSubmissionHistory: React.FC<ProblemSubmissionHistoryProps> = ({ problemId, contestId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get('submission_id');
  const isModalOpen = !!submissionIdFromUrl;

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { results } = await getSubmissions({
        problem: problemId,
        ordering: '-created_at',
        is_test: false,
        contest: contestId,
        source_type: contestId ? 'contest' : undefined
      });
      setSubmissions(results || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [problemId]);

  const submissionRows: SubmissionRow[] = submissions.map(sub => ({
    id: sub.id.toString(),
    status: sub.status,
    username: sub.username,  // Mapped from user.username by mapSubmissionDto
    language: sub.language,
    score: sub.score,
    exec_time: sub.execTime,  // camelCase from mapper
    created_at: sub.createdAt // camelCase from mapper
  }));

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <InlineLoading description="載入中..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          kind="ghost"
          size="sm"
          onClick={fetchSubmissions}
        >
          重新整理
        </Button>
      </div>

      <SubmissionTable
        submissions={submissionRows}
        onViewDetails={(id) => setSearchParams({ submission_id: id })}
        showProblem={false}
        showUser={false}
        showScore={true}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={() => setSearchParams({})}
        contestId={contestId}
      />
    </div>
  );
};

export default ProblemSubmissionHistory;
