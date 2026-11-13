import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExamShell } from "@/shared/layout/ExamShell";
import { usePageHeaderActionsSlot } from "@/features/app/contexts/PageHeaderActionsContext";
import { RuntimeNavExtras } from "@/features/app/components/workspace/WorkspaceTopNav";
import { UserMenu } from "@/features/app/components/UserMenu";
import { useContest } from "../../contexts/ContestContext";
import { useContestRuntimeNavigator } from "../../contexts/useContestRuntimeNavigator";
import { ExamReviewSlotContext } from "../../contexts/ExamReviewSlotContext";
import { isContestParticipant, shouldLockContestWorkspaceNavigation } from "../../domain/contestRuntimePolicy";
import { resolveStudentContestPhase } from "../studentDashboard/studentDashboardState";
import { ExamQuestionList } from "./ExamQuestionList";
import { ExamIconButton } from "./ExamIconButton";
import { ExamHelpButton } from "./ExamHelpButton";
import { ExamWorkspaceIcon, type ExamWorkspaceIconName } from "./ExamWorkspaceIcon";
import { ExamWorkspacePanels, type ExamWorkspacePage } from "./ExamWorkspacePanels";
import styles from "./ExamWorkspaceShell.module.scss";

interface ExamWorkspaceShellProps {
  children: ReactNode;
  /** Teacher trial run: no timer, monitoring or saving. */
  preview?: boolean;
  /** Contest root route: children render the formal overview. */
  dashboard?: boolean;
}

// Matches the phone breakpoint in ExamShell.module.scss, where the list floats over the workspace.
const isNarrowViewport = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 41.98rem)").matches;

interface RailEntry {
  id: ExamWorkspacePage;
  label: string;
  icon: ExamWorkspaceIconName;
}

