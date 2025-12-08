import { useState, useEffect, useRef, useTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContestNavigationGuard } from '@/hooks/useContestNavigationGuard';
import { Loading, Button } from '@carbon/react';
import ProblemSolver from '@/domains/problem/components/ProblemSolver';
import type { ProblemDetail as Problem } from '@/core/entities/problem.entity';
import type { SubmissionDetail as Submission } from '@/core/entities/submission.entity';
import { getContestProblem, getContest } from '@/services/contest';
import { submitSolution } from '@/services/submission';

const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contest, setContest] = useState<any>(null);
  const [contestProblemInfo, setContestProblemInfo] = useState<{ score?: number; label?: string } | null>(null);
  const [_isPending, startTransition] = useTransition();
  
  // Cache contest data by contestId
  const contestCache = useRef<{ id: string; data: any } | null>(null);
  
  useContestNavigationGuard(contestId, contest?.status === 'ongoing');

  useEffect(() => {
    const fetchData = async () => {
      if (!contestId || !problemId) return;
      
      try {
        // Use cached contest data if available
        let contestData = contestCache.current?.id === contestId 
          ? contestCache.current.data 
          : null;
        
        if (!contestData) {
          setLoading(true);
          contestData = await getContest(contestId);
          if (!contestData) throw new Error('Contest not found');
          contestCache.current = { id: contestId, data: contestData };
        }
        
        setContest(contestData);
        
        // Extract problem from contest data
        const contestProblems = (contestData as any).problems || [];
        
        // Find by problemId (camelCase after mapping from problem_id)
        const contestProblemRef = contestProblems.find((cp: any) => 
          cp.problemId?.toString() === problemId || 
          cp.problemId === Number(problemId) ||
          cp.problem_id?.toString() === problemId ||
          cp.problem_id === Number(problemId)
        );

        if (!contestProblemRef) {
          console.error('Available problem IDs:', contestProblems.map((cp: any) => cp.problemId || cp.problem_id));
          throw new Error('Problem not found in this contest');
        }

        // Update contest problem info immediately for faster UI response
        setContestProblemInfo({
          score: contestProblemRef.score,
          label: contestProblemRef.label
        });

        // Fetch full problem details with transition for smoother update
        const fullProblem = await getContestProblem(contestId, problemId);
        if (!fullProblem) {
            throw new Error('Failed to load problem details');
        }

        startTransition(() => {
          setProblem(fullProblem);
        });

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
      const response = await submitSolution({
        contest_id: contestId,
        problem_id: problemId!,
        language: language,
        code: code,
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

  // Check view permissions - use camelCase since contest is mapped via mapContestDetailDto
  const canView = 
    contest?.currentUserRole === 'admin' || 
    contest?.currentUserRole === 'teacher' || 
    contest?.permissions?.canEditContest ||
    (contest?.status === 'active' && contest?.hasStarted && contest?.examStatus !== 'locked');

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
    }}>
      <ProblemSolver
        problem={problem}
        onSubmit={handleSubmit}
        contestId={contestId}
        contestName={contest?.name}
        problemScore={contestProblemInfo?.score}
        problemLabel={contestProblemInfo?.label}
      />
    </div>
  );
};

export default ContestProblemPage;
