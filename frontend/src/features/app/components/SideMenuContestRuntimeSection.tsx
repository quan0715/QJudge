import { useNavigate } from "react-router-dom";
import { ContentSwitcher, Switch } from "@carbon/react";
import { Checkmark, CircleDash, IncompleteCancel } from "@carbon/icons-react";
import { useContest } from "@/features/contest/contexts/ContestContext";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import type { SubmissionStatus } from "@/core/entities/submission.entity";

interface Props {
  classroomId: string;
  contestId: string;
  /** 'solve' | 'dashboard' — current sidebar tab */
  activeTab: "solve" | "dashboard";
  /** 已選的 problemId，用以高亮 */
  activeProblemId?: string;
  compact?: boolean;
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
  activeTab,
  activeProblemId,
  compact,
}: Props) => {
  const navigate = useNavigate();
  const { contest } = useContest();

  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const solvePath = `/classrooms/${classroomId}/contest/${contestId}/solve`;

  const handleTabChange = ({ name }: { name?: string | number }) => {
    if (name === "dashboard") navigate(dashboardPath);
    else navigate(solvePath);
  };

  const problems: ContestProblemSummary[] = contest?.problems ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {!compact && (
        <ContentSwitcher
          selectedIndex={activeTab === "solve" ? 0 : 1}
          onChange={handleTabChange}
          size="sm"
        >
          <Switch name="solve" text="Solve" />
          <Switch name="dashboard" text="Dashboard" />
        </ContentSwitcher>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
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
    </div>
  );
};

export default SideMenuContestRuntimeSection;
