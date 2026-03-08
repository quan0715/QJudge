import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getContest, getContestStandings } from "@/infrastructure/api/repositories";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import { isContestEnded, getContestState } from "@/core/entities/contest.entity";
import { syncExamPrecheckGateByStatus } from "@/features/contest/screens/paperExam/hooks/useExamPrecheckGate";
import {
  isExamMonitoringActive,
  shouldWarnOnExit as shouldWarnOnExitByPolicy,
} from "@/features/contest/domain/contestRuntimePolicy";
import {
  getContestDashboardPath,
  getContestPrecheckPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { isFullscreen as isFullscreenMode } from "@/core/usecases/exam";
import { useInterval } from "@/shared/hooks/useInterval";

const CONTEST_POLL_INTERVAL_MS = 15_000;

export function useContestLayoutState() {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
  const [contestNotFound, setContestNotFound] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);

  const isSolvePage = location.pathname.includes("/solve/");
  const isPaperExamPage =
    location.pathname.includes("/paper-exam/") ||
    /\/paper-exam\/?$/.test(location.pathname);
  const isExamActive = isExamMonitoringActive(contest);
  const hasEnded = !!contest && isContestEnded(contest);
  const contestState = contest ? getContestState(contest) : null;
  const isUpcoming = contestState === "upcoming";
  const hasManagementRole =
    contest?.currentUserRole !== undefined &&
    contest.currentUserRole !== "student";
  const isAdmin = !!contest?.permissions?.canEditContest || hasManagementRole;

  const shouldWarnOnExit = shouldWarnOnExitByPolicy(contest, hasEnded);

  const userScore = scoreboardData?.rows?.[0]?.totalScore ?? 0;
  const totalMaxScore = contest?.problems?.reduce((sum, p) => sum + (p.score || 0), 0) ?? 0;

  const refreshContest = useCallback(async () => {
    if (contestId) {
      setIsRefreshing(true);
      try {
        const c = await getContest(contestId);
        setContest(c || null);
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [contestId]);

  const fetchStandings = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestStandings(contestId);
      setScoreboardData(data);
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, [contestId]);

  // Fetch contest on mount and when navigating back (path changes)
  useEffect(() => {
    if (contestId) {
      setContestLoading(true);
      setContestNotFound(false);
      getContest(contestId)
        .then((c) => {
          if (c) {
            setContest(c);
            setContestNotFound(false);
          } else {
            setContest(null);
            setContestNotFound(true);
          }
        })
        .catch(() => {
          setContest(null);
          setContestNotFound(true);
        })
        .finally(() => {
          setContestLoading(false);
        });
    }
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

  // Poll contest data periodically while exam is active (backend is source of truth)
  useInterval(() => {
    refreshContest().catch(() => {});
  }, isExamActive ? CONTEST_POLL_INTERVAL_MS : null);

  // Keep paper-exam precheck gate synced from contest dashboard lifecycle.
  useEffect(() => {
    if (!contestId) return;
    syncExamPrecheckGateByStatus(contestId, contest?.examStatus);
  }, [contest?.examStatus, contestId]);

  // Beforeunload warning for exam mode
  useEffect(() => {
    if (!shouldWarnOnExit) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "考試進行中，離開或刷新頁面將自動交卷。";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnOnExit]);

  // Treat paused state as a strict gate only for answering-related routes.
  // Keep dashboard root accessible so users can return from precheck without redirect loop.
  useEffect(() => {
    if (!contestId || !contest?.cheatDetectionEnabled) return;
    if (contest.examStatus !== "paused") return;

    const dashboardPath = getContestDashboardPath(contestId);
    const targetPath = getContestPrecheckPath(contestId);

    const normalizedPath = location.pathname.replace(/\/+$/, "");
    const isDashboardHome = normalizedPath === dashboardPath;
    if (!isDashboardHome && location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [contest?.cheatDetectionEnabled, contest?.examStatus, contestId, location.pathname, navigate]);

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
    contestId,
    contest,
    contestLoading,
    contestNotFound,
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
