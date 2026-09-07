import "./SideMenuContestRuntimeSection.scss";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@carbon/react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Close, DocumentBlank, RecentlyViewed, Checkmark, CircleDash, IncompleteCancel } from "@carbon/icons-react";
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
  if (status == null || status === "NS") return "untouched";
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
  const { t } = useTranslation("common");
  const runtimeNavigator = useContestRuntimeNavigator();

  const codingNavigator = runtimeNavigator?.coding ? runtimeNavigator : null;
  const displayedProblems = codingNavigator
    ? codingNavigator.items.flatMap((item) => item.kind === "coding" ? [item.data] : [])
    : problems;
  const solvePath = `/classrooms/${classroomId}/contest/${contestId}/solve`;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Button className="contest-runtime-nav-action" kind="ghost" hasIconOnly={compact} tooltipPosition="right" {...{ autoAlign: true }} renderIcon={ArrowLeft}
          iconDescription={t("workspaceTopNav.backToContest", "返回競賽主頁")}
          onClick={() => navigate(`/classrooms/${classroomId}/contest/${contestId}`)}>
          {!compact && t("workspaceTopNav.backToContest", "返回競賽主頁")}
        </Button>
      {runtimeNavigator && !runtimeNavigator.coding ? (
        <ExamNavigator
          items={runtimeNavigator.items}
          activeIndex={runtimeNavigator.activeIndex}
          answeredIds={runtimeNavigator.answeredIds}
          markedIds={runtimeNavigator.markedIds}
          collapsed={compact}
          onSelect={runtimeNavigator.onSelect}
          hideHeader
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
          {displayedProblems.length === 0 ? (
            <p style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
              {compact ? "" : "尚無題目"}
            </p>
          ) : (
            displayedProblems.map((p, index) => {
              const isActive = codingNavigator ? codingNavigator.activeIndex === index : p.id === activeProblemId || p.problemId === activeProblemId;
              const kind = codingNavigator?.answeredIds.has(p.id) ? "done" : mapStatusKind(p.userStatus);
              const target = `${solvePath}/${p.id}`;
              return (
                <Fragment key={p.id}>
                  <Button
                    kind="ghost"
                    className="contest-runtime-problem"
                    data-solved={kind === "done"}
                    data-status={kind}
                    type="button"
                    onClick={() => codingNavigator ? codingNavigator.onSelect(index) : navigate(target)}
                    aria-current={isActive ? "page" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: compact ? "0.5rem" : "0.5rem 0.75rem",
                      borderRadius: 0,
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      justifyContent: compact ? "center" : "flex-start",
                      maxWidth: "none",
                    }}
                  >
                    {!compact && renderStatusIcon(kind)}
                    <span style={{ flexShrink: 0, fontWeight: 600 }}>{p.label}</span>
                    {!compact && (
                      <>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.title}
                        </span>
                      </>
                    )}
                  </Button>
                  {isActive && codingNavigator && [
                    { label: t("workspaceTopNav.problemInfo", "題目資訊"), icon: DocumentBlank },
                    { label: t("workspaceTopNav.submissions", "繳交記錄"), icon: RecentlyViewed },
                  ].map((tab, index) => (
                      <Button key={index} className="contest-runtime-nav-action" kind="ghost" hasIconOnly={compact} tooltipPosition="right" {...{ autoAlign: true }}
                        renderIcon={tab.icon} iconDescription={tab.label}
                        aria-pressed={!codingNavigator.statementCollapsed && codingNavigator.activeTabIndex === index}
                        onClick={() => codingNavigator.selectTab?.(index)}>
                        {!compact && tab.label}
                      </Button>
                  ))}
                  {isActive && codingNavigator && (
                    <Button className="contest-runtime-nav-action" kind="ghost" hasIconOnly={compact} tooltipPosition="right" {...{ autoAlign: true }}
                      renderIcon={Close} iconDescription={t("workspaceTopNav.closeInfoPanel")}
                      onClick={() => codingNavigator.closeStatement?.()}>
                      {!compact && t("workspaceTopNav.closeInfoPanel")}
                    </Button>
                  )}
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SideMenuContestRuntimeSection;
