import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getContest, getContestStandings } from "@/infrastructure/api/repositories";
import type { ContestDetail, ScoreboardData } from "@/core/entities/contest.entity";
import { isContestEnded, getContestState } from "@/core/entities/contest.entity";

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
  const isExamActive = !!(contest?.examModeEnabled && contest?.examStatus === "in_progress");
  const hasEnded = !!contest && isContestEnded(contest);
  const contestState = contest ? getContestState(contest) : null;
  const isUpcoming = contestState === "upcoming";
  const isAdmin = !!contest?.permissions?.canEditContest;

  const shouldWarnOnExit = !!(
    contest?.examModeEnabled &&
    contest?.status === "published" &&
    !hasEnded &&
    (contest?.examStatus === "in_progress" ||
      contest?.examStatus === "paused" ||
      contest?.examStatus === "locked")
  );

  const userScore = scoreboardData?.rows?.[0]?.totalScore ?? 0;
  const totalMaxScore = contest?.problems?.reduce((sum, p) => sum + (p.score || 0), 0) ?? 0;

  const refreshContest = async () => {
    if (contestId) {
      setIsRefreshing(true);
      try {
        const c = await getContest(contestId);
        setContest(c || null);
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const fetchStandings = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestStandings(contestId);
      setScoreboardData(data);
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, [contestId]);

  // Fetch contest on mount
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
  }, [contestId]);

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

  // Redirect paused users to overview
  useEffect(() => {
    if (contest?.examStatus === "paused") {
      const path = window.location.pathname;
      const restrictedPaths = ["/problems", "/solve", "/submissions", "/standings"];
      if (restrictedPaths.some((p) => path.includes(p))) {
        navigate(`/contests/${contestId}`);
      }
    }
  }, [contest, contestId, navigate]);

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
      const isFullscreenNow = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { msFullscreenElement?: Element }).msFullscreenElement
      );
      setIsFullscreen(isFullscreenNow);
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
    isExamActive,
    hasEnded,
    isUpcoming,
    isAdmin,
    shouldWarnOnExit,
    userScore,
    totalMaxScore,
    refreshContest,
    navigate,
  };
}
