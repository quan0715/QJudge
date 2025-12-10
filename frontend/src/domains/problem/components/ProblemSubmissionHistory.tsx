import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, InlineLoading, Pagination } from '@carbon/react';
import { Renew } from '@carbon/icons-react';
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
  const [refreshing, setRefreshing] = useState(false);
  
  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get('submission_id');
  const isModalOpen = !!submissionIdFromUrl;

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { results, count } = await getSubmissions({
        problem: problemId,
        ordering: '-created_at',
        is_test: false,
        contest: contestId,
        source_type: contestId ? 'contest' : undefined,
        page: page,
        page_size: pageSize
      });
      setSubmissions(results || []);
      setTotalItems(count || 0);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [problemId, page, pageSize]);

  const submissionRows: SubmissionRow[] = submissions.map(sub => ({
    id: sub.id.toString(),
    status: sub.status,
    username: sub.username,
    language: sub.language,
    score: sub.score,
    exec_time: sub.execTime,
    created_at: sub.createdAt
  }));

  if (loading && submissions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <InlineLoading description="載入中..." />
        {/* Placeholder to prevent layout shift */}
        <div style={{ height: '400px' }}></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
        {refreshing && <InlineLoading description="更新中..." status="active" />}
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          onClick={() => {
             setRefreshing(true);
             fetchSubmissions().finally(() => setRefreshing(false));
          }}
          disabled={refreshing}
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
      
      {/* Pagination */}
      <Pagination
         totalItems={totalItems}
         backwardText="上一頁"
         forwardText="下一頁"
         itemsPerPageText="每頁顯示"
         page={page}
         pageSize={pageSize}
         pageSizes={[10, 20, 50]}
         size="md"
         onChange={({ page: newPage, pageSize: newPageSize }: any) => {
           setPage(newPage);
           setPageSize(newPageSize);
         }}
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
