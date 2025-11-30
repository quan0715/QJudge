import React, { useState, useEffect } from 'react';
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
  Pagination,
  Tag,
  Button,
  InlineLoading,
} from '@carbon/react';
import { View } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';

interface Submission {
  id: number;
  problem: number;
  user: number;
  language: string;
  status: string;
  score: number;
  exec_time: number;
  memory_usage: number;
  created_at: string;
}

interface ProblemSubmissionListProps {
  problemId: number;
}

const headers = [
  { key: 'status', header: '狀態' },
  { key: 'score', header: '分數' },
  { key: 'language', header: '語言' },
  { key: 'exec_time', header: '時間 (ms)' },
  { key: 'memory_usage', header: '記憶體 (KB)' },
  { key: 'created_at', header: '提交時間' },
  { key: 'actions', header: '操作' },
];

const ProblemSubmissionList: React.FC<ProblemSubmissionListProps> = ({ problemId }) => {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Note: Backend should handle this logic:
      // - Show all public submissions (is_test=false) for problem
      // - Show user's test submissions (is_test=true) for problem
      // For now, we just fetch all submissions for this problem
      const res = await fetch(`/api/v1/submissions/?problem=${problemId}&ordering=-created_at&page=${page}&page_size=${pageSize}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSubmissions(data.results || []);
      setTotal(data.count || 0);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [problemId, page, pageSize]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AC': return 'green';
      case 'WA': return 'red';
      case 'TLE': return 'magenta';
      case 'MLE': return 'magenta';
      case 'RE': return 'red';
      case 'CE': return 'gray';
      default: return 'gray';
    }
  };

  return (
    <div className="problem-submission-list">
      <DataTable rows={submissions.map(s => ({ ...s, id: s.id.toString() }))} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer title="提交歷史">
            <TableToolbar>
              <TableToolbarContent>
                <Button kind="ghost" onClick={fetchSubmissions} renderIcon={loading ? InlineLoading : undefined}>
                  重新整理
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const submission = submissions.find(s => s.id.toString() === row.id);
                  if (!submission) return null;
                  
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Tag type={getStatusColor(submission.status)}>
                          {submission.status}
                        </Tag>
                      </TableCell>
                      <TableCell>{submission.score}</TableCell>
                      <TableCell>{submission.language}</TableCell>
                      <TableCell>{submission.exec_time}</TableCell>
                      <TableCell>{submission.memory_usage}</TableCell>
                      <TableCell>
                        {formatDate(submission.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={View}
                          iconDescription="查看"
                          hasIconOnly
                          onClick={() => navigate(`/submissions/${submission.id}`)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      <Pagination
        totalItems={total}
        backwardText="上一頁"
        forwardText="下一頁"
        itemsPerPageText="每頁顯示"
        page={page}
        pageSize={pageSize}
        pageSizes={[10, 20, 50]}
        size="md"
        onChange={({ page, pageSize }) => {
          setPage(page);
          setPageSize(pageSize);
        }}
      />
    </div>
  );
};

export default ProblemSubmissionList;
