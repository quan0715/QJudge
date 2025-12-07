import { useState, useEffect } from 'react';
import { 
  Pagination,
  Grid,
  Column,
} from '@carbon/react';
import { useNavigate } from 'react-router-dom';
import { getProblems } from '@/services/problem';
import type { Problem } from '@/core/entities/problem.entity';
import ProblemTable from '../components/ProblemTable';
import type { ProblemRowData } from '../components/ProblemTable';
import { PageHeader } from '@/ui/layout/PageHeader';

const ProblemList = () => {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const data = await getProblems();
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
    <div style={{ width: '100%', minHeight: '100%', backgroundColor: 'var(--cds-background)' }}>
      {/* Max-width container */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
         <Grid>
            <Column lg={16} md={8} sm={4}>
                 <PageHeader 
                    title="題目列表"
                    subtitle="挑戰各種難度的程式設計問題，提升你的演算法能力。"
                 />

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
                    style={{ marginTop: 'var(--cds-spacing-05, 1rem)' }}
                  />
            </Column>
         </Grid>
      </div>
    </div>
  );
};

export default ProblemList;
