import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Tag,
  Loading,
  Tooltip,
} from "@carbon/react";
import {
  ChevronLeft,
  Time,
  SendFilled,
  Recording,
  CheckmarkFilled,
} from "@carbon/icons-react";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { useInterval } from "@/shared/hooks/useInterval";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import {
  useCountdownTo,
  usePaperExamQuestions,
  usePaperExamSaveOnLeave,
  hasExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks";
import type { ExamItem } from "../../types/exam.types";
import styles from "./PaperExamAnswering.module.scss";
import {
  getContestDashboardPath,
  getContestPaperSubmitReviewPath,
  shouldRouteToPrecheck,
  getContestPrecheckPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { exitFullscreen, isFullscreen } from "@/core/usecases/exam";

const SAVE_STATUS_LABEL: Record<string, string> = {
  idle: "",
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
};

const PaperExamAnsweringScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { contestId, contest, heartbeat, submitExam, refreshContest } = usePaperExamFlow();

  const { items, answers, setAnswers, answeredIds, loadingQuestions } =
    usePaperExamQuestions(contestId);

  const isInProgress = contest?.examStatus === "in_progress";
  const countdown = useCountdownTo(contest?.endTime);

  const { markDirty, saveIfDirty, flushAll, saveStatus } = usePaperExamSaveOnLeave({
    contestId,
    answers,
    items,
  });

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      markDirty(questionId);
    },
    [setAnswers, markDirty],
  );

  const handleBlur = useCallback(
    (questionId: string) => {
      void saveIfDirty(questionId);
    },
    [saveIfDirty],
  );

  const handleActiveIndexChange = useCallback(
    (prevIndex: number) => {
      const prevItem = items[prevIndex];
      if (prevItem?.kind === "question") {
        void saveIfDirty(prevItem.data.id);
      }
    },
    [items, saveIfDirty],
  );

  useInterval(() => {
    heartbeat().catch(() => {});
    refreshContest().catch(() => {});
  }, isInProgress ? 30000 : null);

  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      flushAll()
        .then(() => submitExam())
        .finally(() => {
          setAutoSubmitted(true);
          if (isFullscreen()) exitFullscreen().catch(() => {});
        });
    }
  }, [countdown.remaining, isInProgress, contestId, submitExam, flushAll]);

  useEffect(() => {
    if (!contestId || contest?.contestType !== "paper_exam") return;
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);

    const precheckPassed = hasExamPrecheckPassed(contestId);

    if (
      shouldRouteToPrecheck({
        contest,
        precheckPassed,
      })
    ) {
      navigate(getContestPrecheckPath(contestId), { replace: true });
      return;
    }

    if (contest.examStatus === "submitted") {
      setAutoSubmitted(true);
      if (isFullscreen()) exitFullscreen().catch(() => {});
    }
  }, [contest?.contestType, contest?.examStatus, contestId, navigate]);

  const requestedQuestionId = searchParams.get("q");
  const syncIndex = useMemo(() => {
    if (!requestedQuestionId || items.length === 0) return null;
    const index = items.findIndex(
      (item) => item.kind === "question" && item.data.id === requestedQuestionId
    );
    return index >= 0 ? index : null;
  }, [requestedQuestionId, items]);

  const renderItem = useCallback(
    (item: ExamItem, index: number) => {
      if (item.kind !== "question") return null;
      return (
        <ExamQuestionCard
          question={item.data}
          index={index}
          answer={answers[item.data.id]}
          onAnswerChange={handleAnswerChange}
          onBlur={handleBlur}
        />
      );
    },
    [answers, handleAnswerChange, handleBlur]
  );

  if (autoSubmitted) {
    return (
      <div className={styles.centered}>
        <CheckmarkFilled size={48} style={{ color: "var(--cds-support-success)" }} />
        <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>考試已結束，系統已自動交卷</span>
        <Button
          kind="primary"
          onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
          style={{ marginTop: "1rem" }}
        >
          回到競賽主頁
        </Button>
      </div>
    );
  }

  if (loadingQuestions) {
    return (
      <div className={styles.centered}>
        <Loading withOverlay={false} small />
        <span>載入考試題目中...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.centered}>
        <span>此考試尚未設定任何題目</span>
      </div>
    );
  }

  return (
    <PaperExamCore
      items={items}
      answeredIds={answeredIds}
      styles={styles}
      syncIndex={syncIndex}
      renderItem={renderItem}
      onActiveIndexChange={handleActiveIndexChange}
      toolbarLeft={(
        <>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="返回競賽主頁"
            onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
          />
          <span className={styles.title}>{contest?.name ?? "考試"}</span>
          {contest?.cheatDetectionEnabled && (
            <Tooltip label="系統正在監測焦點、全螢幕與分頁切換行為" align="bottom" autoAlign>
              <Tag size="sm" type="red" renderIcon={Recording}>
                監測中
              </Tag>
            </Tooltip>
          )}
          {!isInProgress && (
            <Tag size="sm" type="red">考試未開始</Tag>
          )}
        </>
      )}
      toolbarCenter={(
        <>
          {saveStatus !== "idle" && (
            <span className={`${styles.saveStatus} ${saveStatus === "error" ? styles.saveStatusError : ""}`}>
              {SAVE_STATUS_LABEL[saveStatus]}
            </span>
          )}
          <div className={styles.timer}>
            <Time size={16} />
            <span className={styles.timerText}>{countdown.display}</span>
          </div>
          <Button
            kind="primary"
            size="sm"
            renderIcon={SendFilled}
            onClick={async () => {
              await flushAll();
              if (contestId) navigate(getContestPaperSubmitReviewPath(contestId));
            }}
          >
            交卷
          </Button>
        </>
      )}
    />
  );
};

export default PaperExamAnsweringScreen;
