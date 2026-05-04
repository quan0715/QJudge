import { useEffect, useState, type ComponentType } from "react";
import {
  Button,
  FluidDropdown,
  SkeletonPlaceholder,
  SkeletonText,
  TableToolbarSearch,
  Tag,
} from "@carbon/react";
import { Close } from "@carbon/icons-react";
import type { ChangeEvent } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import {
  type QuestionDetailMock,
  type QuestionSummaryMock,
} from "@/features/contest/components/admin/statistics/contestResultDashboard.mock";
import { useContestResultDashboard } from "@/features/contest/components/admin/statistics/useContestResultDashboard";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import { resolveExamQuestionTypeFromRaw } from "@/shared/ui/questionVisual";
import styles from "./AdminQuestionStatsGallery.module.scss";

interface AdminQuestionStatsGalleryProps {
  contest: ContestDetail | null | undefined;
  refreshKey?: number;
}

type AttentionToneKey = "critical" | "warning" | "success";
type FocusMetricKey = "score_rate" | "missing_rate" | "zero_rate";
type FilterOption = { id: string; label: string };

const focusMetrics: Array<{
  key: FocusMetricKey;
  label: string;
  description: string;
}> = [
  {
    key: "score_rate",
    label: "得分率",
    description: "低得分率優先",
  },
  {
    key: "missing_rate",
    label: "未作答率",
    description: "未作答比例高優先",
  },
  {
    key: "zero_rate",
    label: "零分率",
    description: "零分比例高優先",
  },
];

