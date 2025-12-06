import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContestNavigationGuard } from '@/hooks/useContestNavigationGuard';
import { Loading, Button } from '@carbon/react';
import ProblemSolver from '@/components/problem/ProblemSolver';
import ContestSidebar from '@/components/contest/ContestSidebar';
import type { ProblemDetail as Problem } from '@/core/entities/problem.entity';
import type { SubmissionDetail as Submission } from '@/core/entities/submission.entity';
import { api } from '@/services/api';

import { ChevronLeft, ChevronRight } from '@carbon/icons-react';

const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contest, setContest] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  useContestNavigationGuard(contestId, contest?.status === 'ongoing');

  useEffect(() => {
    const fetchData = async () => {
      if (!contestId || !problemId) return;
      try {
        // Fetch contest data which includes problem list
        const contestData = await api.getContest(contestId);
        if (!contestData) throw new Error('Contest not found');
        setContest(contestData);
        
        // Extract problem from contest data
        // Backend returns 'problems' with the ContestProblemSerializer format
        const contestProblems = (contestData as any).problems || [];
        console.log('Contest problems:', contestProblems);
        console.log('Looking for problem ID:', problemId);
        
        // Try to find by problem_id (from the serializer)
        const contestProblemRef = contestProblems.find((cp: any) => 
          cp.problem_id?.toString() === problemId || 
          cp.problem_id === Number(problemId)
        );

        if (!contestProblemRef) {
          console.error('Available problem IDs:', contestProblems.map((cp: any) => cp.problem_id));
          throw new Error('Problem not found in this contest');
        }

        // Fetch full problem details
        const fullProblem = await api.getContestProblem(contestId, problemId);
        if (!fullProblem) {
            throw new Error('Failed to load problem details');
        }

        console.log('Found contest problem:', fullProblem);

        // Set problem with score from contest reference
        setProblem(fullProblem);

      } catch (err: any) {
        console.error('Error loading problem:', err);
        setError(err.message || 'Failed to load problem');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [contestId, problemId]);

  const handleSubmit = async (code: string, language: string, isTest: boolean): Promise<Submission | void> => {
    if (!problem || !contestId) return;

    try {
      const response = await api.submitSolution({
        problem_id: problem.id.toString(),
        language,
        code,
        contest_id: contestId,
        is_test: isTest
      });

      if (isTest) {
        return response;
      } else {
        // For official submission, we might want to stay on the page or go to dashboard
        // Usually in contests, you stay on the problem page or go to status
        // Let's redirect to contest dashboard or a submission list if available
        // For now, let's redirect to the contest dashboard to see the status
        setTimeout(() => {
            navigate(`/contests/${contestId}`);
        }, 100);
      }
    } catch (err: any) {
      throw new Error(err.message || '提交失敗');
    }
  };

  if (loading) return <Loading />;
  if (error) return (
    <div style={{ padding: '2rem' }}>
      <h3>錯誤</h3>
      <p>{error}</p>
      <Button kind="secondary" onClick={() => navigate(`/contests/${contestId}`)}>
        返回競賽
      </Button>
    </div>
  );
  if (!problem) return <div>題目不存在</div>;

  // Check view permissions
  const canView = 
    contest?.current_user_role === 'admin' || 
    contest?.current_user_role === 'teacher' || 
    (contest?.status === 'active' && contest?.has_started && !contest?.is_locked);

  if (!canView) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>無法查看題目</h3>
        <p>比賽尚未開始、已結束，或您已被鎖定。</p>
        <Button kind="secondary" onClick={() => navigate(`/contests/${contestId}`)}>
          返回競賽大廳
        </Button>
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Left Side - Contest Sidebar (Collapsible) */}
      <div style={{ 
        width: isSidebarOpen ? '300px' : '0px',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--cds-layer-01)',
        borderRight: isSidebarOpen ? '1px solid var(--cds-border-subtle-01)' : 'none',
        transition: 'width 0.3s ease, border 0.3s ease',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ width: '300px', height: '100%', padding: '1rem' }}>
          <ContestSidebar 
            contest={contest}
            currentProblemId={problemId}
          />
        </div>
      </div>

      {/* Toggle Button */}
      <div style={{
        position: 'absolute',
        left: isSidebarOpen ? '300px' : '0',
        top: '1rem',
        zIndex: 10,
        transition: 'left 0.3s ease'
      }}>
        <Button
          hasIconOnly
          renderIcon={isSidebarOpen ? ChevronLeft : ChevronRight}
          iconDescription={isSidebarOpen ? "收起列表" : "展開列表"}
          kind="ghost"
          size="sm"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            backgroundColor: 'var(--cds-layer-01)',
            border: '1px solid var(--cds-border-subtle-01)',
            borderLeft: isSidebarOpen ? 'none' : '1px solid var(--cds-border-subtle-01)',
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            boxShadow: '2px 0 4px rgba(0,0,0,0.1)'
          }}
        />
      </div>

      {/* Right Side - Problem Solver */}
      <div style={{ 
        flex: 1,
        height: '100%',
        overflow: 'auto',
        paddingLeft: isSidebarOpen ? '0' : '1rem' // Add some padding when sidebar is closed
      }}>
        <ProblemSolver
          problem={problem}
          onSubmit={handleSubmit}
          isContestMode={true}
          contestId={contestId}
          readOnly={
            contest?.status === 'inactive' || 
            contest?.is_locked || 
            contest?.has_finished_exam
          }
        />
      </div>
    </div>
  );
};

export default ContestProblemPage;
