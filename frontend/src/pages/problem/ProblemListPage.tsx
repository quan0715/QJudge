import { useState, useEffect } from 'react';
import { 
  Pagination,
} from '@carbon/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import type { Problem } from '@/core/entities/problem.entity';
import ProblemTable from '@/components/problem/ProblemTable';
import type { ProblemRowData } from '@/components/problem/ProblemTable';

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

  // Pagination logic
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentProblems = problems.slice(startIndex, endIndex);

  const handleRowClick = (problem: ProblemRowData) => {
    navigate(`/problems/${problem.displayId || problem.id}`);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>題目列表</h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          挑戰各種難度的程式設計問題，提升你的演算法能力。
        </p>
      </div>

      <ProblemTable
        problems={currentProblems.map(p => ({
          ...p,
          id: p.id.toString(),
          title: p.title
        })) as ProblemRowData[]}
        mode="student"
        loading={loading}
        onRowClick={handleRowClick}
      />

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
