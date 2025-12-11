import { useState, useEffect, useTransition } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useContestNavigationGuard } from "@/hooks/useContestNavigationGuard";
import { Loading, Button } from "@carbon/react";
import ProblemSolver from "@/domains/problem/components/ProblemSolver";
import type { ProblemDetail as Problem } from "@/core/entities/problem.entity";
import type { SubmissionDetail as Submission } from "@/core/entities/submission.entity";
import { getContestProblem } from "@/services/contest";
import { useContest } from "@/domains/contest/contexts/ContestContext";
import { submitSolution } from "@/services/submission";

const ContestProblemPage = () => {
  const { contestId, problemId } = useParams<{
    contestId: string;
    problemId: string;
  }>();
  const navigate = useNavigate();
  const { contest } = useContest(); // Use context directly

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contestProblemInfo, setContestProblemInfo] = useState<{
    score?: number;
    label?: string;
  } | null>(null);
  const [_isPending, startTransition] = useTransition();

  useContestNavigationGuard(contestId, contest?.status === "active");

  useEffect(() => {
    const fetchData = async () => {
      // Wait for contest to be available from context
      if (!contestId || !problemId || !contest) return;

      try {
        setLoading(true);

        // Extract problem from contest data (now from context)
        const contestProblems = (contest as any).problems || [];

        // Find by problemId
        const contestProblemRef = contestProblems.find(
          (cp: any) =>
            cp.problemId?.toString() === problemId ||
            cp.problemId === Number(problemId) ||
            cp.problem_id?.toString() === problemId ||
            cp.problem_id === Number(problemId)
        );

        if (!contestProblemRef) {
          // If problem not found in list, it might be a permission issue or invalid ID
          // But we continue to try fetching the specific problem anyway,
          // as the list in context might be partial or cached
          console.warn("Problem reference not found in contest context list");
        } else {
          // Update contest problem info immediately for faster UI response
          setContestProblemInfo({
            score: contestProblemRef.score,
            label: contestProblemRef.label,
          });
        }

        // Fetch full problem details
        // We still need this call because the context only has summary info
        const fullProblem = await getContestProblem(contestId, problemId);
        if (!fullProblem) {
          throw new Error("Failed to load problem details");
        }

        startTransition(() => {
          setProblem(fullProblem);
        });
      } catch (err: any) {
        console.error("Error loading problem:", err);
        setError(err.message || "Failed to load problem");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [contestId, problemId, contest]); // Re-run when contest is loaded

  const handleSubmit = async (
    code: string,
    language: string,
    isTest: boolean,
    customTestCases?: any[]
  ): Promise<Submission | void> => {
    if (!problem || !contestId) return;

    try {
      const response = await submitSolution({
        contest_id: contestId,
        problem_id: problemId!,
        language: language,
        code: code,
        is_test: isTest,
        custom_test_cases: customTestCases,
      });

      // Return response for both test and full submit
      // ProblemSolver will show SubmissionDetailModal
      return response;
    } catch (err: any) {
      throw new Error(err.message || "提交失敗");
    }
  };

  if (loading) return <Loading />;
  if (error)
    return (
      <div style={{ padding: "2rem" }}>
        <h3>錯誤</h3>
        <p>{error}</p>
        <Button
          kind="secondary"
          onClick={() => navigate(`/contests/${contestId}`)}
        >
          返回競賽
        </Button>
      </div>
    );
  if (!problem) return <div>題目不存在</div>;

  // Check view permissions
  const canView =
    contest?.currentUserRole === "admin" ||
    contest?.currentUserRole === "teacher" ||
    contest?.permissions?.canEditContest ||
    (contest?.status === "active" &&
      contest?.hasStarted &&
      contest?.examStatus !== "locked");

  if (!canView) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h3>無法查看題目</h3>
        <p>比賽尚未開始、已結束，或您已被鎖定。</p>
        <Button
          kind="secondary"
          onClick={() => navigate(`/contests/${contestId}`)}
        >
          返回競賽大廳
        </Button>
      </div>
    );
  }

  const isSubmissionDisabled =
    contest?.status === "inactive" ||
    contest?.status === "ended" ||
    (!!contest?.endTime && new Date(contest.endTime) < new Date());

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
      }}
    >
      <ProblemSolver
        problem={problem}
        onSubmit={handleSubmit}
        contestId={contestId}
        contestName={contest?.name}
        problemScore={contestProblemInfo?.score}
        problemLabel={contestProblemInfo?.label}
        submissionDisabled={isSubmissionDisabled}
      />
    </div>
  );
};

export default ContestProblemPage;
