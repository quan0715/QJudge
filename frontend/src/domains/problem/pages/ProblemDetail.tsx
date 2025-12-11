import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  SkeletonText,
  SkeletonPlaceholder,
  Tabs,
  Tab,
  TabList,
} from "@carbon/react";
import ProblemSolver from "../components/ProblemSolver";
import type { ProblemDetail as Problem } from "@/core/entities/problem.entity";
import type { SubmissionDetail as Submission } from "@/core/entities/submission.entity";
import { submitSolution } from "@/services/submission";
import { getProblem } from "@/services/problem";

/**
 * Skeleton loading component for ProblemSolver
 * Mimics the layout of Hero + Tabs + Content
 */
const ProblemSolverSkeleton: React.FC = () => {
  const contentMaxWidth = "1056px";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Hero Skeleton */}
      <div
        style={{
          backgroundColor: "var(--cds-background)",
          width: "100%",
          borderBottom: "1px solid var(--cds-border-subtle)",
        }}
      >
        <div
          style={{
            maxWidth: contentMaxWidth,
            margin: "0 auto",
            width: "100%",
            padding: "1rem",
          }}
        >
          {/* Badges skeleton */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <SkeletonPlaceholder style={{ width: "60px", height: "24px" }} />
            <SkeletonPlaceholder style={{ width: "80px", height: "24px" }} />
          </div>

          {/* Title skeleton */}
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="40%" />
          </div>

          {/* Metadata skeleton */}
          <div style={{ display: "flex", gap: "2rem" }}>
            <SkeletonText width="80px" />
            <SkeletonText width="80px" />
            <SkeletonText width="100px" />
          </div>
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div
        style={{
          backgroundColor: "var(--cds-layer-01)",
          borderBottom: "1px solid var(--cds-border-subtle)",
          position: "sticky",
          top: "3rem",
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: contentMaxWidth,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <Tabs selectedIndex={0}>
            <TabList aria-label="Loading tabs">
              <Tab disabled>題目描述</Tab>
              <Tab disabled>程式碼</Tab>
              <Tab disabled>提交紀錄</Tab>
              <Tab disabled>統計</Tab>
            </TabList>
          </Tabs>
        </div>
      </div>

      {/* Content Skeleton */}
      <div
        style={{
          flex: 1,
          width: "100%",
          backgroundColor: "var(--cds-layer-01)",
        }}
      >
        <div
          style={{
            maxWidth: contentMaxWidth,
            margin: "0 auto",
            width: "100%",
            padding: "2rem 1rem",
          }}
        >
          {/* Description content skeleton */}
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="20%" />
          </div>
          <div style={{ marginBottom: "2rem" }}>
            <SkeletonText paragraph lineCount={4} />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="15%" />
          </div>
          <div style={{ marginBottom: "2rem" }}>
            <SkeletonText paragraph lineCount={3} />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="15%" />
          </div>
          <SkeletonPlaceholder style={{ width: "100%", height: "120px" }} />
        </div>
      </div>
    </div>
  );
};

const ProblemDetail = () => {
  const { id } = useParams<{ id: string }>();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (
    code: string,
    language: string,
    isTest: boolean,
    customTestCases?: any[]
  ): Promise<Submission | void> => {
    if (!problem) return;

    try {
      const result = await submitSolution({
        problem_id: problem.id,
        language: language,
        code: code,
        is_test: isTest,
        custom_test_cases: customTestCases,
        contest_id: undefined,
      });
      return result;
    } catch (err: any) {
      throw new Error(err.message || "提交失敗，請檢查輸入並稍後再試");
    }
  };

  // Loading state - use skeleton instead of global loading
  if (loading) {
    return <ProblemSolverSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--cds-text-error)",
          minHeight: "calc(100vh - 48px)",
          backgroundColor: "var(--cds-background)",
        }}
      >
        {error}
      </div>
    );
  }

  // No problem found
  if (!problem) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          minHeight: "calc(100vh - 48px)",
          backgroundColor: "var(--cds-background)",
        }}
      >
        題目不存在
      </div>
    );
  }

  // Render ProblemSolver (which includes Hero + Tabs + Content)
  return <ProblemSolver problem={problem} onSubmit={handleSubmit} />;
};

export default ProblemDetail;
