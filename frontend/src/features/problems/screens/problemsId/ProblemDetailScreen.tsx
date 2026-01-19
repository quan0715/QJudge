import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { SkeletonText, SkeletonPlaceholder } from "@carbon/react";
import { ProblemDetailSection } from "./section";
import type { ProblemDetail as Problem } from "@/core/entities/problem.entity";
import type { SubmissionDetail as Submission } from "@/core/entities/submission.entity";
import { submitSolution } from "@/infrastructure/api/repositories/submission.repository";
import { getProblem } from "@/infrastructure/api/repositories/problem.repository";

/**
 * Skeleton loading component for ProblemDetailSection
 * Mimics the single-page layout: Hero + stacked content sections
 */
const ProblemDetailSkeleton: React.FC = () => {
  const contentMaxWidth = "1056px";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--cds-background)",
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

      {/* Content Skeleton - Stacked sections */}
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: contentMaxWidth,
          margin: "0 auto",
          padding: "2rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Section 1: Problem Description */}
        <div
          style={{
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "4px",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="20%" />
          </div>
          <SkeletonText paragraph lineCount={4} />
          <div style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
            <SkeletonText heading width="15%" />
          </div>
          <SkeletonText paragraph lineCount={3} />
        </div>

        {/* Section 2: Code Editor */}
        <div
          style={{
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "4px",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="15%" />
          </div>
          <SkeletonPlaceholder style={{ width: "100%", height: "300px" }} />
        </div>

        {/* Section 3: Discussion */}
        <div
          style={{
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "4px",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="10%" />
          </div>
          <SkeletonText paragraph lineCount={2} />
        </div>

        {/* Section 4: Submissions */}
        <div
          style={{
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "4px",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <SkeletonText heading width="12%" />
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

  /**
   * Handle formal submission only.
   * Test runs are handled by ProblemDetailSection using the test-run endpoint.
   */
  const handleSubmit = async (
    code: string,
    language: string
  ): Promise<Submission | void> => {
    if (!problem) return;

    try {
      const result = await submitSolution({
        problem_id: problem.id,
        language: language,
        code: code,
      });
      return result;
    } catch (err: any) {
      throw new Error(err.message || "提交失敗，請檢查輸入並稍後再試");
    }
  };

  // Loading state - use skeleton
  if (loading) {
    return <ProblemDetailSkeleton />;
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

  // Render ProblemDetailSection (single-page layout)
  return <ProblemDetailSection problem={problem} onSubmit={handleSubmit} />;
};

export default ProblemDetail;
