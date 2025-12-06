import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, InlineLoading } from '@carbon/react';
import { SubmissionTable, type SubmissionRow } from '@/components/submission/SubmissionTable';
import { SubmissionDetailModal } from '@/components/submission/SubmissionDetailModal';
import { authFetch } from '@/services/auth';

interface ProblemSubmissionHistoryProps {
  problemId: number | string;
}

const ProblemSubmissionHistory: React.FC<ProblemSubmissionHistoryProps> = ({ problemId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get('submission_id');
  const isModalOpen = !!submissionIdFromUrl;

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/v1/submissions/?problem=${problemId}&ordering=-created_at&is_test=false`);
      const data = await res.json();
      setSubmissions(data.results || []);
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
    username: sub.user?.username,
    language: sub.language,
    score: sub.score,
    exec_time: sub.exec_time,
    created_at: sub.created_at
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
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0  }}>提交歷史</h3>
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
      />
    </div>
  );
};

export default ProblemSubmissionHistory;
