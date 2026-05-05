import { useNavigate } from "react-router-dom";
import { Checkmark, CircleDash, IncompleteCancel } from "@carbon/icons-react";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import type { SubmissionStatus } from "@/core/entities/submission.entity";
import { ExamNavigator } from "@/features/contest/components/exam/ExamNavigator";
import { useContestRuntimeNavigator } from "@/features/contest/contexts";

interface Props {
  classroomId: string;
  contestId: string;
  /** 已選的 problemId，用以高亮 */
  activeProblemId?: string;
  compact?: boolean;
  problems: ContestProblemSummary[];
}

type ProblemStatusKind = "done" | "partial" | "untouched";

const mapStatusKind = (status: SubmissionStatus | undefined): ProblemStatusKind => {
  if (status === "AC" || status === "passed") return "done";
  if (status === undefined) return "untouched";
  return "partial";
};

const renderStatusIcon = (kind: ProblemStatusKind) => {
  if (kind === "done") return <Checkmark size={16} aria-label="已完成" />;
  if (kind === "partial") return <IncompleteCancel size={16} aria-label="進行中" />;
  return <CircleDash size={16} aria-label="未作答" />;
};

export const SideMenuContestRuntimeSection = ({
  classroomId,
  contestId,
  activeProblemId,
  compact,
  problems,
}: Props) => {
  const navigate = useNavigate();
  const runtimeNavigator = useContestRuntimeNavigator();

  const solvePath = `/classrooms/${classroomId}/contest/${contestId}/solve`;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {runtimeNavigator ? (
        <ExamNavigator
          items={runtimeNavigator.items}
          activeIndex={runtimeNavigator.activeIndex}
          answeredIds={runtimeNavigator.answeredIds}
          markedIds={runtimeNavigator.markedIds}
          collapsed={compact}
          overviewLabel={runtimeNavigator.overviewLabel}
          onSelectOverview={runtimeNavigator.onSelectOverview}
          onSelect={runtimeNavigator.onSelect}
          hideHeader
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minHeight: 0 }}>
          {problems.length === 0 ? (
            <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
              {compact ? "" : "尚無題目"}
            </p>
          ) : (
            problems.map((p) => {
              const isActive = p.problemId === activeProblemId;
              const kind = mapStatusKind(p.userStatus);
              const target = `${solvePath}/${p.problemId}`;
              return (
                <button
                  key={p.problemId}
                  type="button"
                  onClick={() => navigate(target)}
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: compact ? "0.5rem" : "0.5rem 0.75rem",
                    borderRadius: "0.25rem",
                    background: isActive ? "var(--cds-layer-accent)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    color: "var(--cds-text-primary)",
                  }}
                >
                  {renderStatusIcon(kind)}
                  {!compact && (
                    <>
                      <span style={{ flexShrink: 0, fontWeight: 600 }}>{p.label}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.title}
                      </span>
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SideMenuContestRuntimeSection;
