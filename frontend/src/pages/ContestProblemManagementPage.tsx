import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loading,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Tag,
  InlineNotification
} from '@carbon/react';
import { api } from '../services/api';
import type { Contest, Problem } from '../services/api';

/**
 * Page for managing contest problems after the contest has ended.
 * Allows contest creator/admin to publish problems to practice library.
 */
const ContestProblemManagementPage = () => {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<Contest | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        const contestData = await api.getContest(id);
        if (contestData) {
          setContest(contestData);
          
          // Fetch problems from contest
          // Note: This assumes contest.problems is available
          // You may need to adjust based on your actual API structure
          const contestWithProblems: any = contestData;
          if (contestWithProblems.problems) {
            setProblems(contestWithProblems.problems.map((cp: any) => cp.problem));
          }
        }
      } catch (err: any) {
        setError(err.message || '載入失敗');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handlePublish = async (problemId: string) => {
    if (!id) return;
    
    try {
      await api.publishProblemToPractice(id, problemId);
      
      // Refresh the problem list
      const contestData = await api.getContest(id);
      if (contestData) {
        const contestWithProblems: any = contestData;
        if (contestWithProblems.problems) {
          setProblems(contestWithProblems.problems.map((cp: any) => cp.problem));
        }
      }
      
      alert('成功將題目加入練習題庫！');
    } catch (err: any) {
      alert(err.message || '加入練習題庫失敗');
    }
  };

  if (loading) return <Loading />;
  if (error) return <div>{error}</div>;
  if (!contest) return <div>競賽不存在</div>;

  const headers = [
    { key: 'label', header: '題號' },
    { key: 'title', header: '題目名稱' },
    { key: 'difficulty', header: '難度' },
    { key: 'status', header: '練習題庫狀態' },
    { key: 'action', header: '操作' },
  ];

  const rows = problems.map((problem, index) => ({
    id: problem.id,
    label: String.fromCharCode(65 + index), // A, B, C...
    title: problem.title,
    difficulty: (
      <Tag type={problem.difficulty === 'easy' ? 'green' : problem.difficulty === 'hard' ? 'red' : 'blue'}>
        {problem.difficulty === 'easy' ? '簡單' : problem.difficulty === 'hard' ? '困難' : '中等'}
      </Tag>
    ),
    status: problem.is_practice_visible ? (
      <Tag type="teal">已在練習題庫</Tag>
    ) : (
      <Tag type="gray">未公開</Tag>
    ),
    action: problem.is_practice_visible ? (
      <Button size="sm" kind="ghost" disabled>
        已加入
      </Button>
    ) : (
      <Button 
        size="sm" 
        kind="tertiary"
        onClick={() => handlePublish(problem.id)}
        disabled={!contest.is_ended}
      >
        加入練習題庫
      </Button>
    ),
  }));

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>
          題目管理：{contest.title}
        </h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          管理競賽題目是否公開到練習題庫
        </p>
      </div>

      {!contest.is_ended && (
        <InlineNotification
          kind="warning"
          title="競賽尚未結束"
          subtitle="請先在競賽管理頁面按下「結束競賽」按鈕，才能將題目加入練習題庫。"
          lowContrast
          style={{ marginBottom: '2rem' }}
        />
      )}

      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};

export default ContestProblemManagementPage;
