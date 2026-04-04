import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loading, Button, Tag } from "@carbon/react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useContestProblemSelection } from "@/features/contest/hooks/useContestProblemSelection";
import { ProblemMenu } from "@/shared/ui/solver/menu/ProblemMenu";
import { ProblemFullPageSolve } from "@/features/problems/components/solve/editorview/ProblemFullPageSolve";

/**
 * Practice mode - identical to solve but submissions are NOT recorded.
 * Opens in a new tab from the admin problem management toolbar.
 */
const ContestPracticeScreen = () => {
  const { t } = useTranslation("contest");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contest, scoreboardData, loading: contestLoading } = useContest();

  const myRank = useMemo(() => {
    if (!scoreboardData?.rows || !user) return null;
    const userId = user.id?.toString();
    return scoreboardData.rows.find((row) => row.userId === userId) || null;
  }, [scoreboardData, user]);

  const problemSelection = useContestProblemSelection({
    contest,
    myRank,
  });

  // Auto-select first problem
  useEffect(() => {
    if (!problemSelection.selectedProblemId && contest?.problems?.length) {
      problemSelection.selectProblem(contest.problems[0].problemId);
    }
  }, [contest?.problems, problemSelection]);

  if (contestLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loading />
      </div>
    );
  }

  if (!contest) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem" }}>
        <p>{t("error.contestNotFound", "找不到競賽資料")}</p>
        <Button kind="secondary" onClick={() => navigate(-1)}>
          {t("button.back", "返回")}
        </Button>
      </div>
    );
  }

  if (problemSelection.isProblemLoading || !problemSelection.selectedProblem) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loading />
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderBottom: "1px solid var(--cds-border-subtle)", background: "var(--cds-layer)" }}>
        <span style={{ fontWeight: 600 }}>{contest.name}</span>
        <Tag size="sm" type="purple">Practice</Tag>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ProblemFullPageSolve
          key={problemSelection.selectedProblemId}
          problem={problemSelection.selectedProblem}
          problemLabel={problemSelection.selectedProblemLabel}
          submissionDisabled
          menuPanel={
            <ProblemMenu
              problems={problemSelection.problems}
              selectedProblemId={problemSelection.selectedProblemId}
              onSelect={problemSelection.selectProblem}
            />
          }
          renderSubmissions={() => (
            <div style={{ padding: "1rem", color: "var(--cds-text-secondary)", textAlign: "center" }}>
              <Tag type="purple" size="sm">Practice</Tag>
              <p style={{ marginTop: "0.5rem" }}>{t("practice.submissionsDisabled", "Practice 模式不記錄提交")}</p>
            </div>
          )}
        />
      </div>
    </div>
  );
};

export default ContestPracticeScreen;
