import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  IconButton,
  InlineLoading,
  InlineNotification,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Search,
  Select,
  SelectItem,
  Tag,
} from "@carbon/react";
import { Document, MachineLearningModel } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useCopilotModels, useCopilotSessions } from "@copilot";
import { selectLatestTodoItems } from "@/features/chatbot/adapters/qJudgeCopilotMessageData";
import type { ExamPaper } from "@/core/entities/contest.entity";
import { getExamPaper } from "@/infrastructure/api/repositories/examPaper.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContest } from "@/features/contest/contexts";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import ExamQuestionPrompt from "@/features/contest/components/exam/ExamQuestionPrompt";
import { MODEL_NOTICE_I18N_KEY, modelAvailabilityNotice } from "@/shared/ai/modelAvailabilityNotice";
import { useToast } from "@/shared/contexts/ToastContext";
import { EmptyState } from "@/shared/ui/EmptyState";
import { useGradingData } from "./grading/useGradingData";
import { isSubjectiveType, type GradingAnswerRow } from "./grading/gradingTypes";
import ScorePolicyMenu from "./grading/components/ScorePolicyMenu";
import { useBatchGrading } from "./grading/batchGrading/useBatchGrading";
import { BatchGradingFilesModal } from "./grading/batchGrading/BatchGradingFilesModal";
import { BatchGradingQuestionNotice } from "./grading/batchGrading/BatchGradingQuestionNotice";
import type { BatchQuestionFiles } from "./grading/batchGrading/batchGradingApi";
import { BATCH_ACTIVE_STATUSES, selectBatchQuestions } from "./grading/batchGrading/batchGradingModel";
import { buildWorkbenchUnits, type GradeDraft } from "./grading/workbench/gradingWorkbenchModel";

import { useAiGradingDrafts } from "./grading/workbench/useAiGradingDrafts";
import { useWorkbenchDrafts } from "./grading/workbench/useWorkbenchDrafts";
import { useQuestionSuggestions } from "./grading/workbench/useQuestionSuggestions";
import {
  buildStudentRows,
  filterStudentRows,
  isPendingSuggestion,
  resolveAnswerSource,
  sortStudentRows,
  type RowSort,
  type ScoreFilter,
  type SourceFilter,
  type WorkbenchStudentRow as StudentRow,
} from "./grading/workbench/workbenchRowModel";
import { compactScore, computeQuestionStats, countOptions } from "./grading/workbench/workbenchStatsModel";
import { WorkbenchStudentRow } from "./grading/workbench/WorkbenchStudentRow";
import { WorkbenchQuestionRail, type RailUnit } from "./grading/workbench/WorkbenchQuestionRail";
import { WorkbenchAiModal, type AiMode, type AiRange } from "./grading/workbench/WorkbenchAiModal";
import styles from "./grading/workbench/GradingWorkbench.module.scss";

type AiScope = "exam" | "question";