export function ExamWorkspaceShell({ children, preview = false, dashboard = false }: ExamWorkspaceShellProps) {
  const { t } = useTranslation("contest");
  const { contest } = useContest();
  const navigator = useContestRuntimeNavigator();
  const navigate = useNavigate();
  const { classroomId, contestId } = useParams();
  const headerActions = usePageHeaderActionsSlot();
  const contestPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const [page, setPage] = useState<ExamWorkspacePage>(dashboard ? "overview" : "questions");
  const [listCollapsed, setListCollapsed] = useState(isNarrowViewport);

  const [recordsTarget, setRecordsTarget] = useState<HTMLElement | null>(null);
  const [reviewActionsTarget, setReviewActionsTarget] = useState<HTMLElement | null>(null);
  const [hasRecords, setHasRecords] = useState(false);
  const reviewSlot = useMemo(() => ({ target: recordsTarget, actionsTarget: reviewActionsTarget, setHasRecords, openReview: () => setPage("review") }), [recordsTarget, reviewActionsTarget]);

  // Same rule as the formal overview: live scoreboard, or the full board after the exam when permitted.
  const canSeeStandings = contest?.contestType === "coding" && (
    !!contest.scoreboardVisibleDuringContest ||
    (!preview && isContestParticipant(contest) && resolveStudentContestPhase(contest) === "after" && !!contest.permissions?.canViewFullScoreboard)
  );
  // Once the exam is over or submitted there is nothing left to answer, so the questions entry goes.
  const canAnswer = preview || !contest || resolveStudentContestPhase(contest) !== "after";
  const activePage: ExamWorkspacePage = page === "standings" && !canSeeStandings ? "overview" : page;
  const onQuestions = activePage === "questions";

  const entries: RailEntry[] = [
    { id: "overview", label: t("workspace.rail.overview", "考試概覽"), icon: "overview" },
    ...(canAnswer ? [{ id: "questions" as const, label: t("workspace.rail.questions", "題目"), icon: "questions" as const }] : []),
    // Announcements are hidden for now; the panel stays in ExamWorkspacePanels.
    { id: "review", label: t("workspace.rail.review", "作答內容"), icon: "review" },
    ...(canSeeStandings ? [{ id: "standings" as const, label: t("workspace.rail.standings", "排行榜"), icon: "standings" as const }] : []),
  ];

  const selectPage = (next: ExamWorkspacePage) => {
    // The formal overview lives on the contest root route; answering lives under /solve.
    if (dashboard && next === "questions") {
      navigate(`/classrooms/${classroomId}/contest/${contestId}/solve`);
      return;
    }
    // The formal overview holds the end-exam action; only the teacher preview keeps a local one.
    if (!dashboard && !preview && next === "overview") {
      navigate(contestPath);
      return;
    }
    // The questions entry always brings the list back.
    if (next === "questions") setListCollapsed(false);
    setPage(next);
  };

  const openQuestion = (index: number) => {
    navigator?.onSelect(index);
    setPage("questions");
  };

  const collapseLabel = listCollapsed
    ? t("workspace.header.expandList", "展開題目列表")
    : t("workspace.header.collapseList", "收合題目列表");

  // Only a proctored attempt in progress keeps the student inside the exam.
  const canLeave = preview || !(contest?.cheatDetectionEnabled && shouldLockContestWorkspaceNavigation(contest));

  const header = (
    <>
      <div className={styles.headerLead}>
        {canLeave && (
          <ExamIconButton label={t("workspace.header.back", "返回課程")} onClick={() => navigate(`/classrooms/${classroomId}`)}>
            <ExamWorkspaceIcon name="back" />
          </ExamIconButton>
        )}
      </div>
      {onQuestions && (
        <ExamIconButton data-exam-tour="list-toggle" label={collapseLabel} aria-expanded={!listCollapsed} onClick={() => setListCollapsed((value) => !value)}>
          <ExamWorkspaceIcon name="sidebar" />
        </ExamIconButton>
      )}
      <h1 className={styles.title}>{contest?.name || t("workspace.header.fallbackTitle", "考試")}</h1>
      <ExamHelpButton
        contextKey={`${activePage}:${dashboard}:${contest?.examStatus}:${canAnswer}:${canSeeStandings}`}
        coding={contest?.contestType === "coding"}
      />
      {preview ? (
        <div className={styles.headerStatus}>
          <span className={styles.modeChip}>{t("workspace.header.previewMode", "試作答")}</span>
          <span className={styles.statusText}>{t("workspace.header.previewNotSaved", "不儲存答案")}</span>
        </div>
      ) : (
        <div className={styles.headerActions}><RuntimeNavExtras showRefresh={!headerActions} />{headerActions}</div>
      )}
    </>
  );

  // Settings only, so language and theme change without leaving the exam; the full menu
  // panel is anchored to the top-right header and would open far from the rail.
  const accountMenu = <UserMenu settingsOnly />;

  const rail = entries.map(({ id, label, icon }) => (
    <ExamIconButton
      key={id}
      label={label}
      tooltipPlacement="right"
      className={styles.railButton}
      aria-pressed={activePage === id}
      data-page={id}
      data-exam-tour={id}
      onClick={() => selectPage(id)}
    >
      <ExamWorkspaceIcon name={icon} size={19} />
    </ExamIconButton>
  ));

  const navigation = navigator && (
    <ExamQuestionList
      items={navigator.items}
      activeIndex={navigator.activeIndex}
      answeredIds={navigator.answeredIds}
      markedIds={navigator.markedIds}
      onSelect={(index) => {
        navigator.onSelect(index);
        if (isNarrowViewport()) setListCollapsed(true);
      }}
      collapsed={listCollapsed}
    />
  );

  // The answer surface stays mounted while other pages are open so drafts and editor state survive.
  const answerVisible = dashboard ? activePage === "overview" : onQuestions;
  const showPanel = !onQuestions && !(dashboard && activePage === "overview");

  return (
    <ExamReviewSlotContext.Provider value={reviewSlot}>
    <ExamShell header={header} rail={rail} railFooter={accountMenu} navigation={navigation} showNavigation={onQuestions} navigationCollapsed={listCollapsed}>
      <div className={styles.answerSurface} data-exam-tour={dashboard ? undefined : "answer"} data-dashboard={dashboard} hidden={!answerVisible}>
        {dashboard ? <div className={styles.pageInner} data-page="overview">{children}</div> : children}
      </div>
      {showPanel && (
        <section className={styles.page} aria-label={entries.find((entry) => entry.id === activePage)?.label}>
          <div className={styles.pageInner} data-page={activePage}>
            <ExamWorkspacePanels
              page={activePage}
              onResume={() => selectPage("questions")}
              onQuestion={openQuestion}
              hasRecords={hasRecords}
              recordsRef={setRecordsTarget}
              reviewActionsRef={setReviewActionsTarget}
            />
          </div>
        </section>
      )}
    </ExamShell>
    </ExamReviewSlotContext.Provider>
  );
}
