import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Pagination,
  Loading,
  Button,
  Dropdown,
  InlineLoading
} from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { authFetch } from '@/services/auth';
import { SubmissionDetailModal } from '@/components/submission/SubmissionDetailModal';
import { SubmissionTable, type SubmissionRow } from '@/components/submission/SubmissionTable';

interface Submission {
  id: number;
  user: {
    id: number;
    username: string;
  };
  problem: {
    id: number;
    title: string;
  };
  language: string;
  status: string;
  score: number;
  exec_time: number;
  created_at: string;
}

const SubmissionsPage = () => {
  // const navigate = useNavigate(); // Removed unused navigate
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Read submission_id from URL
  const submissionIdFromUrl = searchParams.get('submission_id');
  const isModalOpen = !!submissionIdFromUrl;

  const statusOptions = [
    { id: 'all', label: '全部狀態' },
    { id: 'AC', label: '通過 (AC)' },
    { id: 'WA', label: '答案錯誤 (WA)' },
    { id: 'TLE', label: '超時 (TLE)' },
    { id: 'MLE', label: '記憶體超限 (MLE)' },
    { id: 'RE', label: '執行錯誤 (RE)' },
    { id: 'CE', label: '編譯錯誤 (CE)' },
    { id: 'pending', label: '等待中' },
    { id: 'judging', label: '評測中' }
  ];

  useEffect(() => {
    fetchSubmissions();
  }, [page, pageSize, statusFilter]);

  const fetchSubmissions = async () => {
    if (!refreshing) setLoading(true);
    try {
      let url = `/api/v1/submissions/?page=${page}&page_size=${pageSize}&is_test=false`;
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }

      const res = await authFetch(url);

      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.results || data);
        setTotalItems(data.count || data.length);
      }
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubmissions();
  };



  const submissionRows: SubmissionRow[] = submissions.map(sub => ({
    id: sub.id.toString(),
    status: sub.status,
    problem_id: sub.problem?.id,
    problem_title: sub.problem?.title || `Problem ${sub.problem?.id}`,
    username: sub.user?.username || 'Unknown',
   language: sub.language,
    score: sub.score,
    exec_time: sub.exec_time,
    created_at: sub.created_at
  }));

  const handleViewDetails = (id: string) => {
    setSearchParams({ submission_id: id });
  };

  const handleCloseModal = () => {
    setSearchParams({});
  };

  if (loading && !refreshing && submissions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <Loading />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>提交記錄</h1>
          <p style={{ color: 'var(--cds-text-secondary)' }}>
            查看所有公開的程式碼提交狀態與結果。
          </p>
        </div>
        <Button 
          kind="tertiary" 
          renderIcon={refreshing ? InlineLoading : Renew} 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '更新中...' : '重新整理'}
        </Button>
      </div>

      <TableToolbar>
        <TableToolbarContent>
          <TableToolbarSearch
            placeholder="搜尋用戶或題目..."
            onChange={(e: any) => setSearchQuery(e.target.value)}
            persistent
          />
          <div style={{ width: '200px' }}>
            <Dropdown
              id="status-filter"
              titleText=""
              label="篩選狀態"
              items={statusOptions}
              itemToString={(item: any) => (item ? item.label : '')}
              selectedItem={statusOptions.find(s => s.id === statusFilter)}
              onChange={({ selectedItem }: any) => {
                if (selectedItem) {
                  setStatusFilter(selectedItem.id);
                  setPage(1);
                }
              }}
            />
          </div>
        </TableToolbarContent>
      </TableToolbar>

      <SubmissionTable
        submissions={submissionRows}
        onViewDetails={handleViewDetails}
        showProblem={true}
        showUser={true}
        showScore={true}
      />

      <Pagination
        totalItems={totalItems}
        backwardText="上一頁"
        forwardText="下一頁"
        itemsPerPageText="每頁顯示"
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50, 100]}
        size="md"
        onChange={({ page: newPage, pageSize: newPageSize }: any) => {
          setPage(newPage);
          setPageSize(newPageSize);
        }}
        style={{ marginTop: '1rem' }}
      />

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default SubmissionsPage;
