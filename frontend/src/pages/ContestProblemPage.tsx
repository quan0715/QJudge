import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loading, Button } from '@carbon/react';
import { ArrowLeft } from '@carbon/icons-react';
import ProblemSolver from '../components/ProblemSolver';
import type { Problem, Submission } from '../components/ProblemSolver';
import { api } from '../services/api';
import type { Contest } from '../services/api';

const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contest, setContest] = useState<Contest | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!contestId || !problemId) return;
      try {
        // Fetch contest details which includes problems
        const contestData = await api.getContest(contestId);
        if (!contestData) throw new Error('Contest not found');
        setContest(contestData);

        // Find the specific problem in the contest
        // The contestData.problems is a list of ContestProblem objects
        // We need to cast it to any because the type definition might not be fully updated in api.ts
        // We need to cast it to any because the type definition might not be fully updated in api.ts
        // Admin serializer returns 'problem_list', Student serializer returns 'problems'
        const contestProblems = (contestData as any).problems || (contestData as any).problem_list || [];
        const contestProblem = contestProblems.find((p: any) => p.problem.id.toString() === problemId);

        if (!contestProblem) {
          throw new Error('Problem not found in this contest');
        }

        // Construct the problem object for ProblemSolver
        // We merge the problem details with contest-specific info (score)
        setProblem({
          ...contestProblem.problem,
          score: contestProblem.score
        });

      } catch (err: any) {
        setError(err.message || '無法載入題目資料');
        console.error(err);
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
            navigate(`/contests/${contestId}/dashboard`);
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
      <Button kind="secondary" onClick={() => navigate(`/contests/${contestId}/dashboard`)}>
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
          onClick={() => navigate(`/contests/${contestId}/dashboard`)}
        >
          返回題目列表
        </Button>
      </div>
      
      <div style={{ flex: 1 }}>
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
