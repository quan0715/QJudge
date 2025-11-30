import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContestNavigationGuard } from '../hooks/useContestNavigationGuard';
import { Loading, Button } from '@carbon/react';
import { ArrowLeft } from '@carbon/icons-react';
import ProblemSolver from '../components/ProblemSolver';
import type { Problem, Submission } from '../components/ProblemSolver';
import { api } from '../services/api';

const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contest, setContest] = useState<any>(null);
  
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
        // Backend may return 'problems' or 'problem_list' depending on serializer
        const contestProblems = (contestData as any).problems || (contestData as any).problem_list || [];
        console.log('Contest problems:', contestProblems);
        console.log('Looking for problem ID:', problemId);
        
        // Try to find by problem.id to verify it belongs to contest
        const contestProblemRef = contestProblems.find((cp: any) => 
          cp.problem.id.toString() === problemId || 
          cp.problem.id === Number(problemId)
        );

        if (!contestProblemRef) {
          console.error('Available problem IDs:', contestProblems.map((cp: any) => cp.problem.id));
          throw new Error('Problem not found in this contest');
        }

        // Fetch full problem details
        const fullProblem = await api.getContestProblem(contestId, problemId);
        if (!fullProblem) {
            throw new Error('Failed to load problem details');
        }

        console.log('Found contest problem:', fullProblem);

        // Set problem with score from contest reference
        setProblem({
          ...fullProblem,
          score: contestProblemRef.score
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem 2rem 0', display: 'flex', alignItems: 'center' }}>
        <Button 
          kind="ghost" 
          renderIcon={ArrowLeft} 
          onClick={() => navigate(`/contests/${contestId}`)}
        >
          返回題目列表
        </Button>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ProblemSolver
          problem={problem}
          onSubmit={handleSubmit}
          isContestMode={true}
          contestId={contestId}
        />
      </div>
    </div>
  );
};

export default ContestProblemPage;