export default function AdminQuestionStatsGallery({
  contest,
  refreshKey = 0,
}: AdminQuestionStatsGalleryProps) {
  const [focusMetric, setFocusMetric] = useState<FocusMetricKey>("score_rate");
  const [searchQuery, setSearchQuery] = useState("");
  const [questionKindFilter, setQuestionKindFilter] = useState<string>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const {
    data: dashboard,
    loading,
    error,
    loadQuestionDetail,
    detailLoadingIds,
    detailErrors,
  } = useContestResultDashboard(contest, refreshKey);

  useEffect(() => {
    if (!selectedQuestionId) return;
    void loadQuestionDetail(selectedQuestionId);
  }, [loadQuestionDetail, selectedQuestionId]);

  useEffect(() => {
    if (!selectedQuestionId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedQuestionId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedQuestionId]);

  if (contest?.contestType === "coding") return null;

  if (loading) {
    return (
      <section className={styles.root} aria-label="各題作答數據">
        <GalleryHeader
          focusMetric={focusMetric}
          onFocusMetricChange={setFocusMetric}
        />
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className={styles.skeletonCard} key={index}>
              <SkeletonText width="4rem" />
              <SkeletonText heading width="80%" />
              <SkeletonText width="60%" />
              <SkeletonPlaceholder className={styles.progressSkeleton} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !dashboard) {
    return (
      <section className={styles.root} aria-label="各題作答數據">
        <GalleryHeader
          focusMetric={focusMetric}
          onFocusMetricChange={setFocusMetric}
        />
        <div className={styles.emptyState}>{error ?? "無法載入題目資料"}</div>
      </section>
    );
  }

  const questionKindOptions: FilterOption[] = [
    { id: "all", label: "全部題型" },
    ...Array.from(new Set(dashboard.questions.map((question) => question.kind)))
      .sort()
      .map((kind) => ({
        id: kind,
        label: getQuestionVisual(kind).label,
      })),
  ];
  const selectedQuestionKind =
    questionKindOptions.find((item) => item.id === questionKindFilter) ??
    questionKindOptions[0];
  const sortedQuestions = dashboard.questions
    .filter((question) => {
      if (
        questionKindFilter !== "all" &&
        question.kind !== questionKindFilter
      ) {
        return false;
      }
      const normalizedQuery = searchQuery.trim().toLowerCase();
      if (!normalizedQuery) return true;
      return [
        `Q${question.order}`,
        question.title,
        getQuestionVisual(question.kind).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) =>
      compareQuestionsByFocusMetric(
        a,
        b,
        focusMetric,
        dashboard.contest.participantCount,
      ),
    );
  const selectedQuestion =
    sortedQuestions.find(
      (question) => question.questionId === selectedQuestionId,
    ) ?? null;
  const selectedDetail = selectedQuestionId
    ? (dashboard.details[selectedQuestionId] ?? null)
    : null;
  const selectedDetailLoading = selectedQuestionId
    ? Boolean(detailLoadingIds[selectedQuestionId])
    : false;
  const selectedDetailError = selectedQuestionId
    ? (detailErrors[selectedQuestionId] ?? null)
    : null;

  return (
    <section className={styles.root} aria-label="各題作答數據">
      <GalleryHeader
        count={sortedQuestions.length}
        focusMetric={focusMetric}
        onFocusMetricChange={setFocusMetric}
        searchQuery={searchQuery}
        onSearchChange={(event) => {
          if (event === "") {
            setSearchQuery("");
            return;
          }
          setSearchQuery(event.target.value);
        }}
        questionKindOptions={questionKindOptions}
        selectedQuestionKind={selectedQuestionKind}
        onQuestionKindChange={(kind) => setQuestionKindFilter(kind)}
      />
      {sortedQuestions.length === 0 ? (
        <div className={styles.emptyState}>目前沒有題目資料</div>
      ) : (
        <div className={styles.grid}>
          {sortedQuestions.map((question) => (
            <QuestionStatsCard
              key={question.questionId}
              question={question}
              participantCount={dashboard.contest.participantCount}
              focusMetric={focusMetric}
              onOpen={() => setSelectedQuestionId(question.questionId)}
            />
          ))}
        </div>
      )}
      {selectedQuestion ? (
        <QuestionStatsDrawer
          question={selectedQuestion}
          detail={selectedDetail}
          loading={selectedDetailLoading}
          error={selectedDetailError}
          onClose={() => setSelectedQuestionId(null)}
        />
      ) : null}
    </section>
  );
}

function GalleryHeader({
  count,
  focusMetric,
  onFocusMetricChange,
  searchQuery = "",
  onSearchChange,
  questionKindOptions = [],
  selectedQuestionKind,
  onQuestionKindChange,
}: {
  count?: number;
  focusMetric: FocusMetricKey;
  onFocusMetricChange: (metric: FocusMetricKey) => void;
  searchQuery?: string;
  onSearchChange?: (event: "" | ChangeEvent<HTMLInputElement>) => void;
  questionKindOptions?: FilterOption[];
  selectedQuestionKind?: FilterOption;
  onQuestionKindChange?: (kind: string) => void;
}) {
  const selectedMetric = focusMetrics.find((item) => item.key === focusMetric);
  return (
    <div className={styles.header}>
      <div>
        <h3>各題作答數據</h3>
        <p>{selectedMetric?.description ?? "切換關注指標查看題目狀態。"}</p>
      </div>
      <div className={styles.headerActions}>
        {typeof count === "number" ? (
          <Tag type="cool-gray" size="sm">
            {count} 題
          </Tag>
        ) : null}
        <div className={styles.focusGroup} role="group" aria-label="關注數據">
          {focusMetrics.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.focusButton} ${
                item.key === focusMetric ? styles.focusButtonActive : ""
              }`}
              aria-pressed={item.key === focusMetric}
              onClick={() => onFocusMetricChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {onSearchChange && onQuestionKindChange ? (
        <div className={styles.filterToolbar}>
          <TableToolbarSearch
            id="overview-question-stats-search"
            labelText="搜尋題目"
            placeholder="搜尋題號或題目"
            value={searchQuery}
            onChange={onSearchChange}
            persistent
            size="md"
          />
          <FluidDropdown
            id="overview-question-kind-filter"
            titleText="題型"
            label="題型"
            items={questionKindOptions}
            itemToString={(item: FilterOption | null) => item?.label ?? ""}
            selectedItem={selectedQuestionKind ?? null}
            onChange={({ selectedItem }) =>
              onQuestionKindChange(
                (selectedItem as FilterOption | null)?.id ?? "all",
              )
            }
            size="md"
          />
        </div>
      ) : null}
    </div>
  );
}

function QuestionStatsCard({
  question,
  participantCount,
  focusMetric,
  onOpen,
}: {
  question: QuestionSummaryMock;
  participantCount: number;
  focusMetric: FocusMetricKey;
  onOpen: () => void;
}) {
  const questionVisual = getQuestionVisual(question.kind);
  const missingPercent =
    participantCount > 0
      ? Math.round((question.missingCount / participantCount) * 100)
      : 0;
  const focus = getQuestionFocusMetric(question, participantCount, focusMetric);

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cardMeta}>
        <div className={styles.cardMetaLeft}>
          {questionVisual.Icon ? <questionVisual.Icon size={14} /> : null}
          <span>Q{question.order}</span>
          <span>{questionVisual.label}</span>
        </div>
      </div>
      <h4 className={styles.cardTitle}>{question.title}</h4>
      <div className={styles.statRow}>
        <span>
          平均 {question.averageScore.toFixed(1)} / {question.maxScore}
        </span>
        <span>{question.answerCount} 人作答</span>
        <span>
          未作答 {question.missingCount} 人
          {missingPercent > 0 ? ` · ${missingPercent}%` : ""}
        </span>
      </div>
      <RateBar label={focus.label} value={focus.value} tone={focus.tone} />
    </button>
  );
}

function QuestionStatsDrawer({
  question,
  detail,
  loading,
  error,
  onClose,
}: {
  question: QuestionSummaryMock;
  detail: QuestionDetailMock | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const questionVisual = getQuestionVisual(question.kind);
  const maxBandValue = detail
    ? Math.max(...detail.scoreBands.map((band) => band.count), 0)
    : 0;

  return (
    <div className={styles.drawerLayer}>
      <button
        type="button"
        className={styles.drawerBackdrop}
        aria-label="關閉題目作答數據背景"
        onClick={onClose}
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Q${question.order} 作答數據`}
      >
        <div className={styles.drawerHeader}>
          <div>
            <h3>
              {questionVisual.Icon ? <questionVisual.Icon size={18} /> : null}Q
              {question.order} · {questionVisual.label}
            </h3>
            <p>{question.title}</p>
          </div>
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={Close}
            iconDescription="關閉題目作答數據"
            onClick={onClose}
          />
        </div>
        <div className={styles.drawerMetrics}>
          <div>
            <span>平均</span>
            <strong>
              {question.averageScore.toFixed(1)} / {question.maxScore}
            </strong>
          </div>
          <div>
            <span>作答</span>
            <strong>{question.answerCount}</strong>
          </div>
          <div>
            <span>未作答</span>
            <strong>{question.missingCount}</strong>
          </div>
        </div>
        {loading ? (
          <div
            className={styles.drawerSkeleton}
            data-testid="question-drawer-skeleton"
          >
            <SkeletonText heading width="8rem" />
            <SkeletonText width="100%" />
            <SkeletonText width="70%" />
            <SkeletonPlaceholder className={styles.drawerBarSkeleton} />
            <SkeletonPlaceholder className={styles.drawerBarSkeleton} />
          </div>
        ) : error ? (
          <div className={styles.drawerEmptyState}>{error}</div>
        ) : detail ? (
          <div className={styles.drawerBody}>
            {isSubjectiveDetail(detail) ? (
              <section className={styles.drawerSection}>
                <div className={styles.drawerSectionHeader}>
                  <h4>批改進度</h4>
                  <span>
                    {detail.gradingProgress.graded} /{" "}
                    {detail.gradingProgress.total}
                  </span>
                </div>
                <RateBar
                  label="批改率"
                  value={
                    detail.gradingProgress.total > 0
                      ? (detail.gradingProgress.graded /
                          detail.gradingProgress.total) *
                        100
                      : 0
                  }
                  tone={
                    detail.gradingProgress.graded < detail.gradingProgress.total
                      ? "warning"
                      : "success"
                  }
                />
              </section>
            ) : null}
            {isObjectiveDetail(detail) ? (
              <section className={styles.drawerSection}>
                <h4>選項分布</h4>
                <MetricRows
                  rows={detail.optionDistribution.map((option) => ({
                    key: option.label,
                    label: option.label,
                    value: option.count,
                    maxValue: Math.max(
                      ...detail.optionDistribution.map((item) => item.count),
                      0,
                    ),
                    meta: `${option.count} · ${option.percent}%`,
                    tone: option.isCorrect ? "success" : "default",
                  }))}
                  emptyText="目前沒有選項資料"
                />
              </section>
            ) : null}
            <section className={styles.drawerSection}>
              <h4>分數分布</h4>
              <MetricRows
                rows={detail.scoreBands.map((band) => ({
                  key: band.label,
                  label: band.label,
                  value: band.count,
                  maxValue: maxBandValue,
                  meta: `${band.count}`,
                  tone: "default",
                }))}
                emptyText="目前沒有已批改分數"
              />
            </section>
          </div>
        ) : (
          <div
            className={styles.drawerSkeleton}
            data-testid="question-drawer-skeleton"
          >
            <SkeletonText heading width="8rem" />
            <SkeletonText width="100%" />
            <SkeletonPlaceholder className={styles.drawerBarSkeleton} />
          </div>
        )}
      </aside>
    </div>
  );
}

function MetricRows({
  rows,
  emptyText,
}: {
  rows: Array<{
    key: string;
    label: string;
    value: number;
    maxValue: number;
    meta: string;
    tone: "default" | "success";
  }>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <div className={styles.drawerEmptyState}>{emptyText}</div>;
  }

  return (
    <div className={styles.metricRows}>
      {rows.map((row) => (
        <div className={styles.metricRow} key={row.key}>
          <div className={styles.metricRowHeader}>
            <span>{row.label}</span>
            <strong>{row.meta}</strong>
          </div>
          <div className={styles.metricTrack}>
            <div
              className={`${styles.metricFill} ${
                row.tone === "success" ? styles.metricFillSuccess : ""
              }`}
              style={{
                width: `${row.maxValue > 0 ? (row.value / row.maxValue) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RateBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: AttentionToneKey;
}) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className={styles.rateBar}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(boundedValue)}
    >
      <div className={styles.rateBarHeader}>
        <span>{label}</span>
        <strong>{Math.round(boundedValue)}%</strong>
      </div>
      <div className={styles.rateBarTrack}>
        <div
          className={`${styles.rateBarFill} ${
            tone === "critical"
              ? styles.rateBarFillCritical
              : tone === "warning"
                ? styles.rateBarFillWarning
                : styles.rateBarFillSuccess
          }`}
          style={{ width: `${boundedValue}%` }}
        />
      </div>
    </div>
  );
}

function getQuestionVisual(kind: QuestionSummaryMock["kind"]): {
  Icon: ComponentType<{ size?: number; className?: string }> | null;
  label: string;
} {
  const examType = resolveExamQuestionTypeFromRaw(kind);
  if (!examType) {
    return {
      Icon: null,
      label: kind,
    };
  }
  return {
    Icon: EXAM_QUESTION_TYPE_ICON[examType] ?? null,
    label: getQuestionTypeLabel(examType),
  };
}

function getQuestionFocusMetric(
  question: QuestionSummaryMock,
  participantCount: number,
  focusMetric: FocusMetricKey,
): {
  tone: AttentionToneKey;
  label: string;
  value: number;
} {
  if (focusMetric === "missing_rate") {
    const value =
      participantCount > 0
        ? (question.missingCount / participantCount) * 100
        : 0;
    return {
      label: "未作答率",
      value,
      tone: getHighRiskTone(value, 20, 1),
    };
  }

  if (focusMetric === "zero_rate") {
    return {
      label: "零分率",
      value: question.zeroRate,
      tone: getHighRiskTone(question.zeroRate, 30, 10),
    };
  }

  return {
    label: "得分率",
    value: question.scoreRate,
    tone: getLowScoreTone(question.scoreRate),
  };
}

function getLowScoreTone(value: number): AttentionToneKey {
  let tone: AttentionToneKey = "success";

  if (value < 50) {
    tone = "critical";
  } else if (value < 75) {
    tone = "warning";
  }

  return tone;
}

function getHighRiskTone(
  value: number,
  criticalAt: number,
  warningAt: number,
): AttentionToneKey {
  if (value >= criticalAt) return "critical";
  if (value >= warningAt) return "warning";
  return "success";
}

function compareQuestionsByFocusMetric(
  left: QuestionSummaryMock,
  right: QuestionSummaryMock,
  focusMetric: FocusMetricKey,
  participantCount: number,
) {
  if (focusMetric === "missing_rate") {
    const leftValue =
      participantCount > 0 ? left.missingCount / participantCount : 0;
    const rightValue =
      participantCount > 0 ? right.missingCount / participantCount : 0;
    return rightValue - leftValue || left.order - right.order;
  }

  if (focusMetric === "zero_rate") {
    return right.zeroRate - left.zeroRate || left.order - right.order;
  }

  return left.scoreRate - right.scoreRate || left.order - right.order;
}

function isObjectiveDetail(
  detail: QuestionDetailMock,
): detail is Extract<
  QuestionDetailMock,
  { kind: "single_choice" | "multiple_choice" | "true_false" }
> {
  return (
    detail.kind === "single_choice" ||
    detail.kind === "multiple_choice" ||
    detail.kind === "true_false"
  );
}

function isSubjectiveDetail(
  detail: QuestionDetailMock,
): detail is Extract<QuestionDetailMock, { kind: "short_answer" | "essay" }> {
  return detail.kind === "short_answer" || detail.kind === "essay";
}
