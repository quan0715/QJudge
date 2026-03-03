import React, { useEffect, useMemo, useCallback } from "react";
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
} from "@carbon/icons-react";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { useInterval } from "@/shared/hooks/useInterval";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import {
  useCountdownTo,
  usePaperExamQuestions,
  usePaperExamAutoSave,
  hasPaperExamPrecheckPassed,
  syncPaperExamPrecheckGateByStatus,
} from "./hooks";
import type { ExamItem } from "../../types/exam.types";
import styles from "./PaperExamAnswering.module.scss";

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

  const { handleAnswerChange, saveStatus } = usePaperExamAutoSave({ contestId, setAnswers });

  useInterval(() => {
    heartbeat().catch(() => {});
    refreshContest().catch(() => {});
  }, isInProgress ? 30000 : null);

  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      submitExam().finally(() => {
        navigate(`/contests/${contestId}/paper-exam/submit-review`);
      });
    }
  }, [countdown.remaining, isInProgress, contestId, navigate, submitExam]);

  useEffect(() => {
    if (!contestId || contest?.contestType !== "paper_exam") return;
    syncPaperExamPrecheckGateByStatus(contestId, contest.examStatus);

    const precheckPassed = hasPaperExamPrecheckPassed(contestId);

    if (
      contest.examStatus === "not_started" ||
      contest.examStatus === "paused" ||
      (contest.examStatus === "in_progress" && contest.cheatDetectionEnabled && !precheckPassed)
    ) {
      navigate(`/contests/${contestId}/paper-exam/precheck`, { replace: true });
      return;
    }

    if (contest.examStatus === "submitted") {
      navigate(`/contests/${contestId}/paper-exam/submit-review`, { replace: true });
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
        />
      );
    },
    [answers, handleAnswerChange]
  );

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
      toolbarLeft={(
        <>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="返回競賽主頁"
            onClick={() => contestId && navigate(`/contests/${contestId}`)}
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
            onClick={() => contestId && navigate(`/contests/${contestId}/paper-exam/submit-review`)}
          >
            交卷
          </Button>
        </>
      )}
    />
  );
};

export default PaperExamAnsweringScreen;
