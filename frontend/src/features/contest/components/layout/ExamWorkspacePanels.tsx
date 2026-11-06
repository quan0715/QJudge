import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import ReactMarkdown from "react-markdown";
import { getContestAnnouncements, getContestStandings } from "@/infrastructure/api/repositories";
import { formatScoreCompact as formatScore } from "@/shared/utils/scoreFormat";
import { formatExamDuration as formatDuration, formatExamTime as formatWhen } from "../../utils/examWorkspaceFormat";
import type { ContestDetail, ContestProblemSummary } from "@/core/entities/contest.entity";
import { useContest } from "../../contexts/ContestContext";
import { useContestRuntimeNavigator } from "../../contexts/useContestRuntimeNavigator";
import { buildPaperQuestionLabels } from "../../domain/paperQuestionLabels";
import ContestProblemSubmissions from "../solver/submissions/ContestProblemSubmissions";
import type { ExamItem } from "../../types/exam.types";
import { ExamWorkspaceIcon } from "./ExamWorkspaceIcon";
import { ExamOverviewLayout } from "./ExamOverviewLayout";
import styles from "./ExamWorkspaceShell.module.scss";

export type ExamWorkspacePage = "overview" | "questions" | "announcements" | "review" | "standings";

interface ExamWorkspacePanelsProps {
  page: ExamWorkspacePage;
  onResume?: () => void;
  onQuestion: (index: number) => void;
  /** The formal overview supplies answer records and results for the review page. */
  hasRecords?: boolean;
  recordsRef?: (element: HTMLElement | null) => void;
}

export function ExamWorkspacePanels({ page, onQuestion, onResume, hasRecords = false, recordsRef }: ExamWorkspacePanelsProps) {
  const { t } = useTranslation("contest");
  const { contest } = useContest();
  if (!contest) return <PageState kind="loading" title={t("workspace.loading", "載入考試")} />;
  if (page === "overview") return <OverviewPanel contest={contest} onResume={onResume} />;
  if (page === "announcements") return <AnnouncementsPanel contest={contest} />;
  if (page === "review") return <ReviewPanel contest={contest} onQuestion={onQuestion} hasRecords={hasRecords} recordsRef={recordsRef} />;
  if (page === "standings") return <StandingsPanel contest={contest} />;
  return null;
}

/* ---------- shared page parts ---------- */

function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h2 className={styles.pageTitle}>{title}</h2>
        {description && <p className={styles.pageDescription}>{description}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

function PageState({ kind, title, description, onRetry }: { kind: "loading" | "empty" | "error"; title: string; description?: string; onRetry?: () => void }) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.pageState} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      {kind === "loading" ? <span className={styles.spinner} aria-hidden="true" /> : <ExamWorkspaceIcon name="empty" size={26} />}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {onRetry && <button type="button" className={styles.textButton} onClick={onRetry}>{t("workspace.retry", "重試")}</button>}
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={styles.pill} data-tone={tone}>{children}</span>;
}

/* ---------- overview ---------- */

function OverviewPanel({ contest, onResume }: { contest: ContestDetail; onResume?: () => void }) {
  const { t } = useTranslation("contest");
  const navigator = useContestRuntimeNavigator();
  const items = navigator?.items ?? [];
  const total = items.length || contest.problems?.length || 0;
  const answered = navigator?.answeredIds.size ?? 0;
  const maxScore = items.reduce((sum, item) => sum + (item.kind === "coding" ? item.data.maxScore ?? 0 : item.data.score ?? 0), 0);
  const durationMinutes = Math.max(0, Math.round((Date.parse(contest.endTime) - Date.parse(contest.startTime)) / 60000));
  const typeLabel = contest.contestType === "coding" ? t("workspace.overview.coding", "程式考試") : t("workspace.overview.paper", "考卷考試");

  return (
    <ExamOverviewLayout
      kicker={<>{typeLabel} · {t("workspace.overview.questionCount", `${total} 題`, { count: total })}{maxScore > 0 && <> · {t("workspace.overview.totalScore", `共 ${formatScore(maxScore)} 分`, { score: formatScore(maxScore) })}</>}</>}
      title={contest.name}
      description={contest.description || t("workspace.overview.defaultDescription", "請閱讀考試資訊，準備好後即可進入作答。")}
      rules={contest.rules ? { title: t("workspace.overview.rules", "應試規則"), body: contest.rules } : null}
      facts={[
        { key: "start", label: t("workspace.overview.start", "開始時間"), value: formatWhen(contest.startTime) },
        { key: "end", label: t("workspace.overview.end", "截止時間"), value: formatWhen(contest.endTime) },
        { key: "duration", label: t("workspace.overview.duration", "作答時長"), value: formatDuration(durationMinutes, t) },
        { key: "progress", label: t("workspace.overview.progress", "作答進度"), value: `${answered} / ${total}` },
      ]}
      actions={onResume && (
        <button type="button" className={styles.primaryButton} onClick={onResume}>
          {t("workspace.overview.resume", "進入作答")}
          <ExamWorkspaceIcon name="arrowRight" size={16} />
        </button>
      )}
    />
  );
}

