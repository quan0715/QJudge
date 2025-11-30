import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loading,
  Button,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Tag,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer
} from '@carbon/react';
import { ArrowLeft } from '@carbon/icons-react';
import Editor from '@monaco-editor/react';
import { authFetch } from '../services/auth';

interface SubmissionDetail {
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
  code: string;
  status: string;
  score: number;
  exec_time: number;
  memory_usage: number;
  error_message: string;
  created_at: string;
  results?: Array<{
    id: number;
    test_case: {
      id: number;
      order: number;
      is_sample: boolean;
    };
    status: string;
    exec_time: number;
    memory_usage: number;
    error_message: string;
  }>;
}

const SubmissionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const fetchSubmission = async () => {
    try {
      const res = await authFetch(`/api/v1/submissions/${id}/`);

      if (res.ok) {
        const data = await res.json();
        setSubmission(data);
        
        // Start polling if submission is pending or judging
        if (data.status === 'pending' || data.status === 'judging') {
          startPolling();
        }
      } else {
        console.error('Failed to fetch submission');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

    const startPolling = () => {
      const pollInterval = setInterval(async () => {
        try {
          const res = await authFetch(`/api/v1/submissions/${id}/`);

        if (res.ok) {
          const data = await res.json();
          setSubmission(data);
          
          // Stop polling if status is final
          if (data.status !== 'pending' && data.status !== 'judging') {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000); // Poll every second

    // Clean up interval on unmount
    return () => clearInterval(pollInterval);
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { type: any; label: string }> = {
      'AC': { type: 'green', label: '通過' },
      'WA': { type: 'red', label: '答案錯誤' },
      'TLE': { type: 'red', label: '超時' },
      'MLE': { type: 'red', label: '記憶體超限' },
      'RE': { type: 'red', label: '執行錯誤' },
      'CE': { type: 'red', label: '編譯錯誤' },
      'pending': { type: 'gray', label: '等待中' },
      'judging': { type: 'blue', label: '評測中' },
      'SE': { type: 'red', label: '系統錯誤' }
    };
    const config = statusConfig[status] || { type: 'gray', label: status };
    return <Tag type={config.type}>{config.label}</Tag>;
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

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <Loading />
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>提交不存在</p>
        <Button onClick={() => navigate('/submissions')}>返回列表</Button>
      </div>
    );
  }

  const resultHeaders = [
    { key: 'test_case', header: '測試案例' },
    { key: 'status', header: '狀態' },
    { key: 'time', header: '時間 (ms)' },
    { key: 'memory', header: '記憶體 (KB)' },
    { key: 'message', header: '訊息' }
  ];

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const resultRows = (submission.results || []).map((result) => ({
    id: result.id.toString(),
    test_case: result.test_case.is_sample 
      ? `範例 ${result.test_case.order + 1}` 
      : `測試 ${result.test_case.order + 1}`,
    status: getStatusTag(result.status),
    time: result.exec_time,
    memory: result.memory_usage,
    message: result.error_message || '-'
  }));

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <Button
          kind="ghost"
          renderIcon={ArrowLeft}
          onClick={() => navigate('/submissions')}
          style={{ marginBottom: '1rem' }}
        >
          返回列表
        </Button>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem' }}>
          提交 #{submission.id}
        </h2>
      </div>

      {/* Summary */}
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--cds-layer-01)',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid var(--cds-border-subtle)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              用戶
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {submission.user.username}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              題目
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              <a
                href={`/problems/${submission.problem.id}`}
                style={{ color: 'var(--cds-link-primary)', textDecoration: 'none' }}
              >
                {submission.problem.title}
              </a>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              語言
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {getLanguageLabel(submission.language)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              狀態
            </div>
            <div>{getStatusTag(submission.status)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              得分
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {submission.score}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              執行時間
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {submission.exec_time} ms
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              記憶體
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>
              {submission.memory_usage} KB
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              提交時間
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              {formatDate(submission.created_at)}
            </div>
          </div>
        </div>

        {submission.error_message && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
              錯誤訊息
            </div>
            <pre style={{
              padding: '1rem',
              backgroundColor: 'var(--cds-layer-02)',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              color: 'var(--cds-text-error)',
              margin: 0
            }}>
              {submission.error_message}
            </pre>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs>
        <TabList aria-label="Submission details">
          <Tab>程式碼</Tab>
          <Tab>測試結果</Tab>
        </TabList>
        <TabPanels>
          {/* Code Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ border: '1px solid var(--cds-border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                <Editor
                  height="500px"
                  language={submission.language === 'cpp' ? 'cpp' : submission.language}
                  value={submission.code}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
                    fontSize: 14,
                    scrollBeyondLastLine: false
                  }}
                />
              </div>
            </div>
          </TabPanel>

          {/* Test Results Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {submission.results && submission.results.length > 0 ? (
                <DataTable rows={resultRows} headers={resultHeaders}>
                  {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getTableContainerProps }: any) => (
                    <TableContainer {...getTableContainerProps()}>
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
                            <TableRow {...getRowProps({ row })} key={row.id}>
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
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                  暫無測試結果
                </div>
              )}
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
};

export default SubmissionDetailPage;
