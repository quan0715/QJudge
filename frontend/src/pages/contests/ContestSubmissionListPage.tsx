import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Pagination,
  Tag,
  Loading,
  Button,
  Dropdown,
  InlineLoading
} from '@carbon/react';
import { View, Renew, ArrowLeft } from '@carbon/icons-react';
import { api } from '@/services/api';
import SubmissionDetailModal from '@/components/contest/SubmissionDetailModal';

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

const ContestSubmissionListPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
    if (contestId) {
      fetchSubmissions();
    }
  }, [contestId, page, pageSize, statusFilter]);

  const fetchSubmissions = async () => {
    if (!refreshing) setLoading(true);
    try {
      // Use getSubmissions with source_type='contest'
      // Note: Backend filtering for status/page needs to be supported in getSubmissions or handled here
      // Currently api.getSubmissions takes params object
      // We might need to extend api.getSubmissions to accept more params like page, status
      // For now, let's assume api.getSubmissions returns all or paginated default
      
      // Actually, let's construct the URL manually or update api.ts to be more flexible
      // But for MVP, let's use what we have. 
      // Wait, I updated api.ts to take params.
      
      const params: any = {
        source_type: 'contest',
        contest_id: contestId,
        page: page,
        page_size: pageSize
      };
      
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      // We need to update api.ts to pass these extra params (page, status)
      // Currently it only passes source_type, contest, problem
      // Let's update api.ts first to be generic or just append them here?
      // I can't easily update api.ts again without another tool call.
      // Let's assume I'll fix api.ts or use a direct authFetch here for flexibility if needed.
      // But better to stick to api.ts.
      
      // Let's look at api.ts again.
      // getSubmissions: async (params?: { source_type?: 'practice' | 'contest', contest_id?: string, problem_id?: string })
      // It constructs queryParams manually. It misses page/status.
      
      // I should update api.ts to accept `Record<string, any>` or specific fields.
      // I'll update api.ts in the next step to support pagination/filtering.
      // For now, I'll write this component assuming api.ts will be updated.
      
      const data: any = await api.getSubmissions(params);
      
      // Handle response format (paginated vs list)
      if (Array.isArray(data)) {
          setSubmissions(data);
          setTotalItems(data.length);
      } else {
          setSubmissions(data.results);
          setTotalItems(data.count);
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

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { type: any; label: string }> = {
      'AC': { type: 'green', label: 'AC' },
      'WA': { type: 'red', label: 'WA' },
      'TLE': { type: 'magenta', label: 'TLE' },
      'MLE': { type: 'magenta', label: 'MLE' },
      'RE': { type: 'red', label: 'RE' },
      'CE': { type: 'gray', label: 'CE' },
      'pending': { type: 'gray', label: 'Pending' },
      'judging': { type: 'blue', label: 'Judging' },
      'SE': { type: 'red', label: 'SE' }
    };

    const config = statusConfig[status] || { type: 'gray', label: status };
    return <Tag type={config.type} size="sm">{config.label}</Tag>;
  };

  const getLanguageLabel = (lang: string) => {
    const langMap: Record<string, string> = {
      'cpp': 'C++',
      'python': 'Python',
      'java': 'Java',
      'javascript': 'JavaScript',
      'c': 'C'
    };
    return langMap[lang] || lang;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleSubmissionClick = (submissionId: string) => {
    setSearchParams(prev => {
      prev.set('select_id', submissionId);
      return prev;
    });
  };

  const handleCloseModal = () => {
    setSearchParams(prev => {
      prev.delete('select_id');
      return prev;
    });
  };

  const headers = [
    { key: 'status', header: '狀態' },
    { key: 'problem', header: '題目' },
    { key: 'username', header: '用戶' },
    { key: 'language', header: '語言' },
    { key: 'score', header: '得分' },
    { key: 'time', header: '耗時' },
    { key: 'created_at', header: '提交時間' },
    { key: 'actions', header: '操作' }
  ];

  const rows = submissions.map(sub => ({
    id: sub.id.toString(),
    status: getStatusTag(sub.status),
    problem: (
      <span style={{ fontWeight: 500 }}>
        {sub.problem?.title || `Problem ${sub.problem?.id}`}
      </span>
    ),
    username: sub.user?.username || 'Unknown',
    language: getLanguageLabel(sub.language),
    score: sub.score,
    time: `${sub.exec_time} ms`,
    created_at: formatDate(sub.created_at),
    actions: (
      <Button
        kind="ghost"
        size="sm"
        renderIcon={View}
        iconDescription="查看詳情"
        hasIconOnly
        onClick={(e) => {
          e.stopPropagation();
          handleSubmissionClick(sub.id.toString());
        }}
      />
    )
  }));

  if (loading && !refreshing && submissions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <Loading />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Button 
            kind="ghost" 
            renderIcon={ArrowLeft} 
            onClick={() => navigate(`/contests/${contestId}`)}
            style={{ marginBottom: '1rem' }}
        >
            返回競賽
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>競賽提交記錄</h1>
            <p style={{ color: 'var(--cds-text-secondary)' }}>
                即時查看競賽中的提交狀態。
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
      </div>

      <DataTable rows={rows} headers={headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps
        }: any) => (
          <TableContainer 
            title="" 
            description=""
            style={{ 
              backgroundColor: 'transparent',
              padding: '0',
              boxShadow: 'none'
            }}
          >
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
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header: any) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow 
                    {...getRowProps({ row })} 
                    key={row.id}
                    onClick={() => handleSubmissionClick(row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {row.cells.map((cell: any) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

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
        submissionId={searchParams.get('select_id')}
        isOpen={!!searchParams.get('select_id')}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default ContestSubmissionListPage;