/* ---------- announcements ---------- */

function AnnouncementsPanel({ contest }: { contest: ContestDetail }) {
  const { t } = useTranslation("contest");
  const announcements = useQuery({
    queryKey: ["examWorkspaceAnnouncements", contest.id],
    queryFn: () => getContestAnnouncements(contest.id),
    refetchInterval: 30000,
  });
  return (
    <>
      <PageHeader title={t("workspace.announcements.title", "公告")} description={t("workspace.announcements.description", "考試期間的通知會即時顯示在這裡。")} />
      {announcements.isPending ? (
        <PageState kind="loading" title={t("workspace.announcements.loading", "載入公告")} />
      ) : announcements.isError ? (
        <PageState kind="error" title={t("workspace.announcements.failed", "公告載入失敗")} onRetry={() => void announcements.refetch()} />
      ) : announcements.data?.length ? (
        <div className={styles.announcementList}>
          {announcements.data.map((item) => (
            <article className={styles.announcement} key={item.id}>
              <header><h3>{item.title}</h3><time dateTime={item.created_at}>{formatWhen(item.created_at)}</time></header>
              <div className={styles.prose}><ReactMarkdown>{item.content}</ReactMarkdown></div>
            </article>
          ))}
        </div>
      ) : (
        <PageState kind="empty" title={t("workspace.announcements.empty", "目前沒有公告")} />
      )}
    </>
  );
}

/* ---------- review ---------- */

function codingStatus(problem: ContestProblemSummary, solved: boolean, t: TFunction<"contest">) {
  if (solved || problem.userStatus === "AC") return { tone: "success" as const, label: t("workspace.status.accepted", "已通過") };
  if (problem.userStatus === "pending" || problem.userStatus === "judging") return { tone: "neutral" as const, label: t("workspace.status.judging", "評測中") };
  if (problem.userStatus) return { tone: "warning" as const, label: t("workspace.status.attempted", "已提交，未通過") };
  return { tone: "neutral" as const, label: t("workspace.status.notSubmitted", "未提交") };
}

interface ReviewPanelProps {
  contest: ContestDetail;
  onQuestion: (index: number) => void;
  hasRecords: boolean;
  recordsRef?: (element: HTMLElement | null) => void;
}