export default function ContestGradingWorkbenchScreen({ header }: { header?: ReactNode } = {}) {
  const { t } = useTranslation("contest");
  const { t: tChatbot } = useTranslation("chatbot");
  const { contest } = useContest();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const data = useGradingData();
  const contestId = contest?.id ?? "";
  const resultsPublished = contest?.resultsPublished ?? false;
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sort, setSort] = useState<RowSort>("seat");
  const [expanded, setExpanded] = useState<string | null>(params.get("grading_student"));
  const [drafts, setDrafts] = useWorkbenchDrafts(contestId, String(user?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [aiScope, setAiScope] = useState<AiScope | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [filesState, setFilesState] = useState<{ open: boolean; files?: BatchQuestionFiles; error?: string }>({ open: false });
  const [revertOpen, setRevertOpen] = useState(false);
  const { models, status: modelStatus, error: modelError } = useCopilotModels();
  const { activeSession } = useCopilotSessions();
  const modelNotice = modelAvailabilityNotice({ status: modelStatus, models, error: modelError });
  const batch = useBatchGrading(contestId, data.answers, {
    resultsPublished,
    reloadAnswers: data.reloadAnswers,
  });

  useEffect(() => {
    let active = true;
    setError(undefined);
    setPaper(null);
    if (contestId)
      getExamPaper(contestId)
        .then((next) => active && setPaper(next))
        .catch((err: unknown) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [contestId, retry]);

  const units = useMemo(() => (paper ? buildWorkbenchUnits(paper) : []), [paper]);
  const labels = useMemo(() => buildPaperQuestionLabels(paper?.questions ?? []), [paper]);
  const unit = units.find((item) => item.questions.some((q) => q.id === params.get("grading_question"))) ?? units[0];
  const unitIds = useMemo(() => new Set(unit?.questions.map((q) => q.id)), [unit]);
  const aiDrafts = useAiGradingDrafts(contestId, batch.sessionId,
    batch.units.find((item) => item.question_ids.some((id) => unitIds.has(id))));
  const isGroup = (unit?.questions.length ?? 0) > 1;
  const objective = unit ? unit.questions.every((q) => !isSubjectiveType(q.questionType)) : false;
  const maxScore =
    unit?.questions.reduce(
      (sum, q) => sum + (data.answers.find((row) => row.questionId === q.id)?.effectiveMaxScore ?? q.score),
      0,
    ) ?? 0;
  const unitAnswers = useMemo(
    () => data.answers.filter((row) => unitIds.has(row.questionId) && !row.isAbsent),
    [data.answers, unitIds],
  );
  const suggestions = useQuestionSuggestions(
    contestId,
    unit && !isGroup && !objective ? unit.questions[0].id : null,
    unitAnswers,
  );
  const ctx = useMemo(
    () => ({ suggestions: suggestions.suggestions }),
    [suggestions.suggestions],
  );
  const allRows = useMemo(() => (unit ? buildStudentRows(unit, data.answers, ctx, data.students) : []), [ctx, data.answers, data.students, unit]);
  const visible = sortStudentRows(
    filterStudentRows(allRows, { score: scoreFilter, source: sourceFilter, search }, maxScore),
    sort,
  );
  const stats = computeQuestionStats(allRows, maxScore);
  const pendingAnswers = unitAnswers.filter((row) => isPendingSuggestion(row, suggestions.suggestions[row.id]));
  const suggestionScores = Object.fromEntries(
    pendingAnswers.map((row) => [
      row.id,
      { score: suggestions.suggestions[row.id].score ?? 0, feedback: suggestions.suggestions[row.id].reason },
    ]),
  );
  const unitStates = batch.questions.filter((state) => unitIds.has(state.questionId));
  const batchQuestions = useMemo(() => selectBatchQuestions(data.answers), [data.answers]);
  const examSummary = {
    questions: batchQuestions.filter((q) => q.ungradedRows.length > 0).length,
    answers: batchQuestions.reduce((sum, q) => sum + q.ungradedRows.length, 0),
  };
  const examRunning = batch.questions.some((state) => BATCH_ACTIVE_STATUSES.includes(state.status));
  // A group's sub-questions run as one job, so one notice speaks for the unit.
  const noticeState = unitStates.find((state) => BATCH_ACTIVE_STATUSES.includes(state.status)) ?? unitStates[0];
  const unitRunning = unitStates.some((state) => BATCH_ACTIVE_STATUSES.includes(state.status)) || suggestions.running;
  const aiBlocked = resultsPublished || Boolean(modelNotice?.blocking);

  const update = (values: Record<string, string>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) => next.set(key, value));
        return next;
      },
      { replace: true },
    );
  const openRow = (studentId: string | null) => {
    setExpanded(studentId);
    if (studentId) update({ grading_student: studentId });
  };
  const clearDrafts = (row: StudentRow) =>
    setDrafts((previous) => {
      const next = { ...previous };
      row.answers.forEach((answer) => delete next[answer.id]);
      return next;
    });
  const nextOf = (row: StudentRow) => visible[visible.findIndex((item) => item.studentId === row.studentId) + 1];

  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);

  const run = async (task: () => Promise<void>) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await task();
    } catch (err) {
      showToast({
        kind: "error",
        title: t("grading.saveFailed", "儲存評分失敗，請重試"),
        subtitle: err instanceof Error ? err.message : String(err),
      });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const save = (row: StudentRow) =>
    run(async () => {
      const next = nextOf(row);
      const edited = row.answers.filter((answer) => drafts[answer.id] || (answer.score === null && aiDrafts.scores[answer.id]));
      for (const answer of edited) {
        const value = drafts[answer.id] ?? aiDrafts.scores[answer.id];
        await data.gradeAnswer(answer.id, value.score, value.feedback);
        setDrafts((previous) => {
          const rest = { ...previous };
          delete rest[answer.id];
          return rest;
        });
      }
      if (edited.length) showToast({ kind: "success", title: t("workbench.saved", "評分已儲存") });
      openRow(next?.studentId ?? null);
    });

  const adoptEntries = (answers: GradingAnswerRow[]) =>
    answers.map((answer) => ({
      row: answer,
      score: drafts[answer.id]?.score ?? suggestionScores[answer.id].score,
      feedback: drafts[answer.id]?.feedback ?? suggestionScores[answer.id].feedback,
    }));

  const adopt = (row: StudentRow) =>
    run(async () => {
      const next = nextOf(row);
      await suggestions.adopt(adoptEntries(row.answers.filter((answer) => suggestionScores[answer.id])));
      clearDrafts(row);
      await data.reloadAnswers();
      openRow(next?.studentId ?? null);
    });

  const skip = (row: StudentRow) =>
    run(async () => {
      const next = nextOf(row);
      await suggestions.skip(row.answers.filter((answer) => suggestionScores[answer.id]).map((answer) => answer.id));
      clearDrafts(row);
      openRow(next?.studentId ?? null);
    });

  const adoptAll = () =>
    run(async () => {
      await suggestions.adopt(adoptEntries(pendingAnswers));
      setDrafts((previous) => {
        const next = { ...previous };
        pendingAnswers.forEach((answer) => delete next[answer.id]);
        return next;
      });
      await data.reloadAnswers();
      showToast({ kind: "success", title: t("workbench.adoptedAll", "已採用 {{count}} 份建議", { count: pendingAnswers.length }) });
    });

  const startAi = async ({
    mode,
    range,
    modelId,
    newSession,
  }: {
    mode: AiMode;
    range: AiRange;
    modelId?: string;
    newSession: boolean;
  }) => {
    if (!unit) return;
    if (aiScope === "exam") {
      if (!batch.sessionId || newSession) return batch.start(modelId);
      return batch.startQuestion(
        batchQuestions.filter((q) => q.ungradedRows.length > 0).map((q) => q.questionId),
        modelId,
      );
    }
    if (mode === "suggest") {
      const targets =
        range === "ungraded"
          ? unitAnswers.filter((row) => row.score === null)
          : unitAnswers.filter((row) => resolveAnswerSource(row, ctx) !== "manual");
      return suggestions.start(targets, modelId);
    }
    const questionIds = unit.questions.map((q) => q.id);
    if (range === "ungraded") {
      return newSession
        ? batch.startQuestion(questionIds, modelId, { newSession: true })
        : batch.startQuestion(questionIds, modelId);
    }
    const revertable = unitAnswers.filter((row) => batch.aiWrittenAnswerIds.has(row.id)).length;
    const ungraded = unitAnswers.filter((row) => row.score === null).length;
    if (revertable + ungraded === 0) {
      throw new Error(t("workbench.nothingToRegrade", "這題沒有 AI 寫入的分數可以重改"));
    }
    if (!batch.sessionId) return batch.startQuestion(questionIds, modelId);
    return batch.regradeQuestion(questionIds[0], undefined, modelId);
  };

  const railUnits: RailUnit[] = units.map((item) => {
    const students = buildStudentRows(item, data.answers, ctx, data.students);
    const states = batch.questions.filter((state) => item.questions.some((q) => q.id === state.questionId));
    const aiStatus = states.some((state) => state.status === "running" || state.status === "awaiting-approval")
      ? "running"
      : states.some((state) => state.status === "queued")
        ? "queued"
        : states.some((state) => state.status === "failed")
          ? "failed"
          : undefined;
    const draft = batch.units?.find((entry) => item.questions.some((q) => entry.question_ids.includes(q.id))
      && states.every((state) => !state.runId || state.runId === entry.run_id));
    const progress = `${students.filter((row) => row.total !== null).length}/${students.length}`;
    return {
      id: item.id,
      label: t("workbench.questionNumber", "{{number}}.", { number: item.label }),
      aiProgress: progress,
      title: item.title,
      questionType: item.questions[0]?.groupId ? undefined : item.questions[0]?.questionType,
      activity: { progress: draft?.total_count ? draft.draft_count / draft.total_count * 100 : 0, label: draft ? `草稿已完成 ${draft.draft_count}/${draft.total_count}` : "等待批改草稿" },
      progress,
      aiStatus,
    };
  });
  const startedUnits = units.map((item) =>
    batch.questions.filter((state) => item.questions.some((q) => q.id === state.questionId)),
  ).filter((states) => states.some((state) => state.status !== "idle" && state.status !== "skipped"));
  const completedUnits = startedUnits.filter((states) =>
    states.every((state) => state.status === "completed" || state.status === "skipped"),
  ).length;

  if (error)
    return (
      <div className={styles.empty}>
        {header}
        <InlineNotification kind="error" title={error} hideCloseButton />
        <Button onClick={() => setRetry((n) => n + 1)}>{t("workbench.retry", "重新載入")}</Button>
      </div>
    );
  if (data.loading || !paper)
    return (
      <div className={styles.empty}>
        {header}
        <InlineLoading description={t("grading.loading", "載入批改資料...")} />
      </div>
    );
  if (!unit)
    return (
      <div className={styles.empty}>
        {header}
        <EmptyState title={t("grading.noAnswers", "尚無作答資料")} />
      </div>
    );

  const ungradedCount = unitAnswers.filter((row) => row.score === null).length;
  const regradeCount = unitAnswers.filter((row) => !["manual", "auto"].includes(resolveAnswerSource(row, ctx))).length;
  const expandedRow = visible.find((row) => row.studentId === expanded);
  const optionCounts = objective ? countOptions(unitAnswers) : [];
  const sourceOptions: SourceFilter[] = objective
    ? ["all", "auto", "manual"]
    : ["all", "none", "ai", "manual", ...(pendingAnswers.length ? (["suggestion"] as const) : [])];
  const sourceLabel: Record<SourceFilter, string> = {
    all: t("workbench.filterAll", "全部"),
    auto: t("workbench.filterAuto", "自動批改"),
    none: t("workbench.filterNone", "未批改"),
    ai: t("workbench.filterAi", "AI 給分"),
    manual: t("workbench.filterManual", "人工確認"),
    suggestion: t("workbench.filterSuggestion", "待審建議"),
    unanswered: t("workbench.noAnswer", "未作答"),
  };
  const firstState = unitStates.find((state) => state.runId);
  // AI actions share the header's one overflow menu (with the score policies on single questions).
  const hasAiMenu = !objective && Boolean(firstState);
  const aiRubricItems = hasAiMenu
    ? [
        <OverflowMenuItem
          key="rubric"
          itemText={t("workbench.rubric", "AI 評分標準")}
          onClick={async () => {
            if (!firstState) return;
            setFilesState({ open: true });
            try {
              setFilesState({ open: true, files: await batch.loadQuestionFiles(firstState.questionId) });
            } catch (err) {
              setFilesState({ open: true, error: err instanceof Error ? err.message : String(err) });
            }
          }}
        />,
      ]
    : [];
  const aiRevertItems = hasAiMenu
    ? [
        <OverflowMenuItem
          key="revert"
          isDelete
          hasDivider
          disabled={unitRunning}
          itemText={t("workbench.revert", "撤回此題 AI 分數")}
          onClick={() => setRevertOpen(true)}
        />,
      ]
    : [];
  const aiMenuItems = [...aiRubricItems, ...aiRevertItems];

  return (
    <div className={styles.root}>
      <WorkbenchQuestionRail
        header={header}
        units={railUnits}
        activeId={unit.id}
        disabled={saving}
        examAi={{
          state: examRunning ? "running" : "idle",
          completedUnits,
          totalUnits: startedUnits.length,
          progressText: startedUnits.length
            ? t("workbench.examProgress", "{{done}}/{{total}} 題", {
                done: completedUnits,
                total: startedUnits.length,
              })
            : "",
          canStart: !aiBlocked && examSummary.answers > 0,
          todos:
            examRunning && activeSession.status === "ready" && activeSession.data.id === batch.sessionId
              ? selectLatestTodoItems(activeSession.data.messages)
              : undefined,
          disabledReason: resultsPublished ? t("grading.batch.publishedDisabled") : undefined,
        }}
        onSelect={(id) => {
          const target = units.find((item) => item.id === id);
          if (!target) return;
          update({ grading_question: target.questions[0].id });
          setExpanded(null);
          setScoreFilter("all");
          setSourceFilter("all");
        }}
        onStartExam={() => setAiScope("exam")}
        onStopExam={() => void batch.stop()}
      />
      <main
        className={styles.main}
        onKeyDown={(event) => {
          if (
            expandedRow &&
            !saving &&
            !event.nativeEvent.isComposing &&
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey)
          ) {
            event.preventDefault();
            void (expandedRow.source === "suggestion" ? adopt(expandedRow) : save(expandedRow));
          }
        }}
      >
        <header className={styles.header}>
          <h1 title={unit.title}>
            {t("workbench.questionNumber", "{{number}}.", { number: unit.label })}
            <span className={styles.headerTitle}>{unit.title}</span>
          </h1>
          <div className={styles.headerActions}>
            {objective ? (
              <Tag type="teal">{t("workbench.autoGraded", "自動批改")}</Tag>
            ) : (
              <Button
                kind="tertiary"
                size="md"
                renderIcon={MachineLearningModel}
                disabled={aiBlocked || unitRunning || examRunning}
                onClick={() => setAiScope("question")}
              >
                {unitRunning ? t("workbench.aiRunningShort", "AI 批改中…") : t("workbench.questionAi", "AI 批改這題")}
              </Button>
            )}
            <IconButton kind="ghost" label={t("workbench.questionContext", "題目與參考答案")} onClick={() => setQuestionOpen(true)}>
              <Document />
            </IconButton>
            {isGroup && aiMenuItems.length > 0 && (
              <OverflowMenu aria-label={t("workbench.aiMenu", "AI 操作")} iconDescription={t("workbench.aiMenu", "AI 操作")} flipped>
                {aiMenuItems}
              </OverflowMenu>
            )}
            {!isGroup && (
              <ScorePolicyMenu
                leadingItems={aiRubricItems}
                trailingItems={aiRevertItems}
                menuLabel={aiMenuItems.length ? t("workbench.moreActions", "更多操作") : undefined}
                questionId={unit.questions[0].id}
                questionIndex={unit.questions[0].order + 1}
                questionLabel={labels.get(unit.questions[0].id)?.label}
                currentPolicy={unit.questions[0].scorePolicy ?? "normal"}
                allQuestions={(paper.questions ?? []).map((q) => ({
                  id: q.id,
                  order: q.order,
                  questionLabel: labels.get(q.id)?.label,
                  prompt: q.prompt,
                  score: q.score,
                  questionType: q.questionType,
                  scorePolicy: q.scorePolicy,
                }))}
                onPolicyChanged={data.refreshData}
                impactContext={{
                  questions: data.questionProgress,
                  studentIds: data.students.map((student) => student.studentId),
                  answersByStudent: data.answersByStudent,
                }}
              />
            )}
          </div>
        </header>

        {modelNotice && !objective && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={tChatbot(MODEL_NOTICE_I18N_KEY[modelNotice.kind])}
          />
        )}
        {(batch.error || suggestions.error || aiDrafts.error) && (
          <InlineNotification kind="error" lowContrast hideCloseButton title={batch.error ?? suggestions.error ?? aiDrafts.error ?? ""} />
        )}
        {noticeState && <BatchGradingQuestionNotice state={noticeState} />}
        {suggestions.running && (
          <InlineNotification kind="info" lowContrast hideCloseButton title={t("workbench.suggesting", "AI 正在產生建議")} />
        )}
        {pendingAnswers.length > 0 && (
          <div className={styles.suggestionBar} role="status">
            <span>{t("workbench.pending", "AI 建議 {{count}} 份待審查", { count: pendingAnswers.length })}</span>
            <Button
              kind="ghost"
              size="sm"
              onClick={() => setSourceFilter(sourceFilter === "suggestion" ? "all" : "suggestion")}
            >
              {sourceFilter === "suggestion" ? t("workbench.showAll", "顯示全部") : t("workbench.onlyPending", "只看待審")}
            </Button>
            <Button kind="ghost" size="sm" disabled={saving} onClick={() => void adoptAll()}>
              {t("workbench.adoptAll", "全部採用")}
            </Button>
          </div>
        )}

        <section className={styles.stats} aria-label={t("workbench.stats", "作答統計")}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t("workbench.average", "平均分數")}</span>
            <span className={styles.statValue}>
              <span>{stats.average === null ? "—" : String(Math.round(stats.average * 10) / 10)}</span>
              <span className={styles.statMax}> / {compactScore(maxScore)}</span>
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t("workbench.rate", "得分率")}</span>
            <span className={styles.statValue}>{stats.rate === null ? "—" : `${Math.round(stats.rate * 100)}%`}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t("workbench.graded", "已批改")}</span>
            <span className={styles.statValue}>{`${stats.graded} / ${stats.total}`}</span>
          </div>
          {objective && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t("workbench.options", "選項分布")}</span>
              <span className={styles.statValue}>
                {optionCounts.map((item) => `${item.label}${item.correct ? "✓" : ""} ${item.count}`).join(" · ")}
              </span>
            </div>
          )}
        </section>

        <div className={styles.filters}>
          <Search
            size="md"
            labelText={t("workbench.search", "搜尋學生")}
            placeholder={t("workbench.search", "搜尋學生")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            id="workbench-score-filter"
            labelText={t("workbench.scoreFilter", "分數")}
            value={scoreFilter}
            onChange={(event) => setScoreFilter(event.target.value as ScoreFilter)}
          >
            <SelectItem value="all" text={t("workbench.filterAll", "全部")} />
            <SelectItem value="zero" text={t("workbench.filterZero", "0 分")} />
            <SelectItem value="partial" text={t("workbench.filterPartial", "部分給分")} />
            <SelectItem value="full" text={t("workbench.filterFull", "滿分")} />
          </Select>
          <Select
            id="workbench-source-filter"
            labelText={t("workbench.sourceFilter", "來源")}
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
          >
            {sourceOptions.map((value) => (
              <SelectItem key={value} value={value} text={sourceLabel[value]} />
            ))}
          </Select>
          <Select
            id="workbench-sort"
            labelText={t("workbench.sort", "排序")}
            value={sort}
            onChange={(event) => setSort(event.target.value as RowSort)}
          >
            <SelectItem value="seat" text={t("workbench.sortSeat", "學生順序")} />
            <SelectItem value="asc" text={t("workbench.sortAsc", "分數低到高")} />
            <SelectItem value="desc" text={t("workbench.sortDesc", "分數高到低")} />
          </Select>
          <span className={styles.count}>
            {t("workbench.count", "顯示 {{shown}} / {{total}} 份", { shown: visible.length, total: allRows.length })}
          </span>
        </div>

        <section className={styles.list} aria-label={t("workbench.answers", "作答")}>
          <div className={styles.listHead} aria-hidden="true">
            <span>{t("workbench.student", "學生")}</span>
            <span>{t("workbench.scoreLabel", "分數")}</span>
            <span>{objective ? t("workbench.answer", "作答") : t("workbench.comment", "評語")}</span>
            <span>{t("workbench.sourceHeader", "來源")}</span>
          </div>
          {visible.map((row) => (
            <WorkbenchStudentRow
              key={row.studentId}
              row={row}
              questions={unit.questions}
              labels={labels}
              maxScore={maxScore}
              expanded={expanded === row.studentId}
              drafts={drafts}
              suggestionScores={suggestionScores}
              aiDraftScores={aiDrafts.scores}
              busy={saving}
              aiRunning={unitRunning}
              onToggle={() => openRow(expanded === row.studentId ? null : row.studentId)}
              onDraftChange={(answerId, draft: GradeDraft) => setDrafts((previous) => ({ ...previous, [answerId]: draft }))}
              onPrimary={() => void (row.source === "suggestion" ? adopt(row) : save(row))}
              onSecondary={() => {
                if (row.source === "suggestion") void skip(row);
                else {
                  clearDrafts(row);
                  setExpanded(null);
                }
              }}
            />
          ))}
          {!visible.length && (
            <EmptyState title={t("grading.noMatchingStudents", "沒有符合搜尋條件的學生")} compact />
          )}
        </section>
      </main>

      <WorkbenchAiModal
        open={aiScope !== null}
        scope={aiScope ?? "question"}
        title={
          aiScope === "exam"
            ? t("workbench.examAi", "AI 批改整份考卷")
            : t("workbench.questionAiTitle", "AI 批改 {{number}}.", { number: unit.label })
        }
        examSummary={examSummary}
        ungradedCount={ungradedCount}
        regradeCount={regradeCount}
        suggestAvailable={!isGroup}
        hasSession={Boolean(batch.sessionId)}
        onClose={() => setAiScope(null)}
        onConfirm={startAi}
      />
      <Modal
        open={questionOpen}
        passiveModal
        size="lg"
        modalHeading={t("workbench.questionContext", "題目與參考答案")}
        onRequestClose={() => setQuestionOpen(false)}
      >
        <div className={styles.questionContext}>
          {unit.sharedStem && <ExamQuestionPrompt content={unit.sharedStem} emptyText="—" compact />}
          {unit.questions.map((question) => (
            <section key={question.id}>
              <h3>
                {labels.get(question.id)?.label} · {t("workbench.points", "{{count}} 分", { count: question.score })}
              </h3>
              <ExamQuestionPrompt content={question.prompt} emptyText="—" compact />
              <AnswerDisplay
                questionType={question.questionType}
                answerFormat={question.answerFormat}
                showAnswerContent={false}
                answerContent={{}}
                options={question.options}
                correctAnswer={question.correctAnswer}
                explanation={question.explanation}
                referenceAnswerDocument={question.referenceAnswerDocument}
                explanationDocument={question.explanationDocument}
              />
            </section>
          ))}
        </div>
      </Modal>
      {firstState && (
        <BatchGradingFilesModal
          open={filesState.open}
          state={firstState}
          files={filesState.files}
          error={filesState.error}
          onClose={() => setFilesState({ open: false })}
        />
      )}
      <Modal
        open={revertOpen}
        danger
        size="sm"
        modalHeading={t("grading.batch.revertTitle", { label: t("workbench.questionNumber", "{{number}}.", { number: unit.label }) })}
        primaryButtonText={t("grading.batch.revertConfirm")}
        secondaryButtonText={t("grading.batch.cancel")}
        onRequestClose={() => setRevertOpen(false)}
        onRequestSubmit={async () => {
          setRevertOpen(false);
          await run(async () => {
            for (const state of unitStates.filter((item) => item.runId)) await batch.revertQuestion(state.questionId);
          });
        }}
      >
        <p>{t("grading.batch.revertBody")}</p>
      </Modal>
    </div>
  );
}
