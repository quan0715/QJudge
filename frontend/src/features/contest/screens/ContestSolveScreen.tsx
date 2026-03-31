import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { getContestTypeModule } from "@/features/contest/modules/registry";

const ContestSolveScreen = () => {
  const params = useParams();
  const [query] = useSearchParams();
  const { contest } = useContest();
  const contestId = params.contestId || params.labId;

  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );

  if (!contestId) return null;

  return contestModule.student.getSolveRenderer()({
    contestId,
    contest,
    params,
    query,
  });
};

export default ContestSolveScreen;