function ReviewPanel({ contest, onQuestion, hasRecords, recordsRef }: ReviewPanelProps) {
  const { t } = useTranslation("contest");
  const navigator = useContestRuntimeNavigator();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const items: ExamItem[] = navigator?.items ?? [];
  const answeredIds = navigator?.answeredIds ?? new Set<string>();
  const markedIds = navigator?.markedIds;
  const labels = buildPaperQuestionLabels(items.flatMap((item) => item.kind === "question" ? [item.data] : []));
  const answered = items.filter((item) => answeredIds.has(item.data.id)).length;
  const marked = items.filter((item) => markedIds?.has(item.data.id)).length;
  const isCoding = contest.contestType === "coding";

  const toggle = (id: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const summary = isCoding
    ? t("workspace.review.codingSummary", `已通過 ${answered} / ${items.length} 題。展開題目可查看歷次提交與評測結果。`, { answered, total: items.length })
    : t("workspace.review.paperSummary", `已作答 ${answered} / ${items.length} 題。作答狀態不代表伺服器已儲存。`, { answered, total: items.length });

  return (
    <>
      <PageHeader
        title={t("workspace.review.title", "作答檢查")}
        description={items.length ? summary : hasRecords ? t("workspace.review.recordsDescription", "作答紀錄、成績與批改回饋會顯示在這裡。") : undefined}
      />
      {!items.length ? (hasRecords ? null :
        <PageState kind="empty" title={t("workspace.review.emptyTitle", "尚未進入作答")} description={t("workspace.review.emptyDescription", "進入作答後即可逐題檢查狀態。")} />
      ) : (
        <>
          {!isCoding && (
            <div className={styles.reviewStats}>
              <StatusPill tone="success">{t("workspace.status.answered", "已作答")} {answered}</StatusPill>
              <StatusPill tone="neutral">{t("workspace.status.unanswered", "未作答")} {items.length - answered}</StatusPill>
              {marked > 0 && <StatusPill tone="warning">{t("workspace.status.marked", "已標記")} {marked}</StatusPill>}
            </div>
          )}
          <ul className={styles.reviewList}>
            {items.map((item, index) => {
              const id = item.data.id;
              const isAnswered = answeredIds.has(id);
              const isMarked = markedIds?.has(id) ?? false;
              if (item.kind === "question") {
                const label = labels.get(id)?.label ?? String(index + 1);
                return (
                  <li key={id} className={styles.reviewItem}>
                    <button type="button" className={styles.reviewRow} onClick={() => onQuestion(index)}>
                      <span className={styles.reviewBadge} data-answered={isAnswered}>{label}</span>
                      <span className={styles.reviewTitle}>
                        {t("workspace.review.questionTitle", `第 ${label} 題`, { label })}
                        <span className={styles.reviewMeta}>{t(`answering.questionTypes.${item.data.questionType}`)} · {formatScore(item.data.score)} {t("workspace.review.points", "分")}</span>
                      </span>
                      {isMarked && <StatusPill tone="warning">{t("workspace.status.marked", "已標記")}</StatusPill>}
                      <StatusPill tone={isAnswered ? "success" : "neutral"}>{isAnswered ? t("workspace.status.answered", "已作答") : t("workspace.status.unanswered", "未作答")}</StatusPill>
                      <span className={styles.reviewChevron}><ExamWorkspaceIcon name="chevronRight" size={16} /></span>
                    </button>
                  </li>
                );
              }
              const open = expanded.has(id);
              const status = codingStatus(item.data, isAnswered, t);
              const historyId = `exam-review-history-${id}`;
              return (
                <li key={id} className={styles.reviewItem}>
                  <div className={styles.reviewRowGroup}>
                    <button type="button" className={styles.reviewRow} aria-expanded={open} aria-controls={historyId} onClick={() => toggle(id)}>
                      <span className={styles.reviewToggle} data-open={open}><ExamWorkspaceIcon name="chevronRight" size={16} /></span>
                      <span className={styles.reviewBadge} data-answered={status.tone === "success"}>{item.data.label}</span>
                      <span className={styles.reviewTitle}>
                        {item.data.title}
                        <span className={styles.reviewMeta}>
                          {t("workspace.review.submissionCount", `提交 ${item.data.submissionCount ?? 0} 次`, { count: item.data.submissionCount ?? 0 })}
                          {item.data.maxScore != null && <> · {formatScore(item.data.maxScore)} {t("workspace.review.points", "分")}</>}
                        </span>
                      </span>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </button>
                    <button type="button" className={styles.textButton} aria-label={t("workspace.review.resumeLabel", `繼續作答：${item.data.title}`, { title: item.data.title })} onClick={() => onQuestion(index)}>
                      {t("workspace.review.resume", "繼續作答")}
                    </button>
                  </div>
                  <div id={historyId} hidden={!open} className={styles.reviewHistory}>
                    {open && (
                      <ContestProblemSubmissions
                        contestId={contest.id}
                        codingProblemId={item.data.problemId}
                        emptyState={<p className={styles.historyEmpty}>{t("workspace.review.noSubmissions", "尚無提交紀錄。測試或繳交後，評測結果會顯示在這裡。")}</p>}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {hasRecords && <div ref={recordsRef} className={styles.reviewRecords} />}
    </>
  );
}

/* ---------- standings ---------- */

function StandingsPanel({ contest }: { contest: ContestDetail }) {
  const { t } = useTranslation("contest");
  const standings = useQuery({
    queryKey: ["examWorkspaceStandings", contest.id],
    queryFn: () => getContestStandings(contest.id),
  });
  const refresh = (
    <button type="button" className={styles.textButton} onClick={() => void standings.refetch()} disabled={standings.isFetching}>
      <ExamWorkspaceIcon name="refresh" size={15} />
      {standings.isFetching ? t("workspace.standings.refreshing", "更新中") : t("workspace.standings.refresh", "更新")}
    </button>
  );
  const rows = standings.data?.rows ?? [];
  return (
    <>
      <PageHeader title={t("workspace.standings.title", "排行榜")} description={t("workspace.standings.description", "依通過題數與分數排序，評測完成後更新。")} actions={refresh} />
      {standings.isPending ? (
        <PageState kind="loading" title={t("workspace.standings.loading", "載入排行榜")} />
      ) : standings.isError ? (
        <PageState kind="error" title={t("workspace.standings.failed", "排行榜載入失敗")} onRetry={() => void standings.refetch()} />
      ) : !rows.length ? (
        <PageState kind="empty" title={t("workspace.standings.empty", "目前沒有排名資料")} description={t("workspace.standings.emptyDescription", "有人通過評測後就會出現在這裡。")} />
      ) : (
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("workspace.standings.rank", "名次")}</th>
                <th scope="col">{t("workspace.standings.student", "學生")}</th>
                <th scope="col" data-numeric>{t("workspace.standings.solved", "通過")}</th>
                <th scope="col" data-numeric>{t("workspace.standings.score", "分數")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td><span className={styles.rank} data-top={row.rank <= 3}>{row.rank}</span></td>
                  <td>{row.displayName}</td>
                  <td data-numeric>{row.solvedCount}</td>
                  <td data-numeric>{formatScore(row.totalScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
