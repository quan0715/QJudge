import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getContest, getContestStandings } from "@/infrastructure/api/repositories";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import {
  isContestEnded,
  getContestState,
  isContestManagerScopeRole,
} from "@/core/entities/contest.entity";
import {
  isExamMonitoringActive,
  shouldWarnOnExit as shouldWarnOnExitByPolicy,
} from "@/features/contest/domain/contestRuntimePolicy";
import {
  getClassroomContestDashboardPath,
  shouldRedirectToOverviewOnStrictSubmitted,
} from "@/features/contest/domain/contestRoutePolicy";
import { syncExamPrecheckGateByStatus } from "@/features/contest/anticheat/examPrecheckGate";
import { isFullscreen as isFullscreenMode } from "@/infrastructure/browser/fullscreen";
import { useExamRuntimeState, mergeExamRuntimeState } from "./useExamRuntimeState";

export function useContestLayoutState() {
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [loadedContest, setContest] = useState<ContestDetail | null>(null);
  const currentContest = loadedContest?.id === contestId ? loadedContest : null;
  const runtime = useExamRuntimeState(currentContest?.hasJoined ? contestId : undefined);
  const { refresh: refreshRuntime } = runtime;
  const contest = useMemo(() => mergeExamRuntimeState(currentContest, runtime.state, runtime.confirmedStatus), [currentContest, runtime.state, runtime.confirmedStatus]);
  const [contestLoading, setContestLoading] = useState(true);
  const [contestNotFound, setContestNotFound] = useState(false);
  const [contestError, setContestError] = useState<Error | null>(null);
  const requestVersion = useRef(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);

  const isSolvePage = /\/solve(?:\/|$)/.test(location.pathname);
  const isPaperExamPage = isSolvePage && contest?.contestType === "paper_exam";
  const isExamActive = isExamMonitoringActive(contest);
  const hasEnded = !!contest && (runtime.state
    ? !["in_progress", "paused", "locked"].includes(runtime.state.exam_status) &&
      Date.now() + (runtime.state.serverOffsetMs ?? 0) > Date.parse(contest.endTime)
    : isContestEnded(contest));
  const contestState = contest ? getContestState(contest) : null;
  const isUpcoming = contestState === "upcoming";
  const hasManagementRole = isContestManagerScopeRole(contest?.currentUserRole);
  const isAdmin = !!contest?.permissions?.canEditContest || hasManagementRole;

  const shouldWarnOnExit = shouldWarnOnExitByPolicy(contest, hasEnded);
  const effectiveClassroomId = classroomId || contest?.boundClassroomId;
  const dashboardPath =
    effectiveClassroomId && contestId
      ? getClassroomContestDashboardPath(effectiveClassroomId, contestId)
      : "/dashboard";

  const userScore = scoreboardData?.rows?.[0]?.totalScore ?? 0;
  const totalMaxScore = contest?.problems?.reduce(
    (sum, problem) => sum + (problem.maxScore || 0),
    0,
  ) ?? 0;

  const refreshContest = useCallback(async () => {
    if (!contestId) return;
    const version = ++requestVersion.current;
    setIsRefreshing(true);
    setContestError(null);
    try {
      const c = await getContest(contestId);
      if (version !== requestVersion.current) return;
      if (c) {
        setContest(c);
        setContestNotFound(false);
      } else if (!currentContest) {
        setContestNotFound(true);
      }
      void refreshRuntime();
    } catch (err) {
      if (version === requestVersion.current) {
        setContestError(err instanceof Error ? err : new Error("Failed to fetch contest"));
      }
    } finally {
      if (version === requestVersion.current) {
        setIsRefreshing(false);
        setContestLoading(false);
      }
    }
  }, [contestId, currentContest, refreshRuntime]);

  const fetchStandings = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestStandings(contestId);
      setScoreboardData(data);
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, [contestId]);

  // Keep loaded monitoring state during same-contest refreshes; discard replies
  // belonging to an earlier route or request.
  useEffect(() => {
    if (!contestId) return;
    const version = ++requestVersion.current;
    setContest((previous) => {
      const current = previous?.id === contestId ? previous : null;
      setContestLoading(!current);
      return current;
    });
    setContestNotFound(false);
    setContestError(null);
    getContest(contestId)
      .then((c) => {
        if (version !== requestVersion.current) return;
        if (c) setContest(c);
        else setContest(previous => {
          if (!previous) setContestNotFound(true);
          return previous;
        });
      })
      .catch((err) => {
        if (version === requestVersion.current) {
          setContestError(err instanceof Error ? err : new Error("Failed to fetch contest"));
        }
      })
      .finally(() => {
        if (version === requestVersion.current) {
          setContestLoading(false);
          setIsRefreshing(false);
        }
      });
    return () => { requestVersion.current += 1; };
  }, [contestId, location.pathname]);

  // Redirect to 404 if not found
  useEffect(() => {
    if (!contestLoading && contestNotFound) {
      navigate("/not-found", { replace: true });
    }
  }, [contestLoading, contestNotFound, navigate]);

  // Fetch standings on solve page
  useEffect(() => {
    if (isSolvePage && contest?.id) {
      fetchStandings();
    }
  }, [isSolvePage, contest?.id, fetchStandings]);

  // Gate-lifecycle only — routing to precheck is owned by RuntimeRouteWrapper.
  // ExamPrecheckScreen keeps its own call because that route sits outside this
  // layout; both go through the same shared function.
  useEffect(() => {
    if (!contestId) return;
    syncExamPrecheckGateByStatus(contestId, contest?.examStatus);
  }, [contest?.examStatus, contestId]);



  // Beforeunload warning for exam mode
  useEffect(() => {
    if (!shouldWarnOnExit) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnOnExit]);


  // Strict mode anti-leak: submitted before contest end can only stay on dashboard overview.
  useEffect(() => {
    if (!contestId || !contest) return;

    if (
      !shouldRedirectToOverviewOnStrictSubmitted({
        contestId,
        contest,
        pathname: location.pathname,
        search: location.search,
      })
    ) {
      return;
    }

    navigate(`${dashboardPath}?tab=overview`, {
      replace: true,
    });
  }, [contest, contestId, dashboardPath, location.pathname, location.search, navigate]);

  // Exam active beforeunload
  useEffect(() => {
    if (!isExamActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isExamActive]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(isFullscreenMode());
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  return {
    runtime,
    contestId,
    contest,
    contestLoading,
    contestNotFound,
    contestError,
    isFullscreen,
    isRefreshing,
    isSolvePage,
    isPaperExamPage,
    isExamActive,
    hasEnded,
    isUpcoming,
    isAdmin,
    shouldWarnOnExit,
    userScore,
    totalMaxScore,
    scoreboardData,
    refreshContest,
    navigate,
  };
}
