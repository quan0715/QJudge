import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { View, Renew } from '@carbon/icons-react';

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
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [searchQuery, setSearchQuery] = useState('');
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
    fetchSubmissions();
  }, [page, pageSize, statusFilter]);

  const fetchSubmissions = async () => {
    if (!refreshing) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `/api/v1/submissions/?page=${page}&page_size=${pageSize}&is_test=false`;
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }

      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

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
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const headers = [
    { key: 'id', header: 'ID' },
    { key: 'status', header: '狀態' },
    { key: 'problem', header: '題目' },
    { key: 'username', header: '用戶' },
    { key: 'language', header: '語言' },
    { key: 'score', header: '得分' },
    { key: 'time', header: '時間' },
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
          navigate(`/submissions/${sub.id}`);
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

      <DataTable rows={rows} headers={headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps,
          getTableContainerProps
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
                    onClick={() => navigate(`/submissions/${row.id}`)}
                    style={{ cursor: 'pointer' }}
                    className="submission-row"
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
    </div>
  );
};

export default SubmissionsPage;
