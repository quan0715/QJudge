import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loading, Button, Header, HeaderName } from "@carbon/react";
import {
  ArrowLeft,
  Edit,
  Screen,
  Minimize,
  DocumentView,
} from "@carbon/icons-react";
import type { ProblemDetail as Problem } from "@/core/entities/problem.entity";
import { getProblem } from "@/infrastructure/api/repositories/problem.repository";
import { ProblemFullPageSolve } from "@/features/problems/components/solve/editorview/ProblemFullPageSolve";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import "./screen.scss";

/**
 * ProblemSolveScreen - Full-screen IDE-style problem solving page
 *
 * Route: /problems/:id/solve
 *
 * Provides a distraction-free coding environment for solving
 * individual problems outside of contests.
 */
const ProblemSolveScreen = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if user has write permission
  const canEdit = user && (user.role === "admin" || user.role === "teacher");

  // Toggle browser fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Navigate to single-page problem view
  const goToSinglePageView = useCallback(() => {
    if (problem) {
      navigate(`/problems/${problem.id}`);
    }
  }, [navigate, problem]);

  useEffect(() => {
    const fetchProblem = async () => {
      if (!id) return;
      try {
        const fetchedProblem = await getProblem(id);
        if (!fetchedProblem) throw new Error("Failed to fetch problem");
        setProblem(fetchedProblem);
      } catch (err) {
        setError("無法載入題目資料");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProblem();
  }, [id]);

  // Simplified header with back button, title, and action buttons
  const renderHeader = () => (
    <Header aria-label="Problem Solver" className="problem-solve-screen__header">
      {/* Left section */}
      <div className="problem-solve-screen__header-left">
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={ArrowLeft}
          iconDescription="返回上一頁"
          onClick={() => navigate(-1)}
        />
        <HeaderName prefix="" className="problem-solve-screen__title">
          {problem?.title || "題目"}
        </HeaderName>
      </div>

      {/* Right section */}
      <div className="problem-solve-screen__header-right">
        {/* Single page view button */}
        {problem && (
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={DocumentView}
            iconDescription="單頁模式"
            onClick={goToSinglePageView}
          />
        )}

        {/* Fullscreen toggle */}
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={isFullscreen ? Minimize : Screen}
          iconDescription={isFullscreen ? "退出全螢幕" : "全螢幕"}
          onClick={toggleFullscreen}
        />

        {/* Edit button for admin/teacher */}
        {canEdit && problem && (
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={Edit}
            iconDescription="編輯題目"
            onClick={() => navigate(`/problems/${problem.id}/edit`)}
          />
        )}
      </div>
    </Header>
  );

  // Loading state
  if (loading) {
    return (
      <div className="problem-solve-screen">
        {renderHeader()}
        <div className="problem-solve-screen__content problem-solve-screen__content--loading">
          <Loading />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !problem) {
    return (
      <div className="problem-solve-screen">
        {renderHeader()}
        <div className="problem-solve-screen__content problem-solve-screen__content--error">
          <h3>{error || "題目不存在"}</h3>
          <Button kind="secondary" onClick={() => navigate(-1)}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="problem-solve-screen">
      {renderHeader()}
      <div className="problem-solve-screen__content">
        <ProblemFullPageSolve problem={problem} problemLabel={problem.title} />
      </div>
    </div>
  );
};

export default ProblemSolveScreen;
