import { useState, useEffect } from 'react';
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
  Tag, 
  Pagination,
  Loading
} from '@carbon/react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckmarkFilled, View } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Problem } from '../services/api';

const headers = [
  { key: 'title', header: '題目' },
  { key: 'difficulty', header: '難度' },
  { key: 'acceptance_rate', header: '通過率' },
];

const ProblemListPage = () => {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const data = await api.getProblems();
        setProblems(data);
      } catch (error) {
        console.error('Failed to fetch problems', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProblems();
  }, []);

  const getDifficultyColor = (difficulty: string) => {
    const diff = difficulty.toLowerCase();
    switch (diff) {
      case 'easy': return 'green';
      case 'medium': return 'blue';
      case 'hard': return 'red';
      default: return 'gray';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    const diff = difficulty.toLowerCase();
    switch (diff) {
      case 'easy': return '簡單';
      case 'medium': return '中等';
      case 'hard': return '困難';
      default: return difficulty;
    }
  };

  // Pagination logic
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentProblems = problems.slice(startIndex, endIndex);

  const rows = currentProblems.map(p => ({
    id: p.id.toString(),
    title: (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link 
          to={`/problems/${p.display_id || p.id}`}
          style={{ 
            textDecoration: 'none', 
            color: 'var(--cds-link-primary)',
            fontWeight: 500,
            fontSize: '1rem'
          }}
        >
          {p.display_id || p.id}. {p.title}
        </Link>
        {/* TODO: Check actual solved status from backend */}
        {/* {p.solved && <CheckmarkFilled style={{ color: 'green' }} />} */}
      </div>
    ),
    difficulty: (
      <Tag type={getDifficultyColor(p.difficulty)}>
        {getDifficultyLabel(p.difficulty)}
      </Tag>
    ),
    acceptance_rate: (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>{p.acceptance_rate.toFixed(1)}%</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginLeft: '0.5rem' }}>
          ({p.accepted_count}/{p.submission_count})
        </span>
      </div>
    ),
  }));

  if (loading) {
    return <Loading />;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>題目列表</h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          挑戰各種難度的程式設計問題，提升你的演算法能力。
        </p>
      </div>

      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps, onInputChange }) => (
          <TableContainer 
            title="" 
            description=""
            style={{ 
              backgroundColor: 'transparent', // Removed background
              padding: '0', // Removed padding
              boxShadow: 'none' // Removed shadow
            }}
          >
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch 
                  onChange={(e) => onInputChange(e as any)} 
                  placeholder="搜尋題目..."
                  persistent
                />
              </TableToolbarContent>
            </TableToolbar>
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
                  <TableRow 
                    key={row.id}
                    onClick={() => navigate(`/problems/${currentProblems.find(p => p.id.toString() === row.id)?.display_id || row.id}`)}
                    style={{ cursor: 'pointer' }}
                    className="problem-row"
                  >
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
      <Pagination
        totalItems={problems.length}
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
        style={{ marginTop: '1rem' }}
      />
    </div>
  );
};

export default ProblemListPage;
