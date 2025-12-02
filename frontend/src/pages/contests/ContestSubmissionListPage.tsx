import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbarSearch,
  Pagination,
  Loading,
  Button,
  Dropdown,
  InlineLoading
} from '@carbon/react';
import { View, Renew } from '@carbon/icons-react';
import { api } from '@/services/api';
import SubmissionDetailModal from '@/components/contest/SubmissionDetailModal';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { StatusType } from '@/components/common/StatusBadge';
import SurfaceSection from '@/components/contest/layout/SurfaceSection';
import ContainerCard from '@/components/contest/layout/ContainerCard';

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
      const params: any = {
        source_type: 'contest',
        contest_id: contestId,
        page: page,
        page_size: pageSize
      };
      
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const data: any = await api.getSubmissions(params);
      
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

  const getStatusBadge = (status: string) => {
    let type: StatusType = 'gray';
    let label = status;

    switch (status) {
      case 'AC':
        type = 'success';
        label = 'AC';
        break;
      case 'WA':
        type = 'error';
        label = 'WA';
        break;
      case 'TLE':
        type = 'purple';
        label = 'TLE';
        break;
      case 'MLE':
        type = 'purple';
        label = 'MLE';
        break;
      case 'RE':
        type = 'error';
        label = 'RE';
        break;
      case 'CE':
        type = 'warning';
        label = 'CE';
        break;
      case 'pending':
        type = 'gray';
        label = 'Pending';
        break;
      case 'judging':
        type = 'info';
        label = 'Judging';
        break;
      case 'SE':
        type = 'error';
        label = 'SE';
        break;
      default:
        type = 'gray';
        label = status;
    }

    return <StatusBadge status={type} text={label} size="sm" />;
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
    status: getStatusBadge(sub.status),
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
    <SurfaceSection>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          {/* Left Column: Filters */}
          <div className="cds--col-lg-4 cds--col-md-8">
            <ContainerCard title="篩選條件" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <TableToolbarSearch
                  placeholder="搜尋用戶或題目..."
                  onChange={(e: any) => setSearchQuery(e.target.value)}
                  persistent
                  size="lg"
                />
                
                <Dropdown
                  id="status-filter"
                  titleText="狀態"
                  label="選擇狀態"
                  items={statusOptions}
                  itemToString={(item: any) => (item ? item.label : '')}
                  selectedItem={statusOptions.find(s => s.id === statusFilter) || null}
                  onChange={({ selectedItem }: any) => {
                    if (selectedItem) {
                      setStatusFilter(selectedItem.id);
                      setPage(1);
                    }
                  }}
                />

                <Button 
                  kind="tertiary" 
                  renderIcon={refreshing ? InlineLoading : Renew} 
                  onClick={handleRefresh}
                  disabled={refreshing}
                  size="md"
                  style={{ width: '100%' }}
                >
                  {refreshing ? '更新中...' : '重新整理'}
                </Button>
              </div>
            </ContainerCard>
          </div>

          {/* Right Column: Table */}
          <div className="cds--col-lg-12 cds--col-md-8">
            <ContainerCard title={`提交記錄 (${totalItems})`} noPadding>
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
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header: any) => {
                            const { key, ...headerProps } = getHeaderProps({ header });
                            return (
                              <TableHeader {...headerProps} key={key}>
                                {header.header}
                              </TableHeader>
                            );
                          })}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row: any) => {
                          const { key, ...rowProps } = getRowProps({ row });
                          return (
                            <TableRow 
                              {...rowProps} 
                              key={key}
                              onClick={() => handleSubmissionClick(row.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              {row.cells.map((cell: any) => (
                                <TableCell key={cell.id}>{cell.value}</TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
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
                style={{ borderTop: '1px solid var(--cds-border-subtle)' }}
              />
            </ContainerCard>
          </div>
        </div>
      </div>
      
      <SubmissionDetailModal
        submissionId={searchParams.get('select_id')}
        isOpen={!!searchParams.get('select_id')}
        onClose={handleCloseModal}
      />
    </SurfaceSection>
  );
};

export default ContestSubmissionListPage;
